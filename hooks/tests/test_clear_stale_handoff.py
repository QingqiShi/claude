#!/usr/bin/env python3
"""Run with: python3 -m unittest discover -s ~/.claude/hooks/tests"""
import glob
import json
import os
import subprocess
import tempfile
import unittest

HOOKS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOK = os.path.join(HOOKS, "clear-stale-handoff.py")
RULES = os.path.join(HOOKS, "session-memory.md")


class ClearStaleHandoffTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = os.path.join(os.path.realpath(self.temp.name), "repo")
        self.handoff_dir = os.path.join(os.path.realpath(self.temp.name), "handoffs")
        subprocess.run(["git", "init", "-q", self.repo], check=True)
        self.handoff = os.path.join(self.repo, "HANDOFF.md")
        with open(self.handoff, "w", encoding="utf-8") as file:
            file.write("## North Star\n")

    def tearDown(self):
        self.temp.cleanup()

    def run_hook(self, source, host_session_id=None):
        env = {key: value for key, value in os.environ.items() if key != "CLAUDE_CODE_HOST_SESSION_ID"}
        env["CLAUDE_HANDOFF_DIR"] = self.handoff_dir
        if host_session_id is not None:
            env["CLAUDE_CODE_HOST_SESSION_ID"] = host_session_id
        result = subprocess.run(
            ["python3", HOOK],
            input=json.dumps({"cwd": self.repo, "source": source}),
            capture_output=True,
            text=True,
            check=True,
            env=env,
        )
        return result.stdout

    def context(self, output):
        return json.loads(output)["hookSpecificOutput"]["additionalContext"]

    def test_terminal_new_session_moves_handoff_into_git_dir(self):
        output = self.run_hook("startup")
        self.assertFalse(os.path.exists(self.handoff))
        moved = glob.glob(os.path.join(self.repo, ".git", "stale-handoffs", "*.md"))
        self.assertEqual(len(moved), 1)
        self.assertIn(moved[0], self.context(output))

    def test_terminal_continued_session_keeps_handoff(self):
        for source in ("clear", "compact", "resume", "fork"):
            context = self.context(self.run_hook(source))
            self.assertIn(self.handoff, context)
            self.assertIn("Read it before you start", context)
            self.assertTrue(os.path.isfile(self.handoff))

    def test_every_start_carries_the_rules(self):
        with open(RULES, encoding="utf-8") as file:
            rules = file.read().strip()
        for source, host_session_id in (("startup", None), ("clear", None), ("startup", "local_abc"), ("compact", "local_abc")):
            self.assertIn(rules, self.context(self.run_hook(source, host_session_id)))

    def test_terminal_outside_a_repository_says_nothing(self):
        result = subprocess.run(
            ["python3", HOOK],
            input=json.dumps({"cwd": os.path.realpath(self.temp.name), "source": "startup"}),
            capture_output=True,
            text=True,
            check=True,
            env={key: value for key, value in os.environ.items() if key != "CLAUDE_CODE_HOST_SESSION_ID"},
        )
        self.assertEqual(result.stdout, "")

    def test_desktop_startup_without_file_names_path_and_leaves_repo_handoff(self):
        output = self.run_hook("startup", "local_abc")
        expected = os.path.join(self.handoff_dir, "local_abc.md")
        context = self.context(output)
        self.assertIn(expected, context)
        self.assertIn("does not exist yet", context)
        self.assertIn(self.handoff, context)
        self.assertFalse(os.path.exists(expected))
        self.assertTrue(os.path.isfile(self.handoff))

    def test_desktop_startup_with_existing_file_says_to_read_it(self):
        os.makedirs(self.handoff_dir)
        path = os.path.join(self.handoff_dir, "local_abc.md")
        with open(path, "w", encoding="utf-8") as file:
            file.write("## North Star\n")
        for source in ("startup", "clear", "compact", "resume"):
            context = self.context(self.run_hook(source, "local_abc"))
            self.assertIn(path, context)
            self.assertIn("Read it before you start", context)
            with open(path, encoding="utf-8") as file:
                self.assertEqual(file.read(), "## North Star\n")

    def test_desktop_different_host_ids_get_different_paths(self):
        first = self.context(self.run_hook("startup", "local_one"))
        second = self.context(self.run_hook("startup", "local_two"))
        self.assertIn(os.path.join(self.handoff_dir, "local_one.md"), first)
        self.assertIn(os.path.join(self.handoff_dir, "local_two.md"), second)
        self.assertNotIn("local_two", first)

    def test_empty_host_id_uses_terminal_path(self):
        self.run_hook("startup", "")
        self.assertFalse(os.path.exists(self.handoff))


if __name__ == "__main__":
    unittest.main()
