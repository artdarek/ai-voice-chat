import json
import asyncio
import pathlib
import websockets
from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from config import SERVER_API_KEY, OPENAI_WS_URL, SESSION_CONFIG

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
