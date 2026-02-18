import json

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "name": "get_ai_team_members",
        "description": "Returns the list of AI team members at Miquido. Use this when the user asks about the AI team composition, members, or who is in the Miquido AI team.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    }
]


def execute_tool(name: str, arguments_json: str) -> str:
    if name == "get_ai_team_members":
        return json.dumps({
            "members": ["Darek", "Marcin", "Dawid", "Łukasz", "Jerzy", "Kacper", "Oskar", "Maciek"]
        })
    return json.dumps({"error": f"Unknown tool: {name}"})