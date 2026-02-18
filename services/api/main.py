import os
import json
import asyncio
import pathlib
import websockets
from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

SERVER_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("OPENAI_MODEL", "gpt-realtime-mini-2025-12-15")
TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
OPENAI_WS_URL = f"wss://api.openai.com/v1/realtime?model={MODEL}"

SYSTEM_PROMPT = os.getenv(
    "OPENAI_SYSTEM_PROMPT",
    "You are a friendly and polite assistant. Be warm, helpful, and concise in your responses.",
)

SESSION_CONFIG = {
    "type": "session.update",
    "session": {
        "modalities": ["audio", "text"],
        "instructions": SYSTEM_PROMPT,
        "input_audio_transcription": {"model": TRANSCRIPTION_MODEL},
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 600,
        },
    },
}

app = FastAPI()


@app.get("/config")
async def config():
    """Tell the frontend whether the server has a configured API key."""
    return JSONResponse({"server_key": bool(SERVER_API_KEY)})


@app.websocket("/ws")
async def relay(websocket: WebSocket):
    # User-supplied key takes priority over server key
    api_key = websocket.query_params.get("api_key") or SERVER_API_KEY
    if not api_key:
        await websocket.close(code=4001, reason="API key required")
        return

    await websocket.accept()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Beta": "realtime=v1",
    }
    async with websockets.connect(OPENAI_WS_URL, additional_headers=headers) as openai_ws:
        await openai_ws.send(json.dumps(SESSION_CONFIG))

        async def browser_to_openai():
            async for msg in websocket.iter_text():
                await openai_ws.send(msg)

        async def openai_to_browser():
            async for msg in openai_ws:
                if isinstance(msg, bytes):
                    await websocket.send_bytes(msg)
                else:
                    await websocket.send_text(msg)

        _, pending = await asyncio.wait(
            [
                asyncio.create_task(browser_to_openai()),
                asyncio.create_task(openai_to_browser()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()


# StaticFiles — for local dev only (make run); in Docker nginx serves services/website/
STATIC_DIR = pathlib.Path(__file__).parent.parent / "website"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
