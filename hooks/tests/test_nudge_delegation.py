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
HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "nudge-delegation.py")


def load_hook():
    spec = importlib.util.spec_from_file_location("nudge_delegation", HOOK)
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
BASH_PRE_CALL = {
    "session_id": "s1",
    "hook_event_name": "PreToolUse",
    "tool_name": "Bash",
    "tool_input": {"command": "ls"},
    "transcript_path": "/x/main.jsonl",
}
USER_PROMPT = {
    "session_id": "s1",
    "hook_event_name": "UserPromptSubmit",
    "prompt": "hi",
    "transcript_path": "/x/main.jsonl",
}


def nudge_text(output):
    return output["hookSpecificOutput"]["additionalContext"]


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

    def run_calls(self, n):
        outputs = [self.hook.decide(BASH_CALL) for _ in range(n)]
        return outputs[-1]

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
        self.run_calls(3)
        self.assertEqual(self.count("s1"), 3)
        self.assertIsNone(self.hook.decide(USER_PROMPT))
        self.assertEqual(self.count("s1"), 0)

    def test_five_bash_calls_are_silent_sixth_nudges(self):
        for _ in range(5):
            self.assertIsNone(self.hook.decide(BASH_CALL))
        output = self.hook.decide(BASH_CALL)
        self.assertIsNotNone(output)
        self.assertIn("6 tool calls", nudge_text(output))
        self.assertIn("Remember the delegation rule", nudge_text(output))

    def test_twelfth_nudges_again_seven_through_eleven_silent(self):
        self.run_calls(6)
        for _ in range(5):
            self.assertIsNone(self.hook.decide(BASH_CALL))
        output = self.hook.decide(BASH_CALL)
        self.assertIn("12 tool calls", nudge_text(output))
        self.assertIn("strong indication you are doing something wrong", nudge_text(output))

    def test_stages_escalate_to_hard_block(self):
        self.run_calls(12)
        self.assertIn("DANGER, DANGER. COST ALERT. 18 tool calls", nudge_text(self.run_calls(6)))
        self.assertIn("you will be terminated", nudge_text(self.run_calls(6)))
        thirtieth = nudge_text(self.run_calls(6))
        self.assertIn("HARD BLOCK. 30 tool calls", thirtieth)
        self.assertIn("let the user decide", thirtieth)

    def test_beyond_block_keeps_hard_block_wording(self):
        self.run_calls(30)
        self.assertIn("HARD BLOCK. 36 tool calls", nudge_text(self.run_calls(6)))

    def test_pre_tool_use_allows_below_block(self):
        self.run_calls(29)
        self.assertIsNone(self.hook.decide(BASH_PRE_CALL))
        self.assertEqual(self.count("s1"), 29)

    def test_pre_tool_use_denies_counted_tools_at_block(self):
        self.run_calls(30)
        output = self.hook.decide(BASH_PRE_CALL)
        decision = output["hookSpecificOutput"]
        self.assertEqual(decision["hookEventName"], "PreToolUse")
        self.assertEqual(decision["permissionDecision"], "deny")
        self.assertIn("HARD BLOCK. 30 tool calls", decision["permissionDecisionReason"])
        self.assertIn("let the user decide", decision["permissionDecisionReason"])
        self.assertEqual(self.count("s1"), 30)

    def test_pre_tool_use_still_allows_agent_and_excluded_tools_at_block(self):
        self.run_calls(30)
        for tool in ("Agent", "AskUserQuestion", "Skill", "ToolSearch", "SendMessage", "TaskOutput", "TaskStop", "Monitor"):
            self.assertIsNone(self.hook.decide(dict(BASH_PRE_CALL, tool_name=tool)), tool)

    def test_block_lifts_on_user_prompt_or_agent_call(self):
        self.run_calls(30)
        self.hook.decide(USER_PROMPT)
        self.assertIsNone(self.hook.decide(BASH_PRE_CALL))
        self.run_calls(30)
        self.hook.decide(dict(BASH_CALL, tool_name="Agent", tool_response={"content": "report"}))
        self.assertIsNone(self.hook.decide(BASH_PRE_CALL))

    def test_pre_tool_use_skips_subagents(self):
        self.run_calls(30)
        payload = dict(BASH_PRE_CALL, transcript_path="/x/main/subagents/agent-1.jsonl")
        self.assertIsNone(self.hook.decide(payload))

    def test_excluded_tools_do_not_increment(self):
        for tool in ("Skill", "ToolSearch", "AskUserQuestion", "SendMessage", "TaskOutput", "TaskStop", "Monitor"):
            payload = dict(BASH_CALL, tool_name=tool)
            self.assertIsNone(self.hook.decide(payload))
        self.assertEqual(self.count("s1"), 0)

    def test_agent_call_resets_and_is_silent(self):
        for response in ("report text", "Async agent launched successfully, id=123"):
            self.run_calls(3)
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

    def test_inferred_pre_tool_use_from_tool_name_without_response(self):
        self.run_calls(30)
        payload = {"session_id": "s1", "tool_name": "Bash", "tool_input": {"command": "ls"}, "transcript_path": "/x/main.jsonl"}
        self.assertEqual(self.hook.decide(payload)["hookSpecificOutput"]["permissionDecision"], "deny")

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

    def test_hook_process_denies_via_stdout_at_block(self):
        env = dict(os.environ, CLAUDE_STRATEGY_NUDGE_DIR=self.temp.name)
        for _ in range(30):
            subprocess.run([sys.executable, HOOK], input=json.dumps(BASH_CALL), capture_output=True, text=True, check=True, env=env)
        result = subprocess.run([sys.executable, HOOK], input=json.dumps(BASH_PRE_CALL), capture_output=True, text=True, check=True, env=env)
        self.assertIn('"permissionDecision": "deny"', result.stdout)
        self.assertIn("HARD BLOCK", result.stdout)


if __name__ == "__main__":
    unittest.main()
