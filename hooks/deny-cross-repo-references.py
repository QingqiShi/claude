#!/usr/bin/env python3
import json
import os
import re
import shlex
import subprocess
import sys

# GitHub posts a permanent "mentioned this" event on an issue or pull request
# that a public repository references. Editing or deleting the source does not
# remove it. So the reference is refused before the text is published.

READ_ONLY_GH = {
    ("pr", "view"), ("pr", "list"), ("pr", "diff"), ("pr", "checks"), ("pr", "status"),
    ("issue", "view"), ("issue", "list"), ("issue", "status"),
    ("repo", "view"), ("repo", "list"), ("release", "view"), ("release", "list"),
    ("run", "view"), ("run", "list"), ("run", "watch"), ("workflow", "view"), ("workflow", "list"),
    ("search", None), ("auth", None), ("status", None), ("browse", None), ("gist", "view"),
}
PUBLISHING_GIT = {"commit", "tag", "merge", "notes", "revert", "cherry-pick"}
TEXT_FILE_OPTIONS = {"--body-file", "--notes-file", "--input", "--file", "-F"}
LEADING_WORDS = {"sudo", "command", "builtin", "exec", "time", "nohup", "nice", "env"}
PUNCTUATION = set("();<>|&")

HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*(['\"]?)(\w+)\1")
SHORTHAND = re.compile(r"(?<![\w/.-])([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/([A-Za-z0-9_.-]+?)#(\d+)\b")
URL = re.compile(r"https?://(?:www\.)?github\.com/([A-Za-z0-9-]+)/([A-Za-z0-9_.-]+)/(?:issues|pull|discussions)/(\d+)", re.I)
REMOTE = re.compile(r"github\.com[:/]([A-Za-z0-9-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$", re.I)


def strip_heredoc_bodies(command):
    kept, open_delimiters = [], []
    for line in command.split("\n"):
        if open_delimiters:
            if line.strip() == open_delimiters[0]:
                open_delimiters.pop(0)
            continue
        kept.append(line)
        open_delimiters.extend(match.group(2) for match in HEREDOC.finditer(line))
    return "\n".join(kept)


def segments(command):
    flat = strip_heredoc_bodies(command).replace("\n", " ; ")
    lexer = shlex.shlex(flat, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        tokens = list(lexer)
    except ValueError:
        return [command.split()]
    result, current = [], []
    for token in tokens:
        if token and not set(token) <= PUNCTUATION:
            current.append(token)
        elif current:
            result.append(current)
            current = []
    if current:
        result.append(current)
    return result


def command_words(words):
    while words and (words[0] in LEADING_WORDS or "=" in words[0].split("/")[0]):
        words = words[1:]
    return words


def gh_publishes(words):
    positional = [w for w in words[1:] if not w.startswith("-")]
    if not positional:
        return False
    group = positional[0]
    action = positional[1] if len(positional) > 1 else None
    if group == "api":
        method = "GET"
        for i, word in enumerate(words):
            if word in ("-X", "--method") and i + 1 < len(words):
                method = words[i + 1].upper()
            elif word.startswith("--method="):
                method = word.split("=", 1)[1].upper()
        return method != "GET" or "graphql" in positional
    return (group, action) not in READ_ONLY_GH and (group, None) not in READ_ONLY_GH


def publishing_segments(command):
    found = []
    for words in segments(command):
        words = command_words(words)
        if not words:
            continue
        name = os.path.basename(words[0])
        if name == "gh" and gh_publishes(words):
            found.append(words)
        elif name == "git":
            sub = next((w for w in words[1:] if not w.startswith("-")), None)
            if sub in PUBLISHING_GIT:
                found.append(words)
    return found


def referenced_files(words, cwd):
    paths = []
    for i, word in enumerate(words):
        if word in TEXT_FILE_OPTIONS and i + 1 < len(words):
            paths.append(words[i + 1])
        elif any(word.startswith(opt + "=") for opt in TEXT_FILE_OPTIONS if opt.startswith("--")):
            paths.append(word.split("=", 1)[1])
    texts = []
    for path in paths:
        if path == "-":
            continue
        full = path if os.path.isabs(path) else os.path.join(cwd, path)
        try:
            with open(os.path.expanduser(full), encoding="utf-8", errors="replace") as handle:
                texts.append(handle.read())
        except OSError:
            pass
    return texts


def own_repository(cwd):
    try:
        url = subprocess.run(
            ["git", "-C", cwd, "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    match = REMOTE.search(url)
    return (match.group(1).lower(), match.group(2).lower()) if match else None


def foreign_references(text, own):
    found = []
    for pattern in (URL, SHORTHAND):
        for match in pattern.finditer(text):
            owner, repo, number = match.group(1), match.group(2), match.group(3)
            if own and (owner.lower(), repo.lower()) == own:
                continue
            found.append(f"{owner}/{repo}#{number}")
    return sorted(set(found))


def decide(payload):
    command = payload.get("tool_input", {}).get("command", "") or ""
    cwd = payload.get("cwd") or os.getcwd()
    publishing = publishing_segments(command)
    if not publishing:
        return None
    texts = [command]
    for words in publishing:
        texts.extend(referenced_files(words, cwd))
    references = foreign_references("\n".join(texts), own_repository(cwd))
    if not references:
        return None
    listed = ", ".join(references)
    return (
        f"This command publishes text that references an issue or pull request in another "
        f"repository ({listed}). GitHub then posts a permanent \"mentioned this\" event on that "
        f"issue, visible to everyone there, and editing or deleting the source does not remove it. "
        f"Describe the upstream state in words with no link or owner/repo#number, or ask the user "
        f"before linking."
    )


def main():
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return
    reason = decide(payload)
    if reason is None:
        return
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }, sys.stdout)


if __name__ == "__main__":
    main()
