import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { zstdCompressSync } from "node:zlib";

import { costUsd, parseOfficialPrices } from "../scripts/pricing.mjs";
import { consumeLine, freshState } from "../scripts/rollout.mjs";

const SCAN = fileURLToPath(new URL("../scripts/scan.mjs", import.meta.url));
const T0 = Date.parse("2026-11-10T12:00:00Z");
const at = (ms) => new Date(T0 + ms).toISOString();
const usage = (input, extra = {}) => ({ input_tokens: input, output_tokens: 0, ...extra });
const meta = (id, fork, ordinal) => ({ type: "session_meta", timestamp: at(100), payload: { id, forked_from_id: fork, forked_from_ordinal_exclusive: ordinal } });
const count = (total, ms, ordinal) => ({ timestamp: at(ms), ordinal, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage(total) } } });
const exact = (id, input, total, ms, thread) => ({
  timestamp: at(ms),
  type: "token_usage_record",
  payload: { thread_id: thread, response_id: id, usage: usage(input), thread_token_usage: usage(total) },
});
const settings = (thread, thread_settings) => ({ type: "event_msg", payload: { type: "thread_settings_applied", thread_id: thread, thread_settings } });
const body = (...records) => records.map((record) => JSON.stringify(record)).join("\n") + "\n";

/** The tokens the records add up to, with each receipt key counted once and each replaced estimate dropped. */
function total(...files) {
  const seen = new Map();
  for (const records of files) {
    const state = freshState();
    for (const record of records) {
      const out = consumeLine(state, JSON.stringify(record));
      for (const receipt of out.receipts) if (!seen.has(receipt.key)) seen.set(receipt.key, receipt.tokens.input + receipt.tokens.output);
      for (const alias of out.aliases) seen.set(alias.estimate, 0);
    }
  }
  return [...seen.values()].reduce((sum, tokens) => sum + tokens, 0);
}

function scan(home, prices) {
  const args = ["--sessions", join(home, "sessions"), "--sessions", join(home, "archived_sessions"), "--cache", join(home, "cache.json")];
  return JSON.parse(execFileSync(process.execPath, [SCAN, ...args, ...(prices ? ["--prices", prices] : [])], { encoding: "utf8" }));
}

function withHome(run) {
  const home = mkdtempSync(join(tmpdir(), "sprout-scan-"));
  mkdirSync(join(home, "sessions"));
  mkdirSync(join(home, "archived_sessions"));
  try {
    run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("a running total that goes down starts a new count, so the work after it still counts", () => {
  assert.equal(total([count(100, 0), count(0, 1), count(20, 2), count(20, 3)]), 120);
});

test("once a file has exact receipts, its running total adds nothing", () => {
  const records = [meta("a"), count(100, 0), exact("r1", 20, 120, 1, "a"), count(5000, 2), exact("r2", 30, 150, 3, "a"), count(0, 4), count(9000, 5)];
  assert.equal(total(records), 150);
});

test("an exact receipt that comes after its estimate replaces it", () => {
  assert.equal(total([meta("a"), count(100, 0), exact("r1", 100, 100, 1, "a"), count(100, 2)]), 100);
});

test("the receipts a fork copies from its parent count once", () => {
  const parent = [meta("parent"), count(100, 0), exact("r1", 20, 120, 1, "parent"), count(120, 2), exact("r2", 30, 150, 3, "parent"), count(150, 4)];
  const child = [meta("child", "parent"), exact("r1", 20, 120, 1, "parent"), exact("r2", 30, 150, 3, "parent"), exact("r3", 40, 190, 101, "child"), count(190, 102)];
  assert.equal(total(parent, child), 190);
});

test("a sub-agent's file, which holds a copy of its parent's session_meta, counts each request once", () => {
  const child = [meta("child", "parent"), meta("parent"), settings("child", { model: "m" }), exact("c1", 70, 70, 110, "child"), count(70, 111), exact("c2", 80, 150, 120, "child"), count(150, 121)];
  assert.equal(total(child), 150);
});

test("a full settings record without a tier removes the tier; a turn_context without one keeps it", () => {
  const state = freshState();
  const tierOf = (...records) => records.flatMap((record) => consumeLine(state, JSON.stringify(record)).receipts).at(-1).tier;
  assert.equal(tierOf(settings(undefined, { model: "m", service_tier: "priority" }), { type: "turn_context", payload: { model: "m" } }, count(1000, 0)), "priority");
  assert.equal(tierOf(settings(undefined, { model: "m" }), count(2000, 1)), null);
});

test("the scan reads archived zstd files, takes a fork from where it left its parent, and reads only what a file gained", () => {
  withHome((home) => {
    const parent = join(home, "archived_sessions/parent.jsonl");
    const child = join(home, "sessions/child.jsonl");
    // The fork is before ordinal 3, though the parent went on to 200 before the child started.
    const history = body(meta("parent"), { type: "turn_context", payload: { model: "m" } }, count(100, 0, 2), count(200, 50, 3));
    writeFileSync(`${parent}.zst`, zstdCompressSync(Buffer.from(history)));
    writeFileSync(child, body(meta("child", "parent", 3), count(120, 101)));
    assert.equal(scan(home).totals.tokens, 220);

    writeFileSync(parent, history);
    assert.equal(scan(home).totals.tokens, 220, "the .jsonl and its .jsonl.zst are one session");

    appendFileSync(child, body(exact("late", 20, 120, 102, "child")));
    assert.equal(scan(home).totals.tokens, 220, "the exact receipt replaces the estimate of the same request");

    const before = statSync(join(home, "cache.json")).mtimeMs;
    scan(home);
    assert.equal(statSync(join(home, "cache.json")).mtimeMs, before, "no change in the logs, no write");
  });
});

test("a fork whose parent is not on disk does not count what it inherited", () => {
  withHome((home) => {
    writeFileSync(join(home, "sessions/child.jsonl"), body(meta("child", "gone"), count(100, 101), count(120, 102)));
    assert.equal(scan(home).totals.tokens, 20);
  });
});

test("the scan prints fresh input, cache reads and cost by the tier of each request", () => {
  withHome((home) => {
    const prices = join(home, "prices.json");
    const rate = { input: 1, cached: 0.1, output: 10 };
    writeFileSync(prices, JSON.stringify({ version: 1, sourceUrl: "", fetchedAt: Date.now() + 1e9, models: { m: { ...rate, tiers: { fast: { input: 2, cached: 0.2, output: 20 } } } } }));
    const request = (id, tier) => [
      settings("a", { model: "m", ...(tier ? { service_tier: tier } : {}) }),
      { timestamp: at(1), type: "token_usage_record", payload: { thread_id: "a", response_id: id, usage: { input_tokens: 1_000_000, cached_input_tokens: 400_000, output_tokens: 100_000 } } },
    ];
    writeFileSync(join(home, "sessions/a.jsonl"), body(meta("a"), ...request("r1"), ...request("r2", "priority"), ...request("r3", "unheard-of")));
    const out = scan(home, prices);
    assert.deepEqual(
      { input: out.days[0].input, cacheRead: out.days[0].cacheRead, output: out.days[0].output },
      { input: 1_800_000, cacheRead: 1_200_000, output: 300_000 },
    );
    assert.equal(Number(out.totals.costUsd.toFixed(4)), 1.64 + 3.28);
    assert.deepEqual(out.unpricedModels, ["m (unheard-of)"]);
  });
});

test("the pricing page is read by its headings and column names, with long-context and tier rates", () => {
  const page = `
### Standard
| Model | Input | Cached input | Output |
|---|---|---|---|
| gpt-a | $2 | $0.2 | $8 |
| gpt-b | $1 | - | $4 |
#### Long
| Model | Short context input | Short context cached input | Short context output | Long context input | Long context cached input | Long context output |
|---|---|---|---|---|---|---|
| gpt-c (<272K context length) | $3 | $0.3 | $12 | $6 | $0.6 | $18 |
### Fast
| Model | Input | Cached input | Output |
|---|---|---|---|
| gpt-a | $4 | $0.4 | $16 |
### Something else
| Model | Input | Cached input | Output |
| gpt-a | $99 | $99 | $99 |
`;
  const { models } = parseOfficialPrices(page.replace("#### Long", "### Standard"));
  const tokens = { input: 1_000_000, output: 0, cached: 0, cacheWrite: 0 };
  assert.equal(costUsd(models, { model: "gpt-a", tier: "", isLong: false }, tokens), 2);
  assert.equal(costUsd(models, { model: "gpt-a", tier: "priority", isLong: false }, tokens), 4);
  assert.equal(costUsd(models, { model: "gpt-c-2026-01-01", tier: "default", isLong: true }, tokens), 6);
  assert.equal(costUsd(models, { model: "gpt-b", tier: "", isLong: false }, { ...tokens, cached: 10 }), null, "no cached price, no guess");
  assert.equal(costUsd(models, { model: "gpt-b", tier: "flex", isLong: false }, tokens), null, "no price for the tier, no guess");
  assert.throws(() => parseOfficialPrices("### Standard\n| Model | Input | Cached input | Output |\n| gpt-a | two | - | $1 |"));
});
