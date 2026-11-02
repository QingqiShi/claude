#!/usr/bin/env python3
"""Run with: python3 -m unittest discover -s ~/.claude/hooks/tests"""
import glob
import json
import os
import subprocess
import tempfile
import unittest

HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "clear-stale-handoff.py")


class ClearStaleHandoffTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = os.path.realpath(self.temp.name)
        subprocess.run(["git", "init", "-q", self.repo], check=True)
        self.handoff = os.path.join(self.repo, "HANDOFF.md")
        with open(self.handoff, "w", encoding="utf-8") as file:
            file.write("## North Star\n")

    def tearDown(self):
        self.temp.cleanup()

    def run_hook(self, source):
        result = subprocess.run(
            ["python3", HOOK],
            input=json.dumps({"cwd": self.repo, "source": source}),
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    def test_new_session_moves_handoff_into_git_dir(self):
        output = self.run_hook("startup")
        self.assertFalse(os.path.exists(self.handoff))
        moved = glob.glob(os.path.join(self.repo, ".git", "stale-handoffs", "*.md"))
        self.assertEqual(len(moved), 1)
        self.assertIn(moved[0], json.loads(output)["hookSpecificOutput"]["additionalContext"])

    def test_continued_session_keeps_handoff(self):
        for source in ("clear", "compact", "resume", "fork"):
            self.assertEqual(self.run_hook(source), "")
            self.assertTrue(os.path.isfile(self.handoff))


if __name__ == "__main__":
    unittest.main()
