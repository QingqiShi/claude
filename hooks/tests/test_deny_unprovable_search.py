#!/usr/bin/env python3
"""Run with: python3 -m unittest discover -s ~/.claude/hooks/tests"""
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "deny-unprovable-search.py")

# Paths in the cases use {home} and {repo}; the fixture lays out {home}/work/repo as a git repository
# with src/, hooks/, apps/web/ and CLAUDE.md, and {home}/notes as a directory outside any repository.


def load_hook():
    spec = importlib.util.spec_from_file_location("deny_unprovable_search", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HookCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hook = load_hook()
        cls.temp = tempfile.TemporaryDirectory()
        cls.home = os.path.realpath(cls.temp.name)
        cls.repo = os.path.join(cls.home, "work", "repo")
        cls.sub = os.path.join(cls.repo, "src")
        cls.no_repo = os.path.join(cls.home, "notes")
        for directory in ("src", "hooks", "apps/web", "packages/ui/src"):
            os.makedirs(os.path.join(cls.repo, directory))
        os.makedirs(cls.no_repo)
        with open(os.path.join(cls.repo, "CLAUDE.md"), "w") as handle:
            handle.write("# repo\n")
        subprocess.run(["git", "init", "-q", cls.repo], check=True)
        cls.saved_home = os.environ.get("HOME")
        os.environ["HOME"] = cls.home

    @classmethod
    def tearDownClass(cls):
        if cls.saved_home is None:
            del os.environ["HOME"]
        else:
            os.environ["HOME"] = cls.saved_home
        cls.temp.cleanup()

    def fill(self, text):
        return text.replace("{repo}", self.repo).replace("{home}", self.home)

    def decide(self, command, cwd=None):
        payload = {"tool_name": "Bash", "tool_input": {"command": self.fill(command)}, "cwd": self.fill(cwd or self.repo)}
        captured = io.StringIO()
        sys.stdin = io.StringIO(json.dumps(payload))
        try:
            with contextlib.redirect_stdout(captured):
                self.hook.main()
        finally:
            sys.stdin = sys.__stdin__
        text = captured.getvalue().strip()
        if not text:
            return None
        output = json.loads(text)["hookSpecificOutput"]
        self.assertEqual(output["permissionDecision"], "deny")
        self.assertEqual(output["hookEventName"], "PreToolUse")
        return output["permissionDecisionReason"]

    def assert_denied(self, command, cwd=None, mentions=()):
        with self.subTest(command=command, cwd=cwd):
            reason = self.decide(command, cwd)
            self.assertIsNotNone(reason, "expected a deny")
            for text in mentions:
                self.assertIn(self.fill(text), reason)

    def assert_allowed(self, command, cwd=None):
        with self.subTest(command=command, cwd=cwd):
            reason = self.decide(command, cwd)
            self.assertIsNone(reason, f"expected an allow, got: {reason}")


class RecursiveSearchOfARoot(HookCase):
    """A recursive search whose path covers the repository top-level, an ancestor, or $HOME."""

    def test_grep(self):
        for command in [
            "grep -rn foo .",
            "grep -rn foo",
            "grep -r foo {repo}",
            "grep -rn foo ~/work/repo",
            "grep -rn foo /",
            "grep -rn foo ~",
            "grep -rn foo {home}/work",
            "grep -R foo .",
            "grep --recursive foo .",
            "grep -rin --include='*.md' foo .",
            "grep -rl foo . --include=*.ts",
            "grep -rA3 foo",
            "grep -rn -A 3 foo .",
            "grep -e foo -r",
            "grep -r foo -- .",
            "grep -rn foo src ..",
            "grep -rn foo . | head",
            "grep -rn foo . 2>/dev/null || true",
            'grep -rn "#include" .',
        ]:
            self.assert_denied(command)

    def test_rg(self):
        for command in [
            "rg foo",
            "rg -n foo .",
            "rg 'foo|bar'",
            "rg -t ts foo",
            "rg -tts foo",
            "rg -g '*.ts' foo",
            "rg --max-depth 1 foo",
            "rg -A 3 foo",
            "rg -e foo",
            "rg --files",
            "rg -l foo 2>/dev/null",
            "rg foo . 2>&1 | head",
            "rg -n foo {repo}",
        ]:
            self.assert_denied(command)

    def test_find_and_fd(self):
        for command in [
            "find . -name '*.sh'",
            "find -name '*.sh'",
            "find {repo} -type f",
            "find . \\( -name a -o -name b \\)",
            "find -L . -type l",
            "find . -maxdepth 1 -name x",
            "find .. -name x",
            "fd foo",
            "fd foo .",
            "fd -e ts -x wc -l",
            "fd -t f foo {repo}",
        ]:
            self.assert_denied(command)

    def test_wrapped_and_compound_commands(self):
        for command in [
            "sudo grep -r foo .",
            "/usr/bin/grep -r foo .",
            "\\grep -r foo .",
            "FOO=1 rg foo",
            "time rg foo",
            "env rg foo",
            "for f in $(find . -name '*.md'); do echo $f; done",
            "while read f; do rg foo .; done < list",
            "npm test || rg foo",
            "true && (rg foo)",
            "rg foo &",
            "ls | grep -r foo",
            "cat file | grep -r foo",
        ]:
            self.assert_denied(command)

    def test_from_other_working_directories(self):
        self.assert_denied("rg foo {repo}", cwd="{repo}/src")
        self.assert_denied("rg foo ..", cwd="{repo}/src")
        self.assert_denied("grep -rn foo ../", cwd="{repo}/src")
        self.assert_denied("rg foo", cwd="{home}")
        self.assert_denied("find . -name x", cwd="{home}")
        self.assert_denied("rg foo {home}", cwd="{home}/notes")
        self.assert_denied("grep -r foo ~", cwd="/")
        self.assert_denied("rg foo", cwd="/")

    def test_variables_that_resolve_to_a_root(self):
        for command in [
            "rg foo $HOME",
            "rg foo ${PWD}",
            'D={repo}; grep -rn foo "$D"',
            "export D={repo}; rg foo $D",
            "D={repo}\nrg foo $D/",
        ]:
            self.assert_denied(command)

    def test_reason_names_the_path_the_root_and_a_rewrite(self):
        self.assert_denied("rg foo .", mentions=["`rg` searches {repo} recursively", "covers {repo}", "{repo}/<subdirectory>"])
        self.assert_denied("grep -rn foo ~", mentions=["covers {repo}", "{repo}/<subdirectory>"])
        self.assert_denied("rg foo {home}", cwd="{home}/notes", mentions=["covers {home}", "{home}/<subdirectory>"])


class SearchAfterChangingDirectory(HookCase):
    """After cd or pushd, a search with a relative or unresolvable path."""

    def test_relative_paths(self):
        for command in [
            "cd {repo}/src && rg foo",
            "cd {repo}/src; rg foo .",
            "(cd {repo} && rg foo src)",
            "cd {repo}\nrg foo src",
            "pushd {repo} && find src -name x",
            "cd src && find . -name x",
            "cd {repo} && grep -rn foo src",
            "cd {repo} && grep -n foo package.json",
            "cd {repo} && grep -n foo /tmp/x.log package.json",
            'cd {repo} && for f in a b; do grep -n foo "$f"; done',
            "cd {repo} && ls | rg foo src",
            "cd {repo}/src && cat x | grep foo y",
            "cd {repo} && fd foo src",
        ]:
            self.assert_denied(command)

    def test_unresolvable_paths(self):
        for command in [
            'cd {repo} && D=$(pwd) && rg foo "$D"',
            'cd {repo} && grep -rn foo "$DIR"',
        ]:
            self.assert_denied(command)

    def test_reason_offers_the_working_directory(self):
        self.assert_denied("cd {repo}/src && rg foo", mentions=["`rg` runs after `cd`", "absolute path", "{repo})"])


class UnresolvableSearchPath(HookCase):
    """A recursive search whose path still holds a $ or a backtick after assignments are substituted."""

    def test_denied(self):
        for command in [
            "rg foo $(git rev-parse --show-toplevel)",
            'rg foo "$DIR"',
            'D=$(pwd); grep -rn foo "$D/src"',
            "rg foo `pwd`",
            "find $ROOT -name x",
            "fd foo $X",
        ]:
            self.assert_denied(command)

    def test_reason_names_the_path(self):
        self.assert_denied('rg foo "$DIR"', mentions=["searches $DIR", "{repo}"])


class AllowedSearches(HookCase):
    def test_grep_fed_by_a_pipe(self):
        for command in [
            "cat file | grep foo",
            "cat file | rg foo",
            "pnpm test 2>&1 | rg -n FAIL | head",
            "ps aux | grep -i node | grep -v grep",
            "ls |& grep foo",
            "git log --oneline | grep -E 'fix|feat'",
            "git ls-files | xargs grep -l foo",
            "cd {repo} && git status | grep foo",
            "cd {repo} && pnpm test 2>&1 | grep -v x | head",
            "cd {repo} && ls src/*.ts | rg foo",
            "cd {repo} && gh run view --log 2>&1 | grep -E 'error' | head",
        ]:
            self.assert_allowed(command)

    def test_named_files(self):
        for command in [
            "grep foo file.txt",
            "grep -n foo package.json",
            "grep -n foo a.txt b.txt",
            "grep -E 'a|b' file",
            "grep -e foo -e bar file",
            "grep -f patterns file",
            "grep -n foo {repo}/CLAUDE.md",
            "grep -c foo ~/work/repo/CLAUDE.md",
            "grep -rn foo {repo}/*.md",
            "grep foo",
            "grep -E 'a|b'",
        ]:
            self.assert_allowed(command)

    def test_subdirectories(self):
        for command in [
            "grep -rn foo src",
            "grep -rn foo src hooks",
            "grep -rn foo {repo}/src",
            "grep -rn --include='*.md' foo {repo}/src",
            "rg foo src",
            "rg foo -- src",
            "rg foo {repo}/src",
            "rg foo ~/work/repo/src",
            "rg -n foo src/ 2>/dev/null",
            "rg --files {repo}/src",
            "rg -t ts foo {repo}/src",
            "find {repo}/src -name '*.sh'",
            "find src hooks -name x",
            "find src -type f -exec grep -l foo {} +",
            "find {repo}/src -name '*.md' | xargs grep -l foo",
            "fd foo src",
            "fd foo {repo}/src",
            "fd -e ts . src -x wc -l",
            "rg foo {repo}/src && cd {repo}",
        ]:
            self.assert_allowed(command)

    def test_absolute_paths_after_cd(self):
        for command in [
            "cd {repo} && grep -n foo /tmp/x.log",
            "cd {repo} && grep -iE 'error|fail' /tmp/build.log | grep -v boundary",
            "cd {repo} && grep -rn foo {repo}/src",
            'cd {repo}; L=/tmp/x.log; grep -c err "$L"',
            "cd {repo} && grep -n foo ~/work/repo/CLAUDE.md",
            "cd {repo} && find {repo}/src -name x",
        ]:
            self.assert_allowed(command)

    def test_variables_that_resolve_to_a_subdirectory(self):
        for command in [
            'D={repo}; grep -rn foo "$D/src"',
            "export D={repo}/src; find $D -name x",
            'D={repo}/src\nfind "${D}" -type f',
            "rg foo $HOME/work/repo/src",
        ]:
            self.assert_allowed(command)

    def test_outside_the_repository_and_home(self):
        self.assert_allowed("grep -r foo /usr/share")
        self.assert_allowed("find /usr/share -name x")
        self.assert_allowed("rg foo", cwd="{home}/notes")
        self.assert_allowed("rg foo Downloads", cwd="{home}")
        self.assert_allowed("find . -name x", cwd="/usr/share")


class NotASearch(HookCase):
    def test_other_commands(self):
        for command in [
            "git grep foo",
            "cd {repo} && git grep foo",
            "cd {repo} && npm test",
            "cd {repo}/src && ls",
            "echo grep -r foo .",
            "which grep",
            "rg --version",
            "grep --help",
            "rg --type-list",
            "cd {repo} && grep --version",
        ]:
            self.assert_allowed(command)

    def test_search_words_inside_quotes_and_heredocs(self):
        for command in [
            "python3 -c 'print(\"grep -r foo .\")'",
            "node -e 'console.log(\"rg foo\")'",
            "cat > out.py <<'PY'\nimport os\ngrep -r foo .\ncd /x && rg foo\nPY\necho done",
            "python3 - <<EOF\nfind . -name x\nEOF",
            "cat <<-EOF > notes.md\n# rg foo\nEOF",
        ]:
            self.assert_allowed(command)

    def test_unbalanced_quotes_fail_open(self):
        self.assert_allowed("grep -r foo 'unbalanced")


class EntryPoint(HookCase):
    """The hook as Claude Code runs it: JSON on stdin, JSON or nothing on stdout, exit 0."""

    def run_hook(self, stdin, cwd=None):
        return subprocess.run(
            [sys.executable, HOOK], input=stdin, capture_output=True, text=True, cwd=cwd,
            env={**os.environ, "HOME": self.home},
        )

    def payload(self, command, cwd=None):
        record = {"tool_name": "Bash", "tool_input": {"command": self.fill(command)}}
        if cwd:
            record["cwd"] = self.fill(cwd)
        return json.dumps(record)

    def test_allow_writes_nothing(self):
        result = self.run_hook(self.payload("grep -n foo {repo}/CLAUDE.md", "{repo}"))
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))

    def test_deny_writes_a_decision(self):
        result = self.run_hook(self.payload("rg foo", "{repo}"))
        self.assertEqual((result.returncode, result.stderr), (0, ""))
        output = json.loads(result.stdout)["hookSpecificOutput"]
        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn(self.repo, output["permissionDecisionReason"])

    def test_missing_cwd_uses_the_process_directory(self):
        result = self.run_hook(self.payload("rg foo"), cwd=self.repo)
        self.assertIn("deny", result.stdout)
        result = self.run_hook(self.payload("rg foo"), cwd=self.no_repo)
        self.assertEqual(result.stdout, "")

    def test_malformed_input_is_ignored(self):
        for stdin in ["", "not json", "{}", '{"tool_input": {}}', '{"tool_input": {"command": null}}']:
            with self.subTest(stdin=stdin):
                result = self.run_hook(stdin)
                self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))


class ParserEdgeCases(HookCase):
    """Shapes that once slipped past the tokenizer."""

    def test_comments_do_not_hide_a_search(self):
        for command in [
            "# look for foo\ngrep -rn foo .",
            "grep -rn foo . # trailing note",
            "echo a#b; grep -rn foo .",
        ]:
            self.assert_denied(command)

    def test_redirections_and_substitutions(self):
        for command in [
            "diff <(grep -r foo .) /dev/null",
            'cmd <<< "a b" && rg foo',
            'cmd <<< "abc"\nrg foo',
            'echo x > "my file" && rg foo',
            "cat <<EOF > out.md\nrg foo\nEOF\nrg foo",
            "find . -maxdepth 1 > out",
        ]:
            self.assert_denied(command)
        for command in [
            'rg foo <<< "$x"',
            "rg foo < file",
            "head -n 5 2>&1 | grep x",
            "pnpm test 2>&1 | grep -E 'FAIL ' | sed 's/ >.*//' | sort -u",
            'grep -c "<<<<<<<" src/header-controls.tsx',
        ]:
            self.assert_allowed(command)


# Real commands from the transcripts under ~/.claude/projects, with the project path replaced by
# {repo} and the home directory by {home}. The allowed list holds the shapes an earlier version of
# the hook denied by mistake; the denied list holds commands the auto-mode classifier stopped for.
ALLOWED_FROM_TRANSCRIPTS = [
    ("{repo}", r"""git branch -a | grep -i lucide"""),
    ("{repo}", r"""sips --help 2>&1 | grep -i -A2 crop"""),
    ("{repo}", r"""cat package.json | grep -A2 '"test"'"""),
    ("{repo}", r"""ps aux | grep prowfish | grep -v grep"""),
    ("{repo}", r"""pnpm format:changed 2>&1 | grep DESIGN"""),
    ("{repo}", r"""grep -n '^#' DESIGN.md"""),
    ("{repo}", r"""grep -n "^## " README.md"""),
    ("{repo}", r"""grep -n -E '\|' DESIGN.md"""),
    ("{repo}", r"""grep -n "vercel\|env" .gitignore"""),
    ("{repo}", r"""R={repo}; grep -n "packages/" $R/CONTEXT-MAP.md"""),
    ("{repo}", r'''R={repo}
grep -n "@tuja/eslint-plugin" "$R/package.json"'''),
    ("{repo}", r'''f=$(git rev-parse --git-path info/exclude); echo "$f"; grep -n "HANDOFF.md" "$f" || echo "not excluded"'''),
    ("{repo}", r"""SK={home}/.claude/skills/playwright-cli; ls $SK/references; grep -rn -i "config" $SK/references/session-management.md | head -30"""),
    ("{repo}", r"""D=node_modules/.pnpm/@tanstack+query-core@5.102.2/node_modules/@tanstack/query-core/build/modern; grep -rn "prefetchQuery" $D/*.js | head -10"""),
    ("{repo}", r"""grep -rn "data-icon" src/ | head -20"""),
    ("{repo}", r"""grep -rln "@internal" packages/ui/src"""),
    ("{repo}", r"""grep -rn "rounded-md px-3 py-1" src/ """),
    ("{repo}", r'''which rg || echo "no rg"'''),
    ("{repo}", r'''playwright-cli find "breaking"'''),
    ("{repo}", r"""find {home}/.claude/skills/raise-pr -type f | sort"""),
    ("{repo}", r"""find ~/.posthog -maxdepth 2 -type f; echo ---; ls -la ~/.posthog"""),
    ("{repo}", r"""find /tmp/prowfish-master-check/node_modules/.pnpm -maxdepth 1 -iname "next@16.2*" 2>/dev/null"""),
    ("{repo}", r"""ls -la /tmp/.playwright-cli/*.png 2>/dev/null | tail -5; find /tmp -maxdepth 3 -name "sidebar-frame.png" 2>/dev/null"""),
    ("{repo}", r"""ls ~/.posthog 2>/dev/null; ls ~/.config/posthog 2>/dev/null; find /opt/homebrew/bin /usr/local/bin ~/.local/bin ~/.cargo/bin -iname '*posthog*' 2>/dev/null; ls ~/.claude/plugins 2>/dev/null | head -50"""),
    ("{repo}", r"""find {repo}/.playwright-cli /tmp -maxdepth 2 -name "*.png" -newermt "-5 minutes" 2>/dev/null | head -5"""),
    ("{repo}", r"""git grep -n "catch((\|catch(" -- 'apps/web/src/**/*.ts' 'apps/web/src/**/*.tsx' | grep -v "} catch" | head -30"""),
    ("{repo}", r"""git ls-files | grep -i -v "^src/\|^e2e/\|^public/\|^docs/" | head -60; echo ----; git grep -n -i "proxy\|posthog" -- README.md .github 'scripts/*' 2>/dev/null | head -20"""),
    ("{repo}", r"""grep -n -B14 -A10 '<<<<<<<' apps/web/src/components/movie-database/media-table-cells.tsx apps/web/src/components/ai-chat/markdown-content.tsx"""),
    ("{repo}", r"""sed -n 1,12p packages/ui/src/components/header-controls.tsx; grep -c "<<<<<<<" packages/ui/src/components/header-controls.tsx; ls -d apps/web/.next 2>/dev/null && du -sh apps/web/.next | cut -f1"""),
    ("{repo}", r"""pnpm test 2>&1 | grep -E "FAIL " | sed 's/ >.*//' | sort -u"""),
    ("{repo}", r"""grep -rn "<b[ >]\|<strong[ >]" src/components | grep -v guides | grep -v '/ui/'"""),
    ("{repo}", r"""echo "strong count:" $(grep -ro "<strong" src/ | wc -l) && echo "b count:" $(grep -ro "<b[ >]" src/ --include='*.tsx' | wc -l) && git diff --stat -- src | grep -c . """),
    ("{home}/.claude/hooks", r"""cd {home}/.claude/hooks && grep -c "def " {home}/.claude/hooks/deny-unprovable-search.py"""),
    ("{repo}", r"""cd {repo}/apps/web && pnpm exec tsc --noEmit 2>&1 > /tmp/tsc-out.txt; grep -c "error TS" /tmp/tsc-out.txt; echo "---apps/web errors---"; grep "apps/web/src" /tmp/tsc-out.txt"""),
    ("{repo}", r'''cd {repo}
grep "movie-database/(list)/page.tsx" /private/tmp/claude-501/scratchpad/component_css_sites.txt'''),
    ("{repo}/apps/web", r"""find node_modules/ai -name "*.d.ts" | xargs grep -l "ToolCallOptions" 2>/dev/null"""),
    ("{repo}", r"""find apps/web -iname "*.spec.ts" -path "*e2e*" | xargs grep -ln "movie-database\|filter" -i 2>/dev/null"""),
    ("{repo}", r"""grep -rln "phosphor-icons\|@phosphor-icons" apps/web/src packages/ui/src --include="*.tsx" | xargs grep -l "stylex.props(styles\." """),
    ("{repo}", r"""node --version; cat .nvmrc 2>/dev/null; find .github/workflows -iname "*.yml" 2>/dev/null | xargs grep -l "node-version" 2>/dev/null"""),
    ("{repo}", r"""grep -o "\[PostHog.js\][^@]*" "$(ls -t {repo}/.playwright-cli/console-*.log | head -1)" | head -30"""),
    ("{repo}", r"""D={repo}; git -C "$D" diff --stat | tail -1; echo "new files: $(git -C "$D" status --short | grep -c '^??')"; a=$(find "$D/packages/ui/src/components" -type f ! -name '*.test.tsx' | xargs cat | wc -l); ac=$(find "$D/packages/ui/src/components" -type f ! -name '*.test.tsx' | xargs cat | grep -cE '^\s*(//|/\*|\*)'); echo "non-test lines: 9977 -> $a; comment lines: 2482 -> $ac"; echo "multi-component files:"; for f in "$D"/packages/ui/src/components/*.tsx; do case "$f" in *.test.tsx) continue;; esac; n=$(grep -cE "^(export )?function [A-Z][A-Za-z]*" "$f"); [ "$n" -ne 1 ] && echo "$n $f"; done; echo "(none above = all single)"; echo "longest body:"; for f in "$D"/packages/ui/src/components/*.tsx; do case "$f" in *.test.tsx) continue;; esac; awk -v file="$(basename $f)" '/^(export )?function [A-Za-z_]+/ {start=NR} /^}$/ && start {len=NR-start+1; if (len>150) printf "%4d %s\n", len, file; start=0}' "$f"; done | sort -rn | head -3"""),
    ("{repo}", r'''cd {repo}/packages/ui && ls src/components/*.test.* 2>/dev/null | grep -E "segmented-control|select\.|selection-mark|sidebar-layout|single-select-group|skeleton|slider|spinner|sticky-control-group|sticky-controls|switch|table|text-field|text\.|textarea|use-roving-focus|use-sheet-cap|use-surface-morph"'''),
    ("{repo}", r"""D={repo}/packages/ui/src
for name in BlurPlaneContext BlurPlaneProvider BreadcrumbAnchor CardContent CardDescription CardFooter CardHeader CardTitle; do
  count=$(grep -rl "$name" "$D" | wc -l)
  echo "$name -> files:$count"
done"""),
    ("{repo}", r"""cd {repo}
for f in avatar.tsx blur-layer-steps.ts breadcrumb.tsx build-blur-layers.ts button-shared.stylex.ts button.tsx; do
  before=$(git show HEAD:packages/ui/src/components/$f | grep -cE '^\s*(//|/\*|\*)')
  echo "$f: before=$before"
done"""),
    ("{home}/.claude", r"""cd {home}/.claude/hooks && grep --version"""),
]

DENIED_FROM_TRANSCRIPTS = [
    ("{repo}", r"""grep -rn "require-package-export" --include="*.mjs" --include="*.js" --include="*.ts" -l . | grep -v node_modules"""),
    ("{repo}", r'''cd {repo}/apps/web
grep -i "posthog" .env.local'''),
    ("{repo}", r"""cd {repo}; grep -n "POSTHOG\|VERCEL" apps/web/.env.example"""),
    ("{repo}", r"""cd {repo}/apps/web && grep -rn "ANTHROPIC_API_KEY\|process.env" src/app/api/ai-chat/route.ts 2>/dev/null | head -20"""),
    ("{repo}", r"""cd {repo}
grep -n "client-runtime\|server-runtime\|use client\|useDirective\|directive" packages/i18n-babel-plugin/src/index.js | head -60"""),
    ("{repo}", r"""cd {repo}/apps/web; ls -la | grep -i env; echo "=== .env.example ==="; grep -n "POSTHOG" .env.example"""),
    ("{repo}", r"""cd packages/ui && grep -n -B6 -A30 "Scroll mask" CONTEXT.md | head -80"""),
    ("{repo}", r"""cd packages/ui/src && grep -rn "defineVars" --include="*.ts" . | grep -v _generated"""),
    ("{repo}", r"""cd {repo}; grep -n '"lint' package.json"""),
    ("{repo}", r"""PW=$(npm root -g)/@playwright/cli; grep -rn 'cdn\.playwright\.dev\|prss\.microsoft\.com' "$PW" 2>/dev/null | grep -v '\.md:' | head -8 | cut -c1-220"""),
    ("{repo}", r"""grep -rn "defineConsts" $(ls -d node_modules/.pnpm/@stylexjs+stylex@*/node_modules/@stylexjs/stylex 2>/dev/null | head -1) --include="*.d.ts" | head -20"""),
    ("{repo}", r"""P=$(find node_modules/.pnpm -maxdepth 1 -name "@stylexjs+babel-plugin*" | head -1); echo "$P"; grep -rn "supports" "$P/node_modules/@stylexjs/babel-plugin/lib" 2>/dev/null | grep -i "@supports\|startsWith('@')\|at-rule\|atRule" | head -15"""),
    ("{repo}", r"""find / -name "movie-db.yml" 2>/dev/null"""),
    ("{repo}", r"""find / -maxdepth 8 -name "movie-db.yml" 2>/dev/null"""),
    ("{repo}", r'''find {repo} -maxdepth 2 -iname "tsconfig*.json" -not -path "*/node_modules/*"'''),
    ("{repo}", r'''grep -rn "internal" {repo}/packages/ui/eslint.config* {repo}/eslint.config* 2>/dev/null
find {repo}/packages/ui -iname "eslint*" -maxdepth 1
find {repo} -maxdepth 1 -iname "eslint*"'''),
    ("{repo}", r"""find {repo} -maxdepth 3 -name "package.json" -exec grep -l "browserslist" {} \;"""),
    ("{repo}", r"""find . -path ./node_modules -prune -o -name "*.ts" -print | xargs grep -ln "ReturnType<typeof styles\." 2>/dev/null"""),
]


class TranscriptCommands(HookCase):
    def test_allowed(self):
        for cwd, command in ALLOWED_FROM_TRANSCRIPTS:
            self.assert_allowed(command, cwd)

    def test_denied(self):
        for cwd, command in DENIED_FROM_TRANSCRIPTS:
            self.assert_denied(command, cwd)


if __name__ == "__main__":
    unittest.main()
