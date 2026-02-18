import os
import asyncio
import websockets
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = "gpt-4o-realtime-preview-2024-12-17"
OPENAI_WS_URL = f"wss://api.openai.com/v1/realtime?model={MODEL}"

app = FastAPI()


@app.websocket("/ws")
async def relay(websocket: WebSocket):
    await websocket.accept()
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "OpenAI-Beta": "realtime=v1",
    }
    async with websockets.connect(OPENAI_WS_URL, additional_headers=headers) as openai_ws:
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


# StaticFiles LAST — after route registration
app.mount("/", StaticFiles(directory="static", html=True), name="static")
