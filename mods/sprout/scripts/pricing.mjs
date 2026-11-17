// Prices in USD per million tokens. Source: claude-api skill, shared/models.md and shared/model-migration.md (2026-11-03).
// Models that are not listed here are not priced.
// The scan prices the whole history again on each run. When the price of a model changes, do not change its row,
// or the days before the change get the new price too. Make the row a list, and add the new price with the first day that it applies,
// as the row of claude-sonnet-5-5 does.
// Change a row only to correct a price that was wrong from the start.
export const PRICING_VERSION = 1;

const flat = (input, output, cacheRead) => ({ input, output, cacheRead });

export const PRICES = {
  "claude-fable-5-2": flat(8, 40, 0.2),
  "claude-mythos-5-2": flat(8, 40, 0.2),
  "claude-fable-5-1": flat(10, 50, 0.25),
  "claude-mythos-5-1": flat(10, 50, 0.25),
  "claude-fable-5": flat(10, 50, 1),
  "claude-opus-5-5": flat(4, 20, 0.2),
  "claude-opus-5": flat(5, 25, 0.5),
  "claude-opus-4-8": flat(5, 25, 0.5),
  "claude-opus-4-7": flat(5, 25, 0.5),
  "claude-opus-4-6": flat(5, 25, 0.5),
  // Cache reads cost $0.20 until 2026-10-07 (the API release notes of that day).
  "claude-sonnet-5-5": [flat(2, 10, 0.2), { from: "2026-10-07", ...flat(2, 10, 0.1) }],
  "claude-sonnet-5": flat(2, 10, 0.2),
  "claude-sonnet-4-6": flat(3, 15, 0.3),
  "claude-haiku-5-5": flat(0.1, 0.5, 0.01),
  "claude-haiku-4-5": flat(1, 5, 0.1),
  // Haiku 5.5 uses this rate card when the prompt is longer than 100K tokens.
  "claude-haiku-5-5+long": flat(0.5, 2.5, 0.05),
};

export const LONG_PROMPT_TOKENS = 100_000;
const LONG_PROMPT_MODELS = new Set(["claude-haiku-5-5"]);

export function normalizeModel(id) {
  return String(id)
    .replace(/\[1m\]$/i, "")
    .replace(/-\d{8}$/, "");
}

export function priceKey(model, promptTokens) {
  return LONG_PROMPT_MODELS.has(model) && promptTokens > LONG_PROMPT_TOKENS ? `${model}+long` : model;
}

/** The price of `key` on `day`, a YYYY-MM-DD day of the scan: the row with the latest `from` that is not after the day. */
export function priceOn(key, day) {
  let price;
  for (const row of [PRICES[key] ?? []].flat()) {
    const start = row.from ?? "";
    if (start <= day && (!price || start >= (price.from ?? ""))) price = row;
  }
  return price;
}

export function costUsd(p, { input, output, cacheRead, write5m, write1h }) {
  if (!p) return 0;
  return (
    (input * p.input +
      output * p.output +
      write5m * p.input * 1.25 +
      write1h * p.input * 2 +
      cacheRead * p.cacheRead) /
    1e6
  );
}
