#!/usr/bin/env python3
# compute-usage.py — Sum token usage across Claude Code session JSONLs and write usage.json.
#
# Usage: compute-usage.py <sessions-dir> <output-usage-json>
#
# Walks <sessions-dir> recursively for *.jsonl, sums tokens per model across
# every assistant message, applies official pricing, and writes a usage.json
# consumable by aggregate.sh.
#
# Pricing reference: https://platform.claude.com/docs/en/about-claude/pricing
# USD per million tokens.

import json
import sys
from pathlib import Path

# Pricing tiers keyed by a name we match via substring.
# Order matters: the first matching entry wins, so list more-specific keys first.
TIERS = [
    ("opus-4-6", {"input": 5.0,  "output": 25.0, "cache_write_5m": 6.25,  "cache_write_1h": 10.0, "cache_read": 0.50}),
    ("opus-4-5", {"input": 5.0,  "output": 25.0, "cache_write_5m": 6.25,  "cache_write_1h": 10.0, "cache_read": 0.50}),
    ("opus-4-1", {"input": 15.0, "output": 75.0, "cache_write_5m": 18.75, "cache_write_1h": 30.0, "cache_read": 1.50}),
    ("opus-4",   {"input": 15.0, "output": 75.0, "cache_write_5m": 18.75, "cache_write_1h": 30.0, "cache_read": 1.50}),
    ("opus-3",   {"input": 15.0, "output": 75.0, "cache_write_5m": 18.75, "cache_write_1h": 30.0, "cache_read": 1.50}),
    ("sonnet-4", {"input": 3.0,  "output": 15.0, "cache_write_5m": 3.75,  "cache_write_1h": 6.0,  "cache_read": 0.30}),
    ("sonnet-3", {"input": 3.0,  "output": 15.0, "cache_write_5m": 3.75,  "cache_write_1h": 6.0,  "cache_read": 0.30}),
    ("haiku-4",  {"input": 1.0,  "output": 5.0,  "cache_write_5m": 1.25,  "cache_write_1h": 2.0,  "cache_read": 0.10}),
    ("haiku-3-5",{"input": 0.80, "output": 4.0,  "cache_write_5m": 1.0,   "cache_write_1h": 1.60, "cache_read": 0.08}),
    ("haiku-3",  {"input": 0.25, "output": 1.25, "cache_write_5m": 0.30,  "cache_write_1h": 0.50, "cache_read": 0.03}),
]


def resolve_rates(model: str):
    m = (model or "").lower().replace(".", "-")
    for key, rates in TIERS:
        if key in m:
            return key, rates
    # Unknown model — refuse to guess. aggregate.sh will see a zero cost entry
    # and the per-model block will flag the unknown name for investigation.
    return None, None


def sum_usage(sessions_dir: Path) -> dict:
    per_model: dict[str, dict] = {}
    total_records = 0
    unknown_models: set[str] = set()

    for jsonl in sorted(sessions_dir.rglob("*.jsonl")):
        with open(jsonl) as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                msg = entry.get("message") or {}
                usage = msg.get("usage")
                if not usage:
                    continue

                model = msg.get("model", "unknown")
                bucket = per_model.setdefault(
                    model,
                    {
                        "input": 0,
                        "output": 0,
                        "cache_write_5m": 0,
                        "cache_write_1h": 0,
                        "cache_read": 0,
                    },
                )
                bucket["input"] += usage.get("input_tokens", 0) or 0
                bucket["output"] += usage.get("output_tokens", 0) or 0
                bucket["cache_read"] += usage.get("cache_read_input_tokens", 0) or 0

                # cache_creation can be an object split by TTL; otherwise fall back to flat field.
                cc = usage.get("cache_creation")
                if isinstance(cc, dict):
                    bucket["cache_write_5m"] += cc.get("ephemeral_5m_input_tokens", 0) or 0
                    bucket["cache_write_1h"] += cc.get("ephemeral_1h_input_tokens", 0) or 0
                else:
                    # No TTL split available — treat as 5m (the cheaper bucket) to avoid overcharging.
                    bucket["cache_write_5m"] += usage.get("cache_creation_input_tokens", 0) or 0

                total_records += 1

    total_cost = 0.0
    total_input = 0
    total_output = 0
    total_cache_write = 0
    total_cache_read = 0
    per_model_out = {}

    for model, toks in per_model.items():
        tier_key, rates = resolve_rates(model)
        if rates is None:
            unknown_models.add(model)
            cost = 0.0
        else:
            cost = (
                toks["input"] * rates["input"]
                + toks["output"] * rates["output"]
                + toks["cache_write_5m"] * rates["cache_write_5m"]
                + toks["cache_write_1h"] * rates["cache_write_1h"]
                + toks["cache_read"] * rates["cache_read"]
            ) / 1_000_000

        per_model_out[model] = {
            **toks,
            "tier": tier_key or "unknown",
            "cost_usd": round(cost, 4),
        }
        total_cost += cost
        total_input += toks["input"]
        total_output += toks["output"]
        total_cache_write += toks["cache_write_5m"] + toks["cache_write_1h"]
        total_cache_read += toks["cache_read"]

    result = {
        "total_cost_usd": round(total_cost, 4),
        "input_tokens": total_input,
        "output_tokens": total_output,
        "cache_write_tokens": total_cache_write,
        "cache_read_tokens": total_cache_read,
        "assistant_records": total_records,
        "per_model": per_model_out,
    }
    if unknown_models:
        result["unknown_models"] = sorted(unknown_models)
    return result


def main():
    if len(sys.argv) != 3:
        print("Usage: compute-usage.py <sessions-dir> <output-usage-json>", file=sys.stderr)
        sys.exit(1)

    sessions_dir = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    if not sessions_dir.is_dir():
        print(f"Error: sessions dir not found: {sessions_dir}", file=sys.stderr)
        sys.exit(1)

    usage = sum_usage(sessions_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(usage, f, indent=2)

    print(
        f"Wrote {output_path}: ${usage['total_cost_usd']} "
        f"({usage['input_tokens']:,} in / {usage['output_tokens']:,} out, "
        f"{usage['assistant_records']} records)"
    )
    if "unknown_models" in usage:
        print(f"  WARNING: unknown models (priced as $0): {usage['unknown_models']}", file=sys.stderr)


if __name__ == "__main__":
    main()
