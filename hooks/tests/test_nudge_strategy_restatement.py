#!/usr/bin/env python3
"""Run with: python3 -m unittest discover -s ~/.claude/hooks/tests"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "nudge-strategy-restatement.py")


def load_hook():
    spec = importlib.util.spec_from_file_location("nudge_strategy_restatement", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASH_CALL = {
    "session_id": "s1",
    "hook_event_name": "PostToolUse",
    "tool_name": "Bash",
    "tool_input": {"command": "ls"},
    "tool_response": {"stdout": ""},
    "transcript_path": "/x/main.jsonl",
}


class HookCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hook = load_hook()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        os.environ["CLAUDE_STRATEGY_NUDGE_DIR"] = self.temp.name

    def tearDown(self):
        del os.environ["CLAUDE_STRATEGY_NUDGE_DIR"]
        self.temp.cleanup()

    def count(self, session_id):
        return self.hook.read_count(self.hook.state_path(session_id))

    def test_subagent_transcript_path_is_skipped(self):
        payload = dict(BASH_CALL, transcript_path="/x/main/subagents/agent-1.jsonl")
        self.assertIsNone(self.hook.decide(payload))
        self.assertEqual(self.count("s1"), 0)

    def test_nonempty_agent_id_is_skipped(self):
        payload = dict(BASH_CALL, agent_id="a1")
        self.assertIsNone(self.hook.decide(payload))
        self.assertEqual(self.count("s1"), 0)

    def test_missing_session_id_is_silent(self):
        payload = dict(BASH_CALL)
        del payload["session_id"]
        self.assertIsNone(self.hook.decide(payload))

    def test_user_prompt_submit_resets(self):
        for _ in range(3):
            self.hook.decide(BASH_CALL)
        self.assertEqual(self.count("s1"), 3)
        reason = self.hook.decide({
            "session_id": "s1",
            "hook_event_name": "UserPromptSubmit",
            "prompt": "hi",
            "transcript_path": "/x/main.jsonl",
        })
        self.assertIsNone(reason)
        self.assertEqual(self.count("s1"), 0)

    def test_five_bash_calls_are_silent_sixth_nudges(self):
        for _ in range(5):
            self.assertIsNone(self.hook.decide(BASH_CALL))
        reason = self.hook.decide(BASH_CALL)
        self.assertIsNotNone(reason)
        self.assertIn("6 tool calls", reason)
        self.assertIn("restate what you keep, what you delegate, and to which models", reason)

    def test_twelfth_nudges_again_seven_through_eleven_silent(self):
        for _ in range(6):
            self.hook.decide(BASH_CALL)
        for _ in range(5):
            self.assertIsNone(self.hook.decide(BASH_CALL))
        reason = self.hook.decide(BASH_CALL)
        self.assertIsNotNone(reason)
        self.assertIn("12 tool calls", reason)

    def test_excluded_tools_do_not_increment(self):
        for tool in ("Skill", "ToolSearch", "AskUserQuestion", "SendMessage", "TaskOutput", "TaskStop", "Monitor"):
            payload = dict(BASH_CALL, tool_name=tool)
            self.assertIsNone(self.hook.decide(payload))
        self.assertEqual(self.count("s1"), 0)

    def test_agent_call_resets_and_is_silent(self):
        for response in ("report text", "Async agent launched successfully, id=123"):
            for _ in range(3):
                self.hook.decide(BASH_CALL)
            payload = {
                "session_id": "s1",
                "hook_event_name": "PostToolUse",
                "tool_name": "Agent",
                "tool_response": {"content": response},
                "transcript_path": "/x/main.jsonl",
            }
            self.assertIsNone(self.hook.decide(payload))
            self.assertEqual(self.count("s1"), 0)

    def test_inferred_post_tool_use_from_tool_response(self):
        payload = {
            "session_id": "s2",
            "tool_name": "Bash",
            "tool_input": {"command": "ls"},
            "tool_response": {"stdout": ""},
            "transcript_path": "/x/main.jsonl",
        }
        for _ in range(5):
            self.assertIsNone(self.hook.decide(payload))
        self.assertIsNotNone(self.hook.decide(payload))

    def test_inferred_user_prompt_submit_from_prompt(self):
        self.hook.decide(BASH_CALL)
        payload = {"session_id": "s1", "prompt": "hi", "transcript_path": "/x/main.jsonl"}
        self.assertIsNone(self.hook.decide(payload))
        self.assertEqual(self.count("s1"), 0)

    def test_hook_process_is_silent_on_malformed_stdin(self):
        result = subprocess.run([sys.executable, HOOK], input="not json", capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.returncode, 0)

    def test_hook_process_is_silent_on_missing_session_id(self):
        payload = json.dumps({
            "hook_event_name": "PostToolUse", "tool_name": "Bash",
            "tool_input": {"command": "ls"}, "tool_response": {"stdout": ""},
        })
        result = subprocess.run(
            [sys.executable, HOOK], input=payload, capture_output=True, text=True, check=True,
            env=dict(os.environ, CLAUDE_STRATEGY_NUDGE_DIR=self.temp.name),
        )
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.returncode, 0)

    def test_hook_process_nudges_via_stdout_on_sixth_call(self):
        env = dict(os.environ, CLAUDE_STRATEGY_NUDGE_DIR=self.temp.name)
        payload = json.dumps(BASH_CALL)
        for _ in range(5):
            result = subprocess.run([sys.executable, HOOK], input=payload, capture_output=True, text=True, check=True, env=env)
            self.assertEqual(result.stdout, "")
        result = subprocess.run([sys.executable, HOOK], input=payload, capture_output=True, text=True, check=True, env=env)
        self.assertIn('"additionalContext"', result.stdout)
        self.assertIn("6 tool calls", result.stdout)


if __name__ == "__main__":
    unittest.main()
