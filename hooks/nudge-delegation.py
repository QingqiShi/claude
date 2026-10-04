#!/usr/bin/env python3
import json
import os
import sys
import tempfile

THRESHOLD = 6
BLOCK_STAGE = 5
BLOCK_AT = THRESHOLD * BLOCK_STAGE
EXCLUDED_TOOLS = {
    "Skill", "ToolSearch", "AskUserQuestion", "SendMessage", "TaskOutput", "TaskStop", "Monitor",
}
ALLOWED_TOOLS = ", ".join(["Agent", *sorted(EXCLUDED_TOOLS)])
STAGES = {
    1: (
        "{count} tool calls in a row by the main agent. Remember the delegation rule: you orchestrate "
        "sub-agents, you do not do the work yourself. Delegate the rest before the next call."
    ),
    2: (
        "{count} tool calls in a row by the main agent now. This is a strong indication you are doing "
        "something wrong. Stop and hand the remaining work to a sub-agent."
    ),
    3: (
        "{count} tool calls in a row by the main agent. The result of each one stays in your context for "
        "the rest of the session, while a sub-agent's report is a paragraph. Delegate the rest unless you "
        "can say why you must see each result yourself."
    ),
    4: (
        "{count} tool calls in a row by the main agent. If you do not delegate now you will be terminated: "
        "at {block} calls every tool is denied except {allowed}, until the user decides."
    ),
    5: (
        "HARD BLOCK. {count} tool calls in a row by the main agent. Every tool is now denied except "
        "{allowed}. Explain to the user why you must see these results yourself instead of reading a "
        "sub-agent's report, then stop and let the user decide whether you continue."
    ),
}
DENY_REASON = (
    "HARD BLOCK. {count} tool calls in a row by the main agent; this call is denied. Explain to the user "
    "why you must see these results yourself instead of reading a sub-agent's report, then stop and let "
    "the user decide whether you continue. The only tools still allowed are {allowed}."
)


def state_dir():
    return os.environ.get("CLAUDE_STRATEGY_NUDGE_DIR") or os.path.join(
        tempfile.gettempdir(), "claude-strategy-nudge"
    )


def state_path(session_id):
    return os.path.join(state_dir(), session_id)


def read_count(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return int(handle.read().strip())
    except (OSError, ValueError):
        return 0


def write_count(path, count):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(str(count))


def is_subagent(payload):
    transcript_path = payload.get("transcript_path") or ""
    if "/subagents/" in transcript_path:
        return True
    return bool(payload.get("agent_id")) or bool(payload.get("agent_type"))


def infer_event(payload):
    if "tool_response" in payload:
        return "PostToolUse"
    if "prompt" in payload and "tool_name" not in payload:
        return "UserPromptSubmit"
    if "tool_name" in payload:
        return "PreToolUse"
    return None


def is_counted(tool_name):
    return tool_name != "Agent" and tool_name not in EXCLUDED_TOOLS


def nudge(message):
    return {"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": message}}


def deny(reason):
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }


def decide(payload):
    if is_subagent(payload):
        return None
    session_id = payload.get("session_id")
    if not session_id:
        return None
    event = payload.get("hook_event_name") or infer_event(payload)
    path = state_path(session_id)
    if event == "UserPromptSubmit":
        write_count(path, 0)
        return None
    tool_name = payload.get("tool_name")
    if event == "PreToolUse":
        count = read_count(path)
        if is_counted(tool_name) and count >= BLOCK_AT:
            return deny(DENY_REASON.format(count=count, allowed=ALLOWED_TOOLS))
        return None
    if event != "PostToolUse":
        return None
    if tool_name == "Agent":
        write_count(path, 0)
        return None
    if not is_counted(tool_name):
        return None
    count = read_count(path) + 1
    write_count(path, count)
    if count % THRESHOLD:
        return None
    stage = min(count // THRESHOLD, BLOCK_STAGE)
    return nudge(STAGES[stage].format(count=count, block=BLOCK_AT, allowed=ALLOWED_TOOLS))


def main():
    try:
        payload = json.load(sys.stdin)
        output = decide(payload)
    except Exception:
        # Bad input must not stop the main agent or nudge it. Stay silent. Exit 0.
        return
    if output is None:
        return
    json.dump(output, sys.stdout)


if __name__ == "__main__":
    main()
