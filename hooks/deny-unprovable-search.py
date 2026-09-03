#!/usr/bin/env python3
import json
import os
import re
import shlex
import subprocess
import sys

# A hook deny returns before the auto-mode classifier runs. A hook allow does
# not: the classifier evaluates the command again and can still stop for approval.

SEARCH_TOOLS = {"grep", "egrep", "fgrep", "rg", "find", "fd"}
DIRECTORY_CHANGERS = {"cd", "pushd", "popd"}
LEADING_WORDS = {
    "sudo", "command", "builtin", "exec", "time", "nohup", "nice", "env", "export",
    "if", "then", "else", "elif", "while", "until", "do", "!", "{", "}",
}
ASSIGNMENT = re.compile(r"(\w+)=(.*)", re.DOTALL)
VARIABLE = re.compile(r"\$(\w+)|\$\{(\w+)\}")
PIPES = {"|", "|&"}

GREP_VALUE_FLAGS = "efmABCdD"
GREP_VALUE_OPTIONS = {
    "--regexp", "--file", "--max-count", "--after-context", "--before-context",
    "--context", "--directories", "--devices", "--include", "--exclude",
    "--exclude-from", "--exclude-dir", "--label",
}
RG_VALUE_FLAGS = "efgtTABCmMjdEr"
RG_VALUE_OPTIONS = {
    "--regexp", "--file", "--glob", "--iglob", "--type", "--type-not", "--type-add",
    "--after-context", "--before-context", "--context", "--max-count", "--max-depth",
    "--max-columns", "--max-filesize", "--replace", "--threads", "--sort", "--sortr",
    "--color", "--colors", "--encoding", "--engine", "--path-separator", "--pre",
    "--pre-glob", "--ignore-file", "--dfa-size-limit", "--regex-size-limit",
    "--context-separator", "--field-context-separator", "--field-match-separator",
}
FD_VALUE_FLAGS = "eEtdjSo"
FD_VALUE_OPTIONS = {
    "--extension", "--exclude", "--type", "--max-depth", "--min-depth", "--exact-depth",
    "--threads", "--size", "--owner", "--color", "--search-path", "--base-directory",
    "--changed-within", "--changed-before", "--max-results", "--ignore-file",
    "--batch-size", "--path-separator",
}
FD_EXEC_OPTIONS = {"-x", "-X", "--exec", "--exec-batch"}
FIND_LEADING_FLAGS = set("HLPEXdsx")

HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*(['\"]?)(\w+)\1")
COMMENT = re.compile(r"(?:^|(?<=\s))#[^\n]*")
PUNCTUATION = set("();<>|&")
REDIRECTION = set("<>")


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
    """(operator, words) for each simple command; an input redirection sets the operator to "|"."""
    # shlex removes a comment up to the next newline, but the newlines are flattened away
    # below. Remove the comments first, or one comment would swallow the whole command.
    flat = strip_heredoc_bodies(COMMENT.sub("", command)).replace("\n", " ; ")
    lexer = shlex.shlex(flat, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    lexer.commenters = ""
    tokens = list(lexer)
    result, current, operator = [], [], ""
    i = 0
    while i < len(tokens):
        token = tokens[i]
        i += 1
        if not token or set(token) - PUNCTUATION:
            current.append(token)
        elif set(token) & REDIRECTION and "(" not in token:
            # A digit before a redirection is its file descriptor, as in 2>&1.
            if current and current[-1].isdigit():
                current.pop()
            if token.startswith("<"):
                operator = "|"
            i += 1
        else:
            if current:
                result.append((operator, current))
            current, operator = [], token
    if current:
        result.append((operator, current))
    return result


def command_words(segment, variables):
    words = list(segment)
    while words:
        assignment = ASSIGNMENT.fullmatch(words[0])
        if assignment:
            name, value = assignment.groups()
            if "$" in value or "`" in value:
                variables.pop(name, None)
            else:
                variables[name] = value
        elif words[0] not in LEADING_WORDS:
            break
        words.pop(0)
    if words:
        words[0] = os.path.basename(words[0])
    return words


def split_options(args, value_flags, value_options):
    flags, positionals = set(), []
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--":
            positionals.extend(args[i + 1:])
            break
        if arg.startswith("--"):
            name = arg.partition("=")[0]
            flags.add(name)
            if name in value_options and "=" not in arg:
                i += 1
        elif arg.startswith("-") and len(arg) > 1:
            letters = arg[1:]
            for position, letter in enumerate(letters):
                flags.add(letter)
                if letter in value_flags:
                    if position == len(letters) - 1:
                        i += 1
                    break
        else:
            positionals.append(arg)
        i += 1
    return flags, positionals


def find_paths(args):
    paths = []
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "-f" and i + 1 < len(args):
            paths.append(args[i + 1])
            i += 2
            continue
        if len(arg) > 1 and arg[0] == "-" and set(arg[1:]) <= FIND_LEADING_FLAGS:
            i += 1
            continue
        if arg.startswith("-") or arg == "!":
            break
        paths.append(arg)
        i += 1
    return paths


def filesystem_search(tool, args, piped):
    """(recursive, paths) when the tool walks or reads files; None when it only filters stdin."""
    if tool in {"grep", "egrep", "fgrep"}:
        flags, positionals = split_options(args, GREP_VALUE_FLAGS, GREP_VALUE_OPTIONS)
        if flags & {"V", "--help", "--version"}:
            return None
        recursive = bool(flags & {"r", "R", "--recursive", "--dereference-recursive"})
        pattern_given = flags & {"e", "f", "--regexp", "--file"}
        paths = positionals if pattern_given else positionals[1:]
        if not recursive and not paths:
            return None
    elif tool == "rg":
        flags, positionals = split_options(args, RG_VALUE_FLAGS, RG_VALUE_OPTIONS)
        if flags & {"h", "V", "--help", "--version", "--type-list", "--pcre2-version"}:
            return None
        pattern_given = flags & {"e", "f", "--regexp", "--file", "--files"}
        paths = positionals if pattern_given else positionals[1:]
        if piped and not paths:
            return None
        recursive = True
    elif tool == "find":
        recursive, paths = True, find_paths(args)
    elif tool == "fd":
        exec_start = next((i for i, arg in enumerate(args) if arg in FD_EXEC_OPTIONS), len(args))
        flags, positionals = split_options(args[:exec_start], FD_VALUE_FLAGS, FD_VALUE_OPTIONS)
        if flags & {"h", "V", "--help", "--version"}:
            return None
        recursive, paths = True, positionals[1:]
    else:
        return None
    return recursive, paths or ["."]


def search_roots(cwd):
    roots = [os.path.realpath(os.path.expanduser("~"))]
    toplevel = subprocess.run(
        ["git", "-C", cwd, "rev-parse", "--show-toplevel"], capture_output=True, text=True
    )
    if toplevel.returncode == 0:
        roots.insert(0, os.path.realpath(toplevel.stdout.strip()))
    return roots


def expand_variables(path, variables):
    return VARIABLE.sub(
        lambda match: variables.get(match.group(1) or match.group(2), match.group(0)), path
    )


def covered_root(path, cwd, roots):
    resolved = os.path.realpath(os.path.join(cwd, os.path.expanduser(path)))
    for root in roots:
        if os.path.commonpath([resolved, root]) == resolved:
            return resolved, root
    return None


def deny(reason):
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        },
        sys.stdout,
    )


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    command = payload.get("tool_input", {}).get("command") or ""
    cwd = payload.get("cwd") or os.getcwd()
    try:
        parsed = segments(command)
    except ValueError:
        return

    variables = {"HOME": os.path.expanduser("~"), "PWD": cwd}
    roots = None
    changed_directory = False
    for operator, segment in parsed:
        words = command_words(segment, variables)
        if not words:
            continue
        tool, args = words[0], words[1:]
        if tool in DIRECTORY_CHANGERS:
            changed_directory = True
            continue
        if tool not in SEARCH_TOOLS:
            continue
        search = filesystem_search(tool, args, operator in PIPES)
        if search is None:
            continue
        recursive, paths = search
        expanded = [expand_variables(path, variables) for path in paths]
        unresolvable = [path for path in expanded if "$" in path or "`" in path]
        relative = [path for path in expanded if not os.path.isabs(os.path.expanduser(path))]
        if changed_directory and (unresolvable or relative):
            deny(
                f"Denied before the permission check: `{tool}` runs after `cd` with a path it "
                "cannot pin down, so the auto-mode classifier cannot prove the search stays "
                "clear of the denied .env files and would stop for approval. Give "
                f"`{tool}` an absolute path (the working directory is {cwd}), or drop the "
                "`cd` and use paths relative to that directory."
            )
            return
        if not recursive:
            continue
        if unresolvable:
            deny(
                f"Denied before the permission check: `{tool}` searches {unresolvable[0]}, "
                "which the auto-mode classifier cannot resolve, so it would stop for approval. "
                f"Rewrite the command so `{tool}` searches a literal absolute path to a "
                f"subdirectory or a file; the working directory is {cwd}."
            )
            return
        if roots is None:
            roots = search_roots(cwd)
        for path in expanded:
            covered = covered_root(path, cwd, roots)
            if covered:
                resolved, root = covered
                deny(
                    f"Denied before the permission check: `{tool}` searches {resolved} "
                    f"recursively, which covers {root}. The auto-mode classifier cannot prove "
                    "such a search stays clear of the denied .env files, so it would stop for "
                    f"approval. Rewrite the command so `{tool}` searches an absolute path to a "
                    f"subdirectory or a file, for example {root}/<subdirectory>."
                )
                return


if __name__ == "__main__":
    main()
