#!/usr/bin/env python3
"""Run with: python3 -m unittest discover -s ~/.claude/hooks/tests"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "require-agent-model.sh")


def write_agent(path, name, model=None, body=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = ["---", f"name: {name}"]
    if model:
        lines.append(f"model: {model}")
    lines.append("---")
    lines.append("")
    lines.append(body or f"Body text for {name}.")
    with open(path, "w") as handle:
        handle.write("\n".join(lines) + "\n")


class HookCase(unittest.TestCase):
    """Fixtures: a fake $HOME with a plugin manifest, a plugin agent that
    declares model in frontmatter, one that does not, and a user agent; plus
    a separate project dir used as cwd with its own project agent."""

    @classmethod
    def setUpClass(cls):
        cls.home_dir_obj = tempfile.TemporaryDirectory()
        cls.project_dir_obj = tempfile.TemporaryDirectory()
        cls.home = os.path.realpath(cls.home_dir_obj.name)
        cls.project = os.path.realpath(cls.project_dir_obj.name)

        # Plugin agent that declares model in frontmatter, with a body that
        # mentions "model" too -- the body mention must not be what allows it.
        codex_agents = os.path.join(
            cls.home, ".claude/plugins/cache/openai-codex/codex/1.0.6/agents"
        )
        write_agent(
            os.path.join(codex_agents, "codex-rescue.md"),
            "codex-rescue",
            model="sonnet",
            body="Leave model unset by default. Only add --model when asked.",
        )

        # Plugin agent with no model in frontmatter; body mentions "model".
        demo_agents = os.path.join(
            cls.home, ".claude/plugins/cache/some-market/demo/2.0.0/agents"
        )
        write_agent(
            os.path.join(demo_agents, "demo-agent.md"),
            "demo-agent",
            model=None,
            body="This body talks about a model but does not set one.",
        )

        manifest = {
            "version": 2,
            "plugins": {
                "codex@openai-codex": [
                    {
                        "scope": "user",
                        "installPath": os.path.join(
                            cls.home, ".claude/plugins/cache/openai-codex/codex/1.0.6"
                        ),
                    }
                ],
                "demo@some-market": [
                    {
                        "scope": "user",
                        "installPath": os.path.join(
                            cls.home, ".claude/plugins/cache/some-market/demo/2.0.0"
                        ),
                    }
                ],
            },
        }
        manifest_path = os.path.join(cls.home, ".claude/plugins/installed_plugins.json")
        os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
        with open(manifest_path, "w") as handle:
            json.dump(manifest, handle)

        # User agent under $HOME/.claude/agents with model in frontmatter.
        write_agent(
            os.path.join(cls.home, ".claude/agents/user-agent.md"),
            "user-agent",
            model="opus",
        )

        # Project agent under <cwd>/.claude/agents with model in frontmatter.
        write_agent(
            os.path.join(cls.project, ".claude/agents/proj-agent.md"),
            "proj-agent",
            model="opus",
        )

        # Project agent that says "inherit" -- it made no cost choice, so it
        # must not count as a declared model.
        write_agent(
            os.path.join(cls.project, ".claude/agents/inherit-agent.md"),
            "inherit-agent",
            model="inherit",
        )

    @classmethod
    def tearDownClass(cls):
        cls.home_dir_obj.cleanup()
        cls.project_dir_obj.cleanup()

    def run_hook(self, tool_input, cwd=None):
        payload = {
            "tool_name": "Agent",
            "tool_input": tool_input,
            "cwd": cwd if cwd is not None else self.project,
        }
        env = dict(os.environ, HOME=self.home)
        return subprocess.run(
            ["bash", HOOK],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            env=env,
        )

    def assert_allowed(self, result):
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "")

    def assert_denied(self, result):
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"permissionDecision": "deny"', result.stdout)

    def test_no_model_plain_unknown_type_denies(self):
        result = self.run_hook({"subagent_type": "Explore", "prompt": "x"})
        self.assert_denied(result)

    def test_explicit_model_allows(self):
        result = self.run_hook(
            {"subagent_type": "Explore", "model": "sonnet", "prompt": "x"}
        )
        self.assert_allowed(result)

    def test_fork_without_model_allows(self):
        result = self.run_hook({"subagent_type": "fork", "prompt": "x"})
        self.assert_allowed(result)

    def test_plugin_agent_with_frontmatter_model_allows(self):
        """codex:codex-rescue has model: sonnet in frontmatter and no model
        param. This must fail (deny) before the fix and pass after it."""
        result = self.run_hook({"subagent_type": "codex:codex-rescue", "prompt": "x"})
        self.assert_allowed(result)

    def test_plugin_agent_without_frontmatter_model_denies(self):
        result = self.run_hook({"subagent_type": "demo:demo-agent", "prompt": "x"})
        self.assert_denied(result)

    def test_project_agent_with_model_allows(self):
        result = self.run_hook({"subagent_type": "proj-agent", "prompt": "x"})
        self.assert_allowed(result)

    def test_user_agent_with_model_allows(self):
        result = self.run_hook({"subagent_type": "user-agent", "prompt": "x"})
        self.assert_allowed(result)

    def test_agent_with_model_inherit_denies(self):
        result = self.run_hook({"subagent_type": "inherit-agent", "prompt": "x"})
        self.assert_denied(result)

    def test_plugin_not_installed_denies(self):
        result = self.run_hook({"subagent_type": "nosuch:agent", "prompt": "x"})
        self.assert_denied(result)


if __name__ == "__main__":
    unittest.main()
