#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time

# The desktop app can reuse a worktree folder for a new session. Git keeps
# ignored files on checkout, so HANDOFF.md of the old session stays. Only
# /clear, compaction, resume and fork continue a session, so a HANDOFF.md
# found at a new start is stale. The hook moves it into the git dir and does
# not delete it, because the user can want to continue the old work.

def git(cwd, *args):
    result = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def main():
    event = json.load(sys.stdin)
    if event.get("source") != "startup":
        return
    top = git(event.get("cwd") or os.getcwd(), "rev-parse", "--show-toplevel")
    if not top:
        return
    path = os.path.join(top, "HANDOFF.md")
    if not os.path.isfile(path):
        return
    stale_dir = os.path.join(git(top, "rev-parse", "--absolute-git-dir"), "stale-handoffs")
    os.makedirs(stale_dir, exist_ok=True)
    target = os.path.join(stale_dir, f"HANDOFF-{time.strftime('%Y%m%d-%H%M%S')}.md")
    os.replace(path, target)
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": (
                f"This folder had a HANDOFF.md from an earlier session. It was moved to {target}. "
                "Read it only if the user asks to continue earlier work."
            ),
        }
    }))


if __name__ == "__main__":
    main()
