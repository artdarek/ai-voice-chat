from fastapi import APIRouter, WebSocket

from services.provider_config import ProviderConfigError, resolve_provider_connection
from services.relay import run_relay
from services.session_config import build_session_config

router = APIRouter()


@router.websocket("/ws")
async def relay(websocket: WebSocket) -> None:
    provider = websocket.query_params.get("provider")
    user_api_key = websocket.query_params.get("api_key")
    requested_model = websocket.query_params.get("model")
    requested_deployment = websocket.query_params.get("deployment")

    try:
        connection = resolve_provider_connection(
            provider,
            user_api_key,
            requested_model,
            requested_deployment,
        )
    except ProviderConfigError as exc:
        await websocket.close(code=4001, reason=str(exc))
        return

    await websocket.accept()
    await run_relay(
        websocket,
        connection.ws_url,
        connection.headers,
        build_session_config(connection.provider),
    )
