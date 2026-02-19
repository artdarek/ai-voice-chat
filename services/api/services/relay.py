import asyncio
import json

import websockets
from fastapi import WebSocket

from services.tool_calls import handle_tool_calls_event


async def _browser_to_openai(browser_ws: WebSocket, openai_ws) -> None:
    async for msg in browser_ws.iter_text():
        await openai_ws.send(msg)


async def _openai_to_browser(browser_ws: WebSocket, openai_ws) -> None:
    async for msg in openai_ws:
        if isinstance(msg, bytes):
            await browser_ws.send_bytes(msg)
            continue

        await browser_ws.send_text(msg)
        try:
            event = json.loads(msg)
        except json.JSONDecodeError:
            continue

        await handle_tool_calls_event(event, openai_ws)


async def run_relay(browser_ws: WebSocket, api_key: str, openai_ws_url: str, session_config: dict) -> None:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Beta": "realtime=v1",
    }

    async with websockets.connect(openai_ws_url, additional_headers=headers) as openai_ws:
        await openai_ws.send(json.dumps(session_config))

        _, pending = await asyncio.wait(
            [
                asyncio.create_task(_browser_to_openai(browser_ws, openai_ws)),
                asyncio.create_task(_openai_to_browser(browser_ws, openai_ws)),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
