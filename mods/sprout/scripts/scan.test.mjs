import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), "scan.mjs");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-"));
  const projects = path.join(root, "projects");
  fs.mkdirSync(path.join(projects, "a", "sub"), { recursive: true });
  return { projects, cache: path.join(root, "state", "cache.json") };
}

function run(env, tz = "UTC") {
  const r = spawnSync(process.execPath, [SCAN, "--projects", env.projects, "--cache", env.cache], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  return JSON.parse(lines[0]);
}

function line(id, output, extra = {}) {
  const { timestamp = "2026-03-01T12:00:00.000Z", model = "claude-opus-5-5", usage = {} } = extra;
  return (
    JSON.stringify({
      type: "assistant",
      timestamp,
      message: { id, model, usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage } },
    }) + "\n"
  );
}

test("counts a message once across files and keeps the largest output", () => {
  const env = setup();
  fs.writeFileSync(path.join(env.projects, "a", "one.jsonl"), line("m1", 5) + line("m1", 50) + "not json\n");
  fs.writeFileSync(path.join(env.projects, "a", "sub", "two.jsonl"), line("m1", 20) + line("m2", 7));
  const out = run(env);
  assert.equal(out.totals.messages, 2);
  assert.equal(out.totals.output, 57);
  assert.equal(out.totals.input, 20);
});

test("resumes an appended file without double counting and ignores a partial last line", () => {
  const env = setup();
  const file = path.join(env.projects, "a", "s.jsonl");
  fs.writeFileSync(file, line("m1", 5) + line("m2", 6).slice(0, 40));
  assert.equal(run(env).totals.messages, 1);
  fs.writeFileSync(file, line("m1", 5) + line("m2", 6) + line("m3", 7));
  const out = run(env);
  assert.equal(out.totals.messages, 3);
  assert.equal(out.totals.output, 18);
  fs.writeFileSync(file, line("m1", 5));
  fs.utimesSync(file, new Date(0), new Date(0));
  assert.equal(run(env).totals.messages, 3);
});

test("assigns a message to the local day of the machine time zone", () => {
  const env = setup();
  fs.writeFileSync(path.join(env.projects, "a", "s.jsonl"), line("m1", 1, { timestamp: "2026-03-01T23:30:00.000Z" }));
  assert.equal(run(env, "Asia/Tokyo").days[0].day, "2026-03-02");
  fs.rmSync(path.dirname(env.cache), { recursive: true });
  assert.equal(run(env, "America/Los_Angeles").days[0].day, "2026-03-01");
});

test("prices a 1h cache write at 2x input and a 5m write at 1.25x", () => {
  const env = setup();
  const usage = (c5, c1) => ({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: c5 + c1, cache_creation: { ephemeral_5m_input_tokens: c5, ephemeral_1h_input_tokens: c1 } });
  fs.writeFileSync(path.join(env.projects, "a", "s.jsonl"), line("m1", 0, { usage: usage(1e6, 0) }) + line("m2", 0, { usage: usage(0, 1e6) }));
  const out = run(env);
  assert.ok(Math.abs(out.totals.costUsd - (5 + 8)) < 1e-9);
  assert.equal(out.totals.cacheWrite, 2e6);
  const noSplit = setup();
  fs.writeFileSync(path.join(noSplit.projects, "a", "s.jsonl"), line("m1", 0, { usage: { input_tokens: 0, cache_creation_input_tokens: 1e6 } }));
  assert.ok(Math.abs(run(noSplit).totals.costUsd - 5) < 1e-9);
});

test("lists models without a price", () => {
  const env = setup();
  fs.writeFileSync(path.join(env.projects, "a", "s.jsonl"), line("m1", 1, { model: "claude-future-9-9-20270101" }));
  const out = run(env);
  assert.deepEqual(out.unpricedModels, ["claude-future-9-9"]);
  assert.equal(out.totals.costUsd, 0);
});

test("counts a message once across two roots", () => {
  const env = setup();
  const other = path.join(path.dirname(env.projects), "imported");
  fs.mkdirSync(path.join(other, "b"), { recursive: true });
  fs.writeFileSync(path.join(env.projects, "a", "one.jsonl"), line("m1", 5) + line("m2", 7));
  fs.writeFileSync(path.join(other, "b", "two.jsonl"), line("m1", 5) + line("m3", 9));
  const missing = path.join(path.dirname(env.projects), "missing");
  const r = spawnSync(
    process.execPath,
    [SCAN, "--projects", env.projects, "--projects", other, "--projects", missing, "--cache", env.cache],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.totals.messages, 3);
  assert.equal(out.totals.output, 21);
});
