from fastapi import APIRouter, WebSocket

from config import REALTIME_BASE_URL, REALTIME_MODEL, API_KEY
from services.openai_ws import build_openai_ws_url
from services.relay import run_relay
from services.session_config import build_session_config

router = APIRouter()


@router.websocket("/ws")
async def relay(websocket: WebSocket) -> None:
    # User-supplied key takes priority over server key
    api_key = websocket.query_params.get("api_key") or API_KEY
    if not api_key:
        await websocket.close(code=4001, reason="API key required")
        return

    await websocket.accept()
    openai_ws_url = build_openai_ws_url(REALTIME_BASE_URL, REALTIME_MODEL)
    await run_relay(websocket, api_key, openai_ws_url, build_session_config())
