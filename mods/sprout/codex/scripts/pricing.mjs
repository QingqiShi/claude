// Prices in USD per million tokens, read from OpenAI's pricing page. A model that is not listed there is not priced.
export const PRICING_URL = "https://developers.openai.com/api/docs/pricing";
export const LONG_PROMPT_TOKENS = 272_000;
const TIERS = ["standard", "fast", "batch", "flex", "ultrafast"];

const isAmount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isRate = (rate) =>
  !!rate &&
  isAmount(rate.input) &&
  isAmount(rate.output) &&
  ["cached", "write"].every((key) => rate[key] == null || isAmount(rate[key]));

export function isCatalog(value) {
  const rates = (price) => [price, price.long, ...Object.values(price.tiers ?? {}).flatMap((tier) => [tier, tier.long])];
  return (
    value?.version === 1 &&
    Number.isFinite(value.fetchedAt) &&
    !!value.models &&
    Object.keys(value.models).length > 0 &&
    Object.values(value.models).every((price) => rates(price).every((rate) => rate === undefined || isRate(rate)))
  );
}

/** Reads the tables by their headings and column names, so a new column or a new tier does not shift a price. */
export function parseOfficialPrices(markdown, now = Date.now()) {
  const models = {};
  let tier = null;
  let columns = [];
  const amount = (raw) => {
    if (raw === "-") return null;
    if (!raw || !/^\$\d+(?:\.\d+)?$/.test(raw)) throw new Error("the pricing page has a value that is not a price");
    return Number(raw.slice(1));
  };
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^#{3,4} (.+)$/)?.[1];
    if (heading) {
      const name = heading.replace(" pricing data", "").toLowerCase();
      tier = TIERS.includes(name) ? name : null;
      columns = [];
    }
    if (!tier || !line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells[0] === "Model") {
      columns = cells.map((cell) => cell.toLowerCase());
      continue;
    }
    const model = cells[0].replace(/ \(<272K context length\)$/, "");
    if (!/^(gpt-[a-z0-9.-]+|o\d[a-z0-9.-]*)$/.test(model)) continue;
    const read = (prefix) => {
      const at = (name) => cells[columns.indexOf(prefix + name)];
      const rate = { input: amount(at("input")), output: amount(at("output")), cached: amount(at("cached input")) };
      if (columns.includes(`${prefix}30m write`)) rate.write = amount(at("30m write"));
      if (!isRate(rate)) throw new Error(`the pricing page has no full price for ${model}`);
      return rate;
    };
    const rate = read(columns.includes("short context input") ? "short context " : "");
    if (columns.includes("long context input") && cells[columns.indexOf("long context input")] !== "-") rate.long = read("long context ");
    if (tier === "standard") models[model] = rate;
    else if (models[model]) (models[model].tiers ??= {})[tier] = rate;
  }
  if (Object.keys(models).length < 3) throw new Error("the pricing page lists no model");
  return { version: 1, sourceUrl: PRICING_URL, fetchedAt: now, models };
}

export async function fetchOfficialPrices(fetcher = fetch) {
  const response = await fetcher(`${PRICING_URL}.md`, { signal: AbortSignal.timeout(6000), headers: { Accept: "text/markdown" } });
  if (!response.ok) throw new Error(`the pricing page answered ${response.status}`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("the pricing page is too large");
  return parseOfficialPrices(text);
}

/** Null when the model, its service tier or its long-context rate has no price. A log without a tier counts as standard. */
export function costUsd(prices, { model, tier, isLong }, { input, output, cached, cacheWrite }) {
  const base = prices[model] ?? prices[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
  const name = tier === "priority" ? "fast" : tier === "default" || !tier ? "standard" : tier;
  const price = name === "standard" ? base : base?.tiers?.[name];
  if (!price) return null;
  if (isLong && base.long && !price.long) return null;
  const rate = isLong && price.long ? price.long : price;
  if ((cached > 0 && rate.cached == null) || (cacheWrite > 0 && rate.write == null)) return null;
  return ((input - cached - cacheWrite) * rate.input + cached * (rate.cached ?? 0) + cacheWrite * (rate.write ?? 0) + output * rate.output) / 1e6;
}
