import json

from tools.dispatcher import execute_tool


async def handle_tool_calls_event(event: dict, openai_ws) -> None:
    if event.get("type") != "response.done":
        return

    for item in event.get("response", {}).get("output", []):
        if item.get("type") != "function_call":
            continue

        result = execute_tool(item["name"], item.get("arguments", "{}"))
        await openai_ws.send(
            json.dumps(
                {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "call_id": item["call_id"],
                        "output": result,
                    },
                }
            )
        )
        await openai_ws.send(json.dumps({"type": "response.create"}))
