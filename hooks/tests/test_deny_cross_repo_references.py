#!/usr/bin/env python3
"""Run with: python3 -m unittest discover -s ~/.claude/hooks/tests"""
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "deny-cross-repo-references.py")


def load_hook():
    spec = importlib.util.spec_from_file_location("deny_cross_repo_references", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HookCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hook = load_hook()
        cls.temp = tempfile.TemporaryDirectory()
        cls.repo = os.path.realpath(cls.temp.name)
        subprocess.run(["git", "init", "-q", cls.repo], check=True)
        subprocess.run(["git", "-C", cls.repo, "remote", "add", "origin", "git@github.com:Owner/own-repo.git"], check=True)
        cls.body_file = os.path.join(cls.repo, "body.md")
        with open(cls.body_file, "w") as handle:
            handle.write("Waits on facebook/stylex#1790.\n")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def decide(self, command, cwd=None):
        return self.hook.decide({"tool_input": {"command": command}, "cwd": cwd or self.repo})

    def assertDenied(self, command, mentioning):
        reason = self.decide(command)
        self.assertIsNotNone(reason, command)
        self.assertIn(mentioning, reason)

    def assertAllowed(self, command):
        self.assertIsNone(self.decide(command), command)

    def test_pr_body_with_shorthand_is_denied(self):
        self.assertDenied('gh pr create --title "x" --body "Blocked on facebook/stylex#1790"', "facebook/stylex#1790")

    def test_comment_heredoc_with_url_is_denied(self):
        command = 'gh pr comment 12 --body "$(cat <<\'EOF\'\nSee https://github.com/facebook/stylex/issues/1790\nEOF\n)"'
        self.assertDenied(command, "facebook/stylex#1790")

    def test_close_with_comment_is_denied(self):
        self.assertDenied("gh pr close 12 --comment 'superseded, see vercel/next.js#100'", "vercel/next.js#100")

    def test_api_patch_is_denied(self):
        self.assertDenied("gh api -X PATCH repos/Owner/own-repo/issues/comments/1 -f body='see babel/babel#5'", "babel/babel#5")

    def test_body_file_is_read(self):
        self.assertDenied(f"gh pr create -t x --body-file {self.body_file}", "facebook/stylex#1790")

    def test_commit_message_is_denied(self):
        self.assertDenied("git commit -m 'fix: work around facebook/stylex#1790'", "facebook/stylex#1790")

    def test_same_repository_references_are_allowed(self):
        self.assertAllowed("gh pr comment 12 --body 'Closes #11, follows Owner/own-repo#9 and https://github.com/Owner/own-repo/pull/8'")

    def test_plain_text_is_allowed(self):
        self.assertAllowed("gh pr create -t 'build: pin Babel 7' -b 'Remove when StyleX supports Babel 8.'")

    def test_read_only_gh_is_allowed(self):
        self.assertAllowed("gh api repos/facebook/stylex/issues/1790/timeline --paginate")
        self.assertAllowed("gh pr view 12 --json body")
        self.assertAllowed("gh issue list --search 'facebook/stylex#1790'")

    def test_other_commands_are_allowed(self):
        self.assertAllowed("echo facebook/stylex#1790 >> notes.md")
        self.assertAllowed("grep -rn 'facebook/stylex#1790' .")

    def test_no_remote_treats_every_reference_as_foreign(self):
        with tempfile.TemporaryDirectory() as bare:
            reason = self.decide("git commit -m 'see Owner/own-repo#9'", cwd=bare)
            self.assertIsNotNone(reason)

    def test_hook_process_denies_via_stdout(self):
        payload = '{"tool_input": {"command": "gh pr comment 1 -b \'facebook/stylex#1790\'"}, "cwd": "%s"}' % self.repo
        result = subprocess.run([sys.executable, HOOK], input=payload, capture_output=True, text=True, check=True)
        self.assertIn('"permissionDecision": "deny"', result.stdout)

    def test_hook_process_is_silent_when_allowed(self):
        payload = '{"tool_input": {"command": "gh pr view 1"}, "cwd": "%s"}' % self.repo
        result = subprocess.run([sys.executable, HOOK], input=payload, capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
