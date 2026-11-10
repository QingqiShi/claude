// Reads the token usage out of the records of one Codex rollout file. Prompts, replies and tool output are never kept.
import { createHash } from "node:crypto";

const KEYS = ["input", "output", "cached", "cacheWrite"];
const RELEVANT = /token_count|token_usage_record|thread_settings_applied|turn_context|session_meta/;

const count = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
const zero = () => ({ input: 0, output: 0, cached: 0, cacheWrite: 0 });
const isEqual = (a, b) => KEYS.every((key) => a[key] === b[key]);
const add = (a, b) => Object.fromEntries(KEYS.map((key) => [key, a[key] + b[key]]));
const isOrdinal = (value) => Number.isSafeInteger(value);

/** `input` holds the cached and cache-write tokens too, as Codex reports it. */
export function tokensOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const input = count(raw.input_tokens);
  const cached = Math.min(input, count(raw.cached_input_tokens));
  return { input, output: count(raw.output_tokens), cached, cacheWrite: Math.min(input - cached, count(raw.cache_write_input_tokens)) };
}

export const freshState = () => ({
  model: "unknown",
  tier: null,
  owner: "",
  thread: "",
  fork: "",
  forkAt: 0,
  forkOrdinal: null,
  settings: {},
  lane: null,
  isForkIncomplete: false,
});

/**
 * Takes one line of a rollout file and changes `state`. Returns what the line adds:
 * `receipts` (one request each, with a key that is the same in every copy of the record),
 * `aliases` (an estimate that an exact receipt replaces) and `checkpoints` (the running total of the file).
 * `inherited` is the running total of the parent thread at the point of the fork, when the caller knows it.
 */
export function consumeLine(state, line, inherited = null) {
  const out = { receipts: [], aliases: [], checkpoints: [] };
  if (!RELEVANT.test(line.slice(0, 2048))) return out;
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return out;
  }
  const p = record.payload;
  if (!p || typeof p !== "object") return out;
  if (record.type === "session_meta") {
    // The file of a fork starts with its own session_meta, and then has a copy of each of its parents'. Only the first is this file's.
    if (state.thread) return out;
    state.thread = typeof p.id === "string" ? p.id : "";
    state.owner = state.thread;
    state.fork = typeof p.forked_from_id === "string" ? p.forked_from_id : "";
    state.forkAt = Date.parse(p.timestamp ?? record.timestamp) || 0;
    state.forkOrdinal = isOrdinal(p.forked_from_ordinal_exclusive) ? p.forked_from_ordinal_exclusive : null;
    return out;
  }
  if (record.type === "event_msg" && p.type === "thread_settings_applied") {
    state.owner = typeof p.thread_id === "string" ? p.thread_id : state.thread;
    const settings = p.thread_settings;
    if (!settings || typeof settings !== "object") return out;
    if (typeof settings.model === "string") state.model = settings.model;
    // This record is a full snapshot, so a tier that is not there is a tier that was removed.
    state.tier = typeof settings.service_tier === "string" ? settings.service_tier : null;
    state.settings[state.owner] = { model: state.model, tier: state.tier };
    return out;
  }
  if (record.type === "turn_context") {
    if (typeof p.model === "string") state.model = p.model;
    // Only older clients write the tier here, so a turn_context without one does not change the tier.
    if ("service_tier" in p) state.tier = typeof p.service_tier === "string" ? p.service_tier : null;
    state.settings[state.owner] = { model: state.model, tier: state.tier };
    return out;
  }
  const at = Date.parse(record.timestamp);
  if (!Number.isFinite(at)) return out;
  const isExact = record.type === "token_usage_record";
  if (!isExact && (record.type !== "event_msg" || p.type !== "token_count")) return out;
  const owner = isExact && typeof p.thread_id === "string" ? p.thread_id : state.owner;
  // token_count counts the whole file, with the history a fork copied. thread_token_usage counts the thread alone.
  const lane = (state.lane ??= { previous: zero(), at: 0, isStarted: false, epoch: 0, base: null, isReplaying: !!state.fork, isExact: false, estimate: null });
  const settings =
    state.settings[owner] ?? (owner === state.owner || !state.owner ? { model: state.model, tier: state.tier } : { model: "unknown", tier: null });
  const total = tokensOf(isExact ? p.thread_token_usage : p.info?.total_token_usage);
  const emit = (key, tokens, promptTokens) => out.receipts.push({ key, at, tokens, promptTokens, ...settings });
  const checkpoint = () => out.checkpoints.push({ thread: owner, at, ordinal: isOrdinal(record.ordinal) ? record.ordinal : null, total });

  if (isExact) {
    const tokens = tokensOf(p.usage);
    if (!tokens || typeof p.response_id !== "string" || !p.response_id) return out;
    const key = `response:${p.response_id}`;
    emit(key, tokens, tokens.input);
    const estimate = lane.estimate;
    const isSameTotal = estimate && total && (isEqual(estimate.total, total) || (lane.base && isEqual(estimate.total, add(lane.base, total))));
    if (isSameTotal && isEqual(estimate.tokens, tokens) && Math.abs(at - estimate.at) < 60_000) {
      out.aliases.push({ estimate: estimate.key, exact: key });
      lane.estimate = null;
    }
    if (!state.thread || owner === state.thread) lane.isExact = true;
    return out;
  }

  if (!total || at < lane.at) return out;
  if (lane.isExact) {
    // Once the file has exact receipts, the running total only repeats them.
    Object.assign(lane, { previous: total, at, isStarted: true });
    checkpoint();
    return out;
  }
  if (!lane.isStarted && state.fork && at >= state.forkAt) {
    if (inherited) Object.assign(lane, { previous: inherited, base: inherited });
    else {
      lane.previous = total;
      state.isForkIncomplete = true;
    }
  }
  const isCopied = !!state.fork && (owner !== state.thread || (lane.isReplaying && lane.base !== null && total.input + total.output <= lane.base.input + lane.base.output));
  if (isCopied) {
    Object.assign(lane, { at, isStarted: true });
    if (!lane.base) lane.previous = total;
    return out;
  }
  lane.isReplaying = false;
  const key = `snapshot:${createHash("sha256").update(JSON.stringify([state.thread || at, lane.epoch, total])).digest("hex")}`;
  if (total.input < lane.previous.input || total.output < lane.previous.output) {
    lane.epoch++;
    lane.estimate = null;
  } else {
    const input = total.input - lane.previous.input;
    const output = total.output - lane.previous.output;
    const cached = Math.min(input, Math.max(0, total.cached - lane.previous.cached));
    const tokens = { input, output, cached, cacheWrite: Math.min(input - cached, Math.max(0, total.cacheWrite - lane.previous.cacheWrite)) };
    if (input + output > 0) {
      const last = tokensOf(p.info?.last_token_usage);
      emit(key, tokens, last && isEqual(last, tokens) ? last.input : null);
      lane.estimate = { key, tokens, total, at };
    }
  }
  // A total that went down is the new start, or the work after it would not count.
  Object.assign(lane, { previous: total, at, isStarted: true });
  checkpoint();
  return out;
}
