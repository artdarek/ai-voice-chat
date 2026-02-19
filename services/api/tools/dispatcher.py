import json

from tools.handlers import get_ai_team_members


_TOOL_HANDLERS = {
    "get_ai_team_members": get_ai_team_members,
}


def execute_tool(name: str, arguments_json: str) -> str:
    try:
        json.loads(arguments_json or "{}")
    except json.JSONDecodeError:
        return json.dumps(
            {
                "error": {
                    "type": "invalid_arguments",
                    "message": "Invalid arguments",
                    "tool": name,
                }
            }
        )

    handler = _TOOL_HANDLERS.get(name)
    if handler is None:
        return json.dumps(
            {
                "error": {
                    "type": "unknown_tool",
                    "message": f"Unknown tool: {name}",
                    "tool": name,
                }
            }
        )

    try:
        return json.dumps(handler())
    except Exception as exc:
        return json.dumps(
            {
                "error": {
                    "type": "tool_execution_failed",
                    "message": "Tool execution failed",
                    "tool": name,
                    "details": str(exc),
                }
            }
        )
