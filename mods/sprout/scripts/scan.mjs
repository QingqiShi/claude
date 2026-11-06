#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PRICES, PRICING_VERSION, costUsd, normalizeModel, priceKey } from "./pricing.mjs";

const CACHE_VERSION = 1;
const CHUNK = 8 * 1024 * 1024;
const NEEDLE = Buffer.from('"output_tokens"');
const NL = 10;

function parseArgs(argv) {
  const out = { projects: [] };
  for (let i = 2; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, "");
    if (name === "projects") out.projects.push(argv[i + 1]);
    else out[name] = argv[i + 1];
  }
  if (!out.projects.length || !out.cache) {
    console.error("usage: scan.mjs --projects <dir> [--projects <dir>...] --cache <file>");
    process.exit(2);
  }
  out.projects = out.projects.map((dir) => path.resolve(dir.replace(/^~(?=$|\/)/, os.homedir())));
  return out;
}

function loadCache(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    if (c.cacheVersion === CACHE_VERSION) return c;
  } catch {}
  return { cacheVersion: CACHE_VERSION, pricingVersion: PRICING_VERSION, files: {}, seen: {}, days: {} };
}

function saveCache(file, cache) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, file);
}

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && e.name.endsWith(".jsonl")) yield full;
  }
}

function localDay(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? "0" : ""}${m}-${dd < 10 ? "0" : ""}${dd}`;
}

// Bucket layout: [input, output, cacheRead, write5m, write1h, messages]
function addToDay(cache, day, key, sign, e) {
  const dayBuckets = (cache.days[day] ??= {});
  const b = (dayBuckets[key] ??= [0, 0, 0, 0, 0, 0]);
  b[0] += sign * e[0];
  b[1] += sign * e[1];
  b[2] += sign * e[2];
  b[3] += sign * e[3];
  b[4] += sign * e[4];
  b[5] += sign;
}

// Entry layout: [day, priceKey, input, output, cacheRead, write5m, write1h]
function handleLine(cache, text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return;
  }
  if (obj?.type !== "assistant") return;
  const msg = obj.message;
  const u = msg?.usage;
  if (!u || !msg.model || msg.model === "<synthetic>") return;
  const id = msg.id ? `m:${msg.id}` : obj.requestId ? `r:${obj.requestId}` : null;
  if (!id) return;
  const day = localDay(obj.timestamp);
  if (!day) return;
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const total = u.cache_creation_input_tokens || 0;
  let write5m = total;
  let write1h = 0;
  if (u.cache_creation && typeof u.cache_creation === "object") {
    write1h = u.cache_creation.ephemeral_1h_input_tokens || 0;
    write5m = u.cache_creation.ephemeral_5m_input_tokens || 0;
  }
  const model = normalizeModel(msg.model);
  const key = priceKey(model, input + cacheRead + write5m + write1h);
  const entry = [day, key, input, output, cacheRead, write5m, write1h];
  const prev = cache.seen[id];
  if (prev) {
    if (output <= prev[3]) return;
    addToDay(cache, prev[0], prev[1], -1, prev.slice(2));
  }
  cache.seen[id] = entry;
  addToDay(cache, day, key, 1, entry.slice(2));
}

function scanFile(cache, file, st, from) {
  const fd = fs.openSync(file, "r");
  try {
    const end = fs.fstatSync(fd).size;
    let pos = from;
    let carry = [];
    let carryLen = 0;
    let consumed = from;
    const buf = Buffer.allocUnsafe(CHUNK);
    while (pos < end) {
      const n = fs.readSync(fd, buf, 0, Math.min(CHUNK, end - pos), pos);
      if (n <= 0) break;
      const view = buf.subarray(0, n);
      let start = 0;
      let nl;
      while ((nl = view.indexOf(NL, start)) !== -1) {
        let line;
        if (carryLen) {
          carry.push(Buffer.from(buf.subarray(start, nl)));
          line = Buffer.concat(carry);
          carry = [];
          carryLen = 0;
        } else {
          line = buf.subarray(start, nl);
        }
        if (line.indexOf(NEEDLE) !== -1) handleLine(cache, line.toString("utf8"));
        start = nl + 1;
        consumed = pos + start;
      }
      if (start < n) {
        carry.push(Buffer.from(buf.subarray(start, n)));
        carryLen += n - start;
      }
      pos += n;
    }
    return { size: Math.max(st.size, end), mtimeMs: st.mtimeMs, offset: consumed };
  } finally {
    fs.closeSync(fd);
  }
}

function buildOutput(cache) {
  const unpriced = new Set();
  const days = [];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, costUsd: 0, messages: 0, cacheHitRate: 0 };
  for (const day of Object.keys(cache.days).sort()) {
    const row = { day, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, messages: 0 };
    for (const [key, b] of Object.entries(cache.days[day])) {
      if (b[5] <= 0) continue;
      if (!PRICES[key]) unpriced.add(key);
      row.input += b[0];
      row.output += b[1];
      row.cacheRead += b[2];
      row.cacheWrite += b[3] + b[4];
      row.messages += b[5];
      row.costUsd += costUsd(key, { input: b[0], output: b[1], cacheRead: b[2], write5m: b[3], write1h: b[4] });
    }
    if (row.messages <= 0) continue;
    days.push(row);
    for (const k of ["input", "output", "cacheRead", "cacheWrite", "costUsd", "messages"]) totals[k] += row[k];
  }
  totals.tokens = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
  const denom = totals.input + totals.cacheRead + totals.cacheWrite;
  totals.cacheHitRate = denom > 0 ? totals.cacheRead / denom : 0;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    firstDay: days.length ? days[0].day : null,
    days,
    totals,
    unpricedModels: [...unpriced].sort(),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const cache = loadCache(args.cache);
  cache.pricingVersion = PRICING_VERSION;
  const files = new Set();
  for (const root of new Set(args.projects)) for (const file of walk(root)) files.add(file);
  for (const file of files) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    const prev = cache.files[file];
    let from = 0;
    if (prev) {
      if (st.size === prev.size && st.mtimeMs === prev.mtimeMs) continue;
      if (st.size >= prev.size && st.mtimeMs >= prev.mtimeMs) from = prev.offset;
    }
    try {
      cache.files[file] = scanFile(cache, file, st, from);
    } catch (err) {
      console.error(`skip ${file}: ${err.message}`);
    }
  }
  saveCache(args.cache, cache);
  process.stdout.write(JSON.stringify(buildOutput(cache)) + "\n");
}

main();
