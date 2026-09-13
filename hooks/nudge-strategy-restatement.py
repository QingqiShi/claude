#!/usr/bin/env python3
import json
import os
import sys
import tempfile

THRESHOLD = 6
EXCLUDED_TOOLS = {
    "Skill", "ToolSearch", "AskUserQuestion", "SendMessage", "TaskOutput", "TaskStop", "Monitor",
}


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
    return None


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
    if event != "PostToolUse":
        return None
    tool_name = payload.get("tool_name")
    if tool_name == "Agent":
        write_count(path, 0)
        return None
    if tool_name in EXCLUDED_TOOLS:
        return None
    count = read_count(path) + 1
    write_count(path, count)
    if count % THRESHOLD == 0:
        return (
            f"{count} tool calls by the main agent since the last strategy checkpoint. "
            "Before the next call, restate what you keep, what you delegate, and to which models."
        )
    return None


def main():
    try:
        payload = json.load(sys.stdin)
        message = decide(payload)
    except Exception:
        # Bad input must not stop the main agent or nudge it. Stay silent. Exit 0.
        return
    if message is None:
        return
    json.dump({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": message}}, sys.stdout)


if __name__ == "__main__":
    main()
