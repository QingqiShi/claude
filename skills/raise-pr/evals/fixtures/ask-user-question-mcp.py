#!/usr/bin/env python3
"""MCP server that shims AskUserQuestion for eval purposes.

Captures tool call arguments to a JSON file so assertions can verify
that the model attempted to use AskUserQuestion with the right options.

Usage:
  GH_SHIM_CAPTURE_DIR=/tmp/some-dir python3 ask-user-question-mcp.py

The server communicates over stdin/stdout using newline-delimited JSON-RPC
(MCP stdio transport). Captures are written to
$GH_SHIM_CAPTURE_DIR/ask_user_question_args.json.
"""

import json
import os
import sys


def write_response(response):
    """Write a JSON-RPC response as a single line to stdout."""
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def handle_initialize(msg):
    write_response({
        "jsonrpc": "2.0",
        "id": msg["id"],
        "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {
                "name": "ask-user-question-shim",
                "version": "1.0.0",
            },
        },
    })


def handle_tools_list(msg):
    write_response({
        "jsonrpc": "2.0",
        "id": msg["id"],
        "result": {
            "tools": [
                {
                    "name": "AskUserQuestion",
                    "description": (
                        "Ask the user a question with options. "
                        "Use this to gather preferences, clarify instructions, "
                        "or offer choices."
                    ),
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "questions": {
                                "type": "array",
                                "description": "Questions to ask the user",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "question": {"type": "string"},
                                        "header": {"type": "string"},
                                        "options": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "label": {"type": "string"},
                                                    "description": {"type": "string"},
                                                },
                                                "required": ["label", "description"],
                                            },
                                        },
                                        "multiSelect": {
                                            "type": "boolean",
                                            "default": False,
                                        },
                                    },
                                    "required": ["question", "header", "options", "multiSelect"],
                                },
                            },
                        },
                        "required": ["questions"],
                    },
                }
            ]
        },
    })


def handle_tool_call(msg):
    params = msg.get("params", {})
    tool_name = params.get("name", "")
    arguments = params.get("arguments", {})

    capture_dir = os.environ.get("GH_SHIM_CAPTURE_DIR", "/tmp")
    capture_file = os.path.join(capture_dir, "ask_user_question_args.json")

    with open(capture_file, "w") as f:
        json.dump({"tool": tool_name, "arguments": arguments}, f, indent=2)

    # Return a simulated user response (pick the first option)
    questions = arguments.get("questions", [])
    answer_text = "Option 1 selected"
    if questions and questions[0].get("options"):
        first_label = questions[0]["options"][0].get("label", "Option 1")
        answer_text = f"User selected: {first_label}"

    write_response({
        "jsonrpc": "2.0",
        "id": msg["id"],
        "result": {
            "content": [{"type": "text", "text": answer_text}],
        },
    })


def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break  # EOF
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        method = msg.get("method", "")

        if method == "initialize":
            handle_initialize(msg)
        elif method == "notifications/initialized":
            pass  # No response needed for notifications
        elif method == "tools/list":
            handle_tools_list(msg)
        elif method == "tools/call":
            handle_tool_call(msg)
        else:
            # Unknown method — respond with error if it has an id
            if "id" in msg:
                write_response({
                    "jsonrpc": "2.0",
                    "id": msg["id"],
                    "error": {
                        "code": -32601,
                        "message": f"Method not found: {method}",
                    },
                })


if __name__ == "__main__":
    main()
