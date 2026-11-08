#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time

# One sidebar session row in the desktop app has one handoff file. The app
# reports "startup" after /clear too, so "source" cannot show a new session
# there. The sidebar row id (CLAUDE_CODE_HOST_SESSION_ID) does not change after
# /clear, so the desktop path keys the file on that id and never moves it.
#
# In a terminal there is no row id, and /clear reports "clear". There, a
# HANDOFF.md found at a new start is from an old session. The hook moves it
# into the git dir and does not delete it, because the user can want to
# continue the old work.

def git(cwd, *args):
    result = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def announce(context):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }))


def announce_host_handoff(event, host_session_id):
    handoff_dir = os.environ.get("CLAUDE_HANDOFF_DIR") or os.path.expanduser("~/.claude/handoffs")
    os.makedirs(handoff_dir, exist_ok=True)
    path = os.path.join(handoff_dir, f"{host_session_id}.md")
    if os.path.isfile(path) and os.path.getsize(path) > 0:
        announce(
            f"Your handoff file is {path}. It holds the state from earlier in this session. "
            "Read it before you start, and keep it current there."
        )
        return
    context = f"Your handoff file is {path}. It does not exist yet. Keep it current there."
    top = git(event.get("cwd") or os.getcwd(), "rev-parse", "--show-toplevel")
    legacy = top and os.path.join(top, "HANDOFF.md")
    if legacy and os.path.isfile(legacy):
        context += (
            f" This folder also has {legacy} from an earlier session. "
            f"Read it only if the user asks to continue earlier work, and then move it to {path}."
        )
    announce(context)


def move_stale_handoff(event):
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
    announce(
        f"This folder had a HANDOFF.md from an earlier session. It was moved to {target}. "
        "Read it only if the user asks to continue earlier work."
    )


def main():
    event = json.load(sys.stdin)
    host_session_id = os.environ.get("CLAUDE_CODE_HOST_SESSION_ID")
    if host_session_id:
        announce_host_handoff(event, host_session_id)
    else:
        move_stale_handoff(event)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
