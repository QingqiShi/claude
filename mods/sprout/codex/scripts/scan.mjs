#!/usr/bin/env node
// The usage scan for Codex. It prints the same JSON as ../../scripts/scan.mjs, so the pane reads both the same way.
import fs from "node:fs";
import path from "node:path";
import { createZstdDecompress } from "node:zlib";
import { LONG_PROMPT_TOKENS, costUsd, fetchOfficialPrices, isCatalog } from "./pricing.mjs";
import { consumeLine, freshState } from "./rollout.mjs";

const CACHE_VERSION = 1;
const MAX_LINE = 16 * 1024 * 1024;
const PRICES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const out = { sessions: [] };
  for (let i = 2; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, "");
    if (name === "sessions") out.sessions.push(path.resolve(argv[i + 1]));
    else out[name] = argv[i + 1];
  }
  if (!out.sessions.length || !out.cache) {
    console.error("usage: scan.mjs --sessions <dir> [--sessions <dir>...] --cache <file> [--prices <file>]");
    process.exit(2);
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
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
    else if (e.isFile() && /\.jsonl(\.zst)?$/.test(e.name)) yield full;
  }
}

/** Yields each whole line with the offset after it. A line longer than MAX_LINE (an inline image) comes out empty. */
async function* linesOf(file, start, end) {
  const input = fs.createReadStream(file, { start, ...(end === undefined ? {} : { end }), highWaterMark: 256 * 1024 });
  const stream = file.endsWith(".zst") ? input.pipe(createZstdDecompress()) : input;
  if (stream !== input) input.on("error", (error) => stream.destroy(error));
  let parts = [];
  let length = 0;
  let offset = start;
  try {
    for await (const chunk of stream) {
      let from = 0;
      for (;;) {
        const nl = chunk.indexOf(10, from);
        const part = chunk.subarray(from, nl < 0 ? chunk.length : nl);
        length += part.length;
        if (length <= MAX_LINE) parts.push(part);
        else parts = [];
        if (nl < 0) break;
        offset += length + 1;
        yield { line: length <= MAX_LINE ? Buffer.concat(parts).toString("utf8") : "", offset };
        parts = [];
        length = 0;
        from = nl + 1;
      }
    }
  } finally {
    stream.destroy();
    input.destroy();
  }
}

function localDay(ms) {
  const d = new Date(ms);
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? "0" : ""}${m}-${dd < 10 ? "0" : ""}${dd}`;
}

// Bucket layout: [input, output, cached, cacheWrite, requests]. The key is model|tier|long, where long is 1, 0 or empty when unknown.
function addToDay(cache, entry, sign) {
  const [day, key, ...tokens] = entry;
  const b = ((cache.days[day] ??= {})[key] ??= [0, 0, 0, 0, 0]);
  for (let i = 0; i < 4; i++) b[i] += sign * tokens[i];
  b[4] += sign;
}

// Entry layout: [day, bucketKey, input, output, cached, cacheWrite]. A receipt that an exact one replaced stays as 0, so a copy of it in a fork does not count.
function record(cache, receipt) {
  const { tokens } = receipt;
  const long = receipt.promptTokens === null ? "" : receipt.promptTokens > LONG_PROMPT_TOKENS ? 1 : 0;
  const entry = [localDay(receipt.at), `${receipt.model}|${receipt.tier ?? ""}|${long}`, tokens.input, tokens.output, tokens.cached, tokens.cacheWrite];
  const previous = cache.seen[receipt.key];
  if (previous === 0) return;
  if (previous) {
    if (!previous[1].startsWith("unknown|") || receipt.model === "unknown") return;
    addToDay(cache, previous, -1);
  }
  cache.seen[receipt.key] = entry;
  addToDay(cache, entry, 1);
}

function forget(cache, key) {
  const previous = cache.seen[key];
  if (previous) addToDay(cache, previous, -1);
  cache.seen[key] = 0;
}

/** The running total of a thread where a fork left it: before `ordinal` when the fork names one, else at `at`. */
async function totalAtFork(files, thread, at, ordinal, visiting = new Set()) {
  const file = files.get(thread);
  if (!file || visiting.has(thread)) return null;
  visiting.add(thread);
  let state = freshState();
  let inherited = null;
  let best = null;
  try {
    for await (const { line } of linesOf(file, 0)) {
      if (state.fork && !state.lane && inherited === null) inherited = (await totalAtFork(files, state.fork, state.forkAt, state.forkOrdinal, visiting)) ?? false;
      for (const point of consumeLine(state, line, inherited || null).checkpoints) {
        if (point.thread !== thread) continue;
        const isBefore = ordinal === null ? point.at <= at : point.ordinal !== null && point.ordinal < ordinal;
        if (isBefore) best = point.total;
      }
    }
  } catch {}
  return best;
}

async function threadOf(file) {
  try {
    for await (const { line } of linesOf(file, 0)) {
      const state = freshState();
      consumeLine(state, line);
      return state.thread;
    }
  } catch {}
  return "";
}

async function loadPrices(file) {
  const bundled = readJson(new URL("./openai-prices.json", import.meta.url));
  const saved = file ? readJson(file) : null;
  let catalog = isCatalog(saved) && saved.fetchedAt >= bundled.fetchedAt ? saved : bundled;
  if (file && Date.now() - catalog.fetchedAt > PRICES_MAX_AGE_MS) {
    try {
      catalog = await fetchOfficialPrices();
      writeJson(file, catalog);
    } catch (error) {
      console.error(`prices not refreshed: ${error.message}`);
    }
  }
  return catalog.models;
}

function buildOutput(cache, prices) {
  const unpriced = new Set();
  const days = [];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, costUsd: 0, messages: 0, cacheHitRate: 0 };
  for (const day of Object.keys(cache.days).sort()) {
    const row = { day, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, messages: 0 };
    for (const [key, b] of Object.entries(cache.days[day])) {
      if (b[4] <= 0) continue;
      const [model, tier, long] = key.split("|");
      const cost = costUsd(prices, { model, tier, isLong: long === "1" }, { input: b[0], output: b[1], cached: b[2], cacheWrite: b[3] });
      if (cost === null) unpriced.add(tier ? `${model} (${tier})` : model);
      // Codex counts the cached and cache-write tokens inside the input. The pane wants the three apart.
      row.input += b[0] - b[2] - b[3];
      row.output += b[1];
      row.cacheRead += b[2];
      row.cacheWrite += b[3];
      row.messages += b[4];
      row.costUsd += cost ?? 0;
    }
    if (row.messages <= 0) continue;
    days.push(row);
    for (const k of ["input", "output", "cacheRead", "cacheWrite", "costUsd", "messages"]) totals[k] += row[k];
  }
  totals.tokens = totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
  const prompt = totals.input + totals.cacheRead + totals.cacheWrite;
  totals.cacheHitRate = prompt > 0 ? totals.cacheRead / prompt : 0;
  return { version: 1, generatedAt: new Date().toISOString(), firstDay: days.length ? days[0].day : null, days, totals, unpricedModels: [...unpriced].sort() };
}

async function main() {
  const args = parseArgs(process.argv);
  const loaded = readJson(args.cache);
  const cache = loaded?.cacheVersion === CACHE_VERSION ? loaded : { cacheVersion: CACHE_VERSION, files: {}, seen: {}, days: {} };

  // A session is a .jsonl while it runs and a .jsonl.zst after Codex archives it. Both are one file here.
  const sources = new Map();
  for (const root of new Set(args.sessions)) {
    for (const source of walk(root)) {
      const key = source.replace(/\.zst$/, "");
      if (!sources.has(key) || !source.endsWith(".zst")) sources.set(key, source);
    }
  }
  const threads = new Map();
  for (const [key, source] of sources) {
    const thread = cache.files[key]?.state.thread ?? (await threadOf(source));
    if (thread) threads.set(thread, source);
  }

  let isChanged = false;
  for (const [key, source] of sources) {
    let st;
    try {
      st = fs.statSync(source);
    } catch {
      continue;
    }
    const prev = cache.files[key];
    const isFound = prev?.state.isForkIncomplete && threads.has(prev.state.fork);
    if (prev && !isFound && prev.source === source && st.size === prev.size && st.mtimeMs === prev.mtimeMs) continue;
    const isZst = source.endsWith(".zst");
    const isMore = prev && !isFound && prev.source === source && !isZst && st.size > prev.size && st.mtimeMs >= prev.mtimeMs;
    const state = isMore ? prev.state : freshState();
    let offset = isMore ? prev.offset : 0;
    let inherited = null;
    try {
      for await (const next of linesOf(source, offset, isZst ? undefined : st.size - 1)) {
        if (state.fork && !state.lane && inherited === null) inherited = (await totalAtFork(threads, state.fork, state.forkAt, state.forkOrdinal)) ?? false;
        const out = consumeLine(state, next.line, inherited || null);
        for (const receipt of out.receipts) record(cache, receipt);
        for (const alias of out.aliases) forget(cache, alias.estimate);
        offset = next.offset;
      }
      if (inherited) state.isForkIncomplete = false;
      cache.files[key] = { source, size: st.size, mtimeMs: st.mtimeMs, offset, state };
      isChanged = true;
    } catch (error) {
      console.error(`skip ${source}: ${error.message}`);
    }
  }
  if (isChanged) writeJson(args.cache, cache);
  process.stdout.write(JSON.stringify(buildOutput(cache, await loadPrices(args.prices))) + "\n");
}

await main();
