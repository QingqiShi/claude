#!/usr/bin/env bash
# Deterministically collect release notes for the packages a Dependabot PR
# bumps. No LLM calls: plain shell plus gh, curl, jq and python3. Runs up
# front for every PR in the merge-dependabot queue, before any agent starts.
#
# Usage:
#   fetch-release-notes.sh <pr-number> <out-file>
#   fetch-release-notes.sh --package <pkg> <from> <to> <out-file>
#
# Exit status is non-zero only on a usage error or a total failure to reach
# the network (e.g. the PR diff itself could not be fetched). A package with
# no notes found is a normal, successful outcome and does not affect the
# exit status.

set -u
set -o pipefail

SCRIPT_NAME="$(basename "$0")"

usage() {
  echo "Usage: $SCRIPT_NAME <pr-number> <out-file>" >&2
  echo "       $SCRIPT_NAME --package <pkg> <from> <to> <out-file>" >&2
}

PR_NUMBER=""
OUT_FILE=""
PACKAGE_NAME=""
PACKAGE_FROM=""
PACKAGE_TO=""
MODE=""

if [ "${1:-}" = "--package" ]; then
  if [ "$#" -ne 5 ]; then
    usage
    exit 2
  fi
  MODE="package"
  PACKAGE_NAME="$2"
  PACKAGE_FROM="$3"
  PACKAGE_TO="$4"
  OUT_FILE="$5"
else
  if [ "$#" -ne 2 ]; then
    usage
    exit 2
  fi
  MODE="pr"
  PR_NUMBER="$1"
  OUT_FILE="$2"
  case "$PR_NUMBER" in
    ''|*[!0-9]*)
      echo "error: <pr-number> must be numeric, got '$PR_NUMBER'" >&2
      usage
      exit 2
      ;;
  esac
fi

for tool in gh curl jq python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: required tool '$tool' not found on PATH" >&2
    exit 1
  fi
done

TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/fetch-release-notes.XXXXXX")"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

PKG_LIST="$TMPDIR/packages.json"

# ---------------------------------------------------------------------------
# Step 1: work out which packages/versions this run covers.
# ---------------------------------------------------------------------------

if [ "$MODE" = "package" ]; then
  python3 - "$PACKAGE_NAME" "$PACKAGE_FROM" "$PACKAGE_TO" "$PKG_LIST" <<'PYEOF'
import json
import sys

name, frm, to, out_path = sys.argv[1:5]
if name.startswith("@"):
    kind = "npm"
elif "/" in name:
    kind = "action"
else:
    kind = "npm"

with open(out_path, "w") as f:
    json.dump([{"name": name, "from": frm, "to": to, "kind": kind}], f)
PYEOF
else
  DIFF_FILE="$TMPDIR/pr.diff"
  if ! gh pr diff "$PR_NUMBER" > "$DIFF_FILE" 2>"$TMPDIR/pr.diff.err"; then
    echo "error: could not fetch diff for PR #$PR_NUMBER: $(cat "$TMPDIR/pr.diff.err")" >&2
    exit 1
  fi

  python3 - "$DIFF_FILE" "$PKG_LIST" <<'PYEOF'
import json
import re
import sys

diff_path, out_path = sys.argv[1:3]

# (major, minor, patch, extra, is-release, prerelease) so 1.0.0-a < 1.0.0.
def semver_key(v):
    m = re.match(
        r"^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[-+](.+))?$", v.strip()
    )
    if not m:
        return None
    major, minor, patch, extra, pre = m.groups()
    return (
        int(major),
        int(minor or 0),
        int(patch or 0),
        int(extra or 0),
        0 if pre else 1,
        pre or "",
    )

FILE_HEADER_RE = re.compile(r"^diff --git a/.* b/(.+)$")
MANIFEST_LINE_RE = re.compile(r'^([-+])\s*"([^"]+)":\s*"[^"0-9]*([0-9][^"]*)"\s*,?\s*$')
WORKFLOW_LINE_RE = re.compile(
    r'^([-+])\s*(?:-\s*)?uses:\s*([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)@(\S+)(?:\s+#\s*(\S+))?'
)

def is_workflow_path(path):
    return bool(re.search(r"\.github/workflows/.*\.ya?ml$", path))

def is_manifest_path(path):
    return path.endswith("package.json")

results = []

def flush(kind, removed, added, sink):
    for pkg_name, from_ver in removed.items():
        to_ver = added.get(pkg_name)
        if to_ver is None or to_ver == from_ver:
            continue
        sink.append((pkg_name, from_ver, to_ver, kind))

current_kind = None
removed = {}
added = {}

with open(diff_path, "r", errors="replace") as fh:
    for line in fh:
        line = line.rstrip("\n")
        header = FILE_HEADER_RE.match(line)
        if header:
            if current_kind:
                flush(current_kind, removed, added, results)
            path = header.group(1)
            removed = {}
            added = {}
            if is_manifest_path(path):
                current_kind = "npm"
            elif is_workflow_path(path):
                current_kind = "action"
            else:
                current_kind = None
            continue

        if current_kind == "npm":
            if line.startswith("---") or line.startswith("+++"):
                continue
            m = MANIFEST_LINE_RE.match(line)
            if m:
                sign, pkg_name, ver = m.groups()
                (removed if sign == "-" else added)[pkg_name] = ver
        elif current_kind == "action":
            if line.startswith("---") or line.startswith("+++"):
                continue
            m = WORKFLOW_LINE_RE.match(line)
            if m:
                sign, action_name, ref, comment_ver = m.groups()
                # Dependabot pins security-sensitive actions to a commit SHA
                # and notes the human version in a trailing comment; prefer
                # that when the raw ref itself is not a version.
                version = ref
                if comment_ver and re.match(r"^[vV]?\d+(\.\d+)*$", comment_ver):
                    if not re.match(r"^[vV]?\d+(\.\d+)*$", ref):
                        version = comment_ver
                (removed if sign == "-" else added)[action_name] = version

if current_kind:
    flush(current_kind, removed, added, results)

# Merge duplicate package names seen across multiple manifests (e.g. a
# monorepo with several package.json files bumping the same dependency):
# keep the widest observed range.
merged = {}
for pkg_name, from_ver, to_ver, kind in results:
    key = (pkg_name, kind)
    if key not in merged:
        merged[key] = [from_ver, to_ver]
        continue
    cur_from, cur_to = merged[key]
    fk, ck = semver_key(from_ver), semver_key(cur_from)
    if fk is not None and (ck is None or fk < ck):
        merged[key][0] = from_ver
    tk, ck2 = semver_key(to_ver), semver_key(cur_to)
    if tk is not None and (ck2 is None or tk > ck2):
        merged[key][1] = to_ver

out = [
    {"name": name, "from": v[0], "to": v[1], "kind": kind}
    for (name, kind), v in merged.items()
]

with open(out_path, "w") as f:
    json.dump(out, f)
PYEOF

  if [ "$MODE" = "pr" ]; then
    gh pr view "$PR_NUMBER" --json body --jq '.body // ""' > "$TMPDIR/prbody.txt" 2>/dev/null || : > "$TMPDIR/prbody.txt"
  fi
fi

if ! jq empty "$PKG_LIST" >/dev/null 2>&1; then
  echo "error: internal failure building package list" >&2
  exit 1
fi

NUM_PACKAGES="$(jq 'length' "$PKG_LIST")"

# ---------------------------------------------------------------------------
# Step 2: for each package, resolve its GitHub repo and fetch releases plus
# changelog candidates. Per-package network failures are not fatal: they
# just leave that package with fewer sources to draw on.
# ---------------------------------------------------------------------------

urlencode_npm_name() {
  # npm package names only ever need '@' and '/' escaped for the registry.
  printf '%s' "$1" | sed 's/@/%40/g; s#/#%2F#g'
}

for i in $(seq 0 $((NUM_PACKAGES - 1))); do
  name="$(jq -r ".[$i].name" "$PKG_LIST")"
  kind="$(jq -r ".[$i].kind" "$PKG_LIST")"
  repo_file="$TMPDIR/repo_$i.json"
  releases_file="$TMPDIR/releases_$i.json"
  echo '{}' > "$repo_file"
  echo '[]' > "$releases_file"

  owner=""
  repo=""
  directory=""

  if [ "$kind" = "action" ]; then
    owner="${name%%/*}"
    repo="${name#*/}"
  else
    encoded="$(urlencode_npm_name "$name")"
    # The full registry doc for a popular package (e.g. vite) can run to
    # tens of MB and occasionally blow the timeout; "latest" is a single
    # version's doc (small, has repository) and the abbreviated Accept
    # header keeps the full version list (for coverage math) small too.
    latest_file="$TMPDIR/registry_latest_$i.json"
    registry_file="$TMPDIR/registry_$i.json"
    if curl -sf --max-time 20 "https://registry.npmjs.org/$encoded/latest" > "$latest_file" 2>"$TMPDIR/curl_$i.err"; then
      repo_url="$(jq -r '.repository.url // empty' "$latest_file" 2>/dev/null)"
      directory="$(jq -r '.repository.directory // empty' "$latest_file" 2>/dev/null)"
      norm="${repo_url/git@github.com:/github.com/}"
      norm="${norm%.git}"
      norm="${norm%/}"
      if [[ "$norm" =~ github\.com[:/]+([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$ ]]; then
        owner="${BASH_REMATCH[1]}"
        repo="${BASH_REMATCH[2]}"
      fi
    fi
    curl -sf --max-time 20 -H "Accept: application/vnd.npm.install-v1+json" \
      "https://registry.npmjs.org/$encoded" > "$registry_file" 2>>"$TMPDIR/curl_$i.err" \
      || echo '{}' > "$registry_file"
  fi

  if [ -n "$owner" ] && [ -n "$repo" ]; then
    jq -n --arg owner "$owner" --arg repo "$repo" --arg directory "$directory" \
      '{owner: $owner, repo: $repo, directory: $directory}' > "$repo_file"

    gh api --paginate "repos/$owner/$repo/releases" \
      --jq '[.[] | {tag_name, body: (.body // ""), html_url}]' 2>/dev/null \
      | jq -s 'add // []' > "$releases_file" 2>/dev/null
    jq empty "$releases_file" >/dev/null 2>&1 || echo '[]' > "$releases_file"

    if [ -n "$directory" ]; then
      gh api "repos/$owner/$repo/contents/$directory/CHANGELOG.md" --jq '.content' \
        > "$TMPDIR/changelog_dir_$i.b64" 2>/dev/null
      [ -s "$TMPDIR/changelog_dir_$i.b64" ] || rm -f "$TMPDIR/changelog_dir_$i.b64"
    fi
    gh api "repos/$owner/$repo/contents/CHANGELOG.md" --jq '.content' \
      > "$TMPDIR/changelog_root_$i.b64" 2>/dev/null
    [ -s "$TMPDIR/changelog_root_$i.b64" ] || rm -f "$TMPDIR/changelog_root_$i.b64"
  fi
done

# ---------------------------------------------------------------------------
# Step 3: assemble the markdown report and print the one-line summary.
# ---------------------------------------------------------------------------

python3 - "$TMPDIR" "$PKG_LIST" "$NUM_PACKAGES" "${PR_NUMBER:-}" "$OUT_FILE" <<'PYEOF'
import base64
import json
import os
import re
import sys

tmpdir, pkg_list_path, num_packages, pr_number, out_path = sys.argv[1:6]
num_packages = int(num_packages)

CAP_BYTES = 200_000
OVERHEAD_BYTES = 4_000

with open(pkg_list_path) as f:
    packages = json.load(f)


def semver_key(v):
    m = re.match(
        r"^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[-+](.+))?$", v.strip()
    )
    if not m:
        return None
    major, minor, patch, extra, pre = m.groups()
    return (
        int(major),
        int(minor or 0),
        int(patch or 0),
        int(extra or 0),
        0 if pre else 1,
        pre or "",
    )


def in_range(v, frm, to):
    vk, fk, tk = semver_key(v), semver_key(frm), semver_key(to)
    if vk is None or fk is None or tk is None:
        return False
    return fk < vk <= tk


def load_json(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return default


def load_b64(path):
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            data = f.read()
        return base64.b64decode(data, validate=False).decode("utf-8", errors="replace")
    except (OSError, ValueError):
        return None


VERSION_HEADER_RE = re.compile(
    r"^#{1,6}\s*\[?[vV]?(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.]+)?)\]?.*$", re.MULTILINE
)


def slice_changelog(text, frm, to):
    """Return [(version, section_text), ...] for headers whose version is
    in (frm, to], ordered ascending by version."""
    matches = list(VERSION_HEADER_RE.finditer(text))
    sections = []
    for idx, m in enumerate(matches):
        version = m.group(1)
        if not in_range(version, frm, to):
            continue
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        sections.append((version, text[start:end].strip()))
    sections.sort(key=lambda s: semver_key(s[0]) or (0,))
    return sections


def extract_pr_body_section(body, pkg_name):
    if not body:
        return None
    short = pkg_name.split("/")[-1]
    lower = body.lower()
    idx = lower.find(short.lower())
    if idx == -1:
        return None
    # Widen to the enclosing <details> block Dependabot wraps each
    # dependency's notes in, when one is present around the match.
    start = body.rfind("<details>", 0, idx)
    end = body.find("</details>", idx)
    if start != -1 and end != -1:
        return body[start : end + len("</details>")]
    # Fall back to a window around the match so we still return something.
    window_start = max(0, idx - 200)
    window_end = min(len(body), idx + 4000)
    return body[window_start:window_end]


packages_with_notes = 0
sections_md = []
coverage_lines = []

per_pkg_budget = max(1000, (CAP_BYTES - OVERHEAD_BYTES) // max(1, num_packages))

for i, pkg in enumerate(packages):
    name, frm, to, kind = pkg["name"], pkg["from"], pkg["to"], pkg["kind"]
    repo_info = load_json(os.path.join(tmpdir, f"repo_{i}.json"), {})
    owner = repo_info.get("owner", "")
    repo = repo_info.get("repo", "")
    directory = repo_info.get("directory", "")

    source = None  # "GitHub Releases" | "Changelog" | "PR body"
    source_url = ""
    body_md = ""
    found_versions = 0
    total_versions = None
    unstructured = False

    if owner and repo:
        releases = load_json(os.path.join(tmpdir, f"releases_{i}.json"), [])
        tags = [r.get("tag_name", "") for r in releases if r.get("tag_name")]
        prefixes = set()
        for t in tags:
            m = re.match(r"^([A-Za-z0-9_.-]+)@(.+)$", t)
            if m:
                prefixes.add(m.group(1))
        prefixes_lower = {p.lower(): p for p in prefixes}

        chosen_prefix = None
        if kind == "npm":
            unscoped = name.split("/")[-1]
            dirbase = os.path.basename(directory) if directory else ""
            for cand in (dirbase, unscoped):
                if cand and cand.lower() in prefixes_lower:
                    chosen_prefix = prefixes_lower[cand.lower()]
                    break

        matched = []
        for r in releases:
            tag = r.get("tag_name", "")
            version = None
            if chosen_prefix:
                m = re.match(re.escape(chosen_prefix) + r"@[vV]?(.+)$", tag)
                if m:
                    version = m.group(1)
            else:
                m = re.match(r"^[vV]?(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.]+)?)$", tag)
                if m:
                    version = m.group(1)
            if version and in_range(version, frm, to):
                matched.append((version, r.get("body") or "", r.get("html_url", "")))
        matched.sort(key=lambda t: semver_key(t[0]) or (0,))

        # Registry gives the authoritative set of versions in range, used to
        # report honest "N of M" coverage even when a source is partial.
        if kind == "npm":
            registry = load_json(os.path.join(tmpdir, f"registry_{i}.json"), None)
            if registry and isinstance(registry.get("versions"), dict):
                total_versions = sum(
                    1 for v in registry["versions"] if in_range(v, frm, to)
                )

        if matched:
            source = "GitHub Releases"
            source_url = f"https://github.com/{owner}/{repo}/releases"
            found_versions = len(matched)
            if total_versions is None:
                total_versions = found_versions
            parts = []
            for version, rbody, url in matched:
                parts.append(f"### {version}\n{rbody.strip()}\n")
            body_md = "\n".join(parts)
        else:
            changelog_path = None
            text = None
            if directory:
                b64_path = os.path.join(tmpdir, f"changelog_dir_{i}.b64")
                text = load_b64(b64_path)
                if text is not None:
                    changelog_path = f"{directory}/CHANGELOG.md"
            if text is None:
                b64_path = os.path.join(tmpdir, f"changelog_root_{i}.b64")
                text = load_b64(b64_path)
                if text is not None:
                    changelog_path = "CHANGELOG.md"

            if text:
                sections = slice_changelog(text, frm, to)
                if sections:
                    source = "Changelog"
                    source_url = f"https://github.com/{owner}/{repo}/blob/HEAD/{changelog_path}"
                    found_versions = len(sections)
                    if total_versions is None:
                        total_versions = found_versions
                    body_md = "\n".join(
                        f"### {v}\n{txt}\n" for v, txt in sections
                    )

            if source is None and pr_number:
                prbody_path = os.path.join(tmpdir, "prbody.txt")
                if os.path.exists(prbody_path):
                    with open(prbody_path, errors="replace") as f:
                        pr_body_text = f.read()
                    excerpt = extract_pr_body_section(pr_body_text, name)
                    if excerpt and excerpt.strip():
                        source = "PR body"
                        source_url = f"https://github.com/{owner}/{repo}"
                        sections = slice_changelog(excerpt, frm, to)
                        if sections:
                            found_versions = len(sections)
                            body_md = "\n".join(
                                f"### {v}\n{txt}\n" for v, txt in sections
                            )
                        else:
                            unstructured = True
                            found_versions = 0
                            body_md = excerpt.strip()
                        if total_versions is None:
                            total_versions = found_versions if sections else 1

    if total_versions is not None and found_versions > total_versions:
        # A source (e.g. GitHub Releases) can list a version the registry
        # never published, such as a beta; never claim more found than total.
        total_versions = found_versions

    header = f"## {name} {frm} -> {to}"
    if source:
        packages_with_notes += 1
        if unstructured:
            coverage_lines.append(
                f"- {name} {frm} -> {to}: notes found (not split by version), source: {source}"
            )
        else:
            coverage_lines.append(
                f"- {name} {frm} -> {to}: {found_versions} of {total_versions} versions, source: {source}"
            )
        section = f"{header}\nsource: {source_url}\n{body_md}".rstrip() + "\n"
    else:
        reason = "repository not found on npm/GitHub" if not (owner and repo) else "no releases, changelog or PR notes covered this range"
        coverage_lines.append(f"- {name} {frm} -> {to}: no notes found")
        section = f"{header}\nno notes found ({reason}).\n"

    sections_md.append((section, per_pkg_budget))

# Enforce the per-package budget, truncating any section that is oversized.
final_sections = []
for section, budget in sections_md:
    raw = section.encode("utf-8")
    if len(raw) > budget:
        truncated = raw[:budget].decode("utf-8", errors="ignore")
        truncated += (
            f"\n\n[... truncated: this section was {len(raw)} bytes, "
            f"kept {len(truncated.encode('utf-8'))} bytes ...]\n"
        )
        final_sections.append(truncated)
    else:
        final_sections.append(section)

if pr_number:
    title = f"# Release notes for PR #{pr_number}\n"
else:
    p = packages[0] if packages else {"name": "?", "from": "?", "to": "?"}
    title = f"# Release notes for {p['name']} {p['from']} -> {p['to']}\n"

if packages:
    coverage_block = "## Coverage\n" + "\n".join(coverage_lines) + "\n"
else:
    coverage_block = "## Coverage\nNo package.json or workflow version bumps were found in this PR's manifest changes.\n"

doc = title + "\n" + coverage_block + "\n" + "\n".join(final_sections)

raw_doc = doc.encode("utf-8")
if len(raw_doc) > CAP_BYTES:
    raw_doc = raw_doc[:CAP_BYTES]
    doc = raw_doc.decode("utf-8", errors="ignore") + "\n\n[... file truncated at the size cap ...]\n"

with open(out_path, "w") as f:
    f.write(doc)

print(f"{packages_with_notes} of {len(packages)} packages have notes")
PYEOF
