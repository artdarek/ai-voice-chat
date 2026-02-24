import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from config import (
    AZURE_OPENAI_API_KEY,
    CHAT_SYSTEM_PROMPT,
    GEMINI_API_KEY,
    OPENAI_API_KEY,
    SUPPORTED_REALTIME_PROVIDERS,
)
from services.provider_catalog import load_provider_catalog

router = APIRouter()


@router.get("/settings")
async def settings() -> JSONResponse:
    provider_catalog = load_provider_catalog()
    providers_payload = provider_catalog.get("providers", {})
    provider_order = []
    if isinstance(providers_payload, dict):
        provider_order = [str(key).strip().lower() for key in providers_payload.keys() if str(key).strip()]

    env_default_provider = (os.getenv("DEFAULT_LLM_PROVIDER") or "").strip().lower()
    if env_default_provider and env_default_provider in SUPPORTED_REALTIME_PROVIDERS:
        default_provider = env_default_provider
    else:
        default_provider = next(
            (provider for provider in provider_order if provider in SUPPORTED_REALTIME_PROVIDERS),
            SUPPORTED_REALTIME_PROVIDERS[0],
        )

    return JSONResponse(
        {
            "default_provider": default_provider,
            "supported_realtime_providers": list(SUPPORTED_REALTIME_PROVIDERS),
            "providers": {
                "openai": {"server_key": bool(OPENAI_API_KEY)},
                "azure": {"server_key": bool(AZURE_OPENAI_API_KEY)},
                "gemini": {"server_key": bool(GEMINI_API_KEY)},
            },
            "provider_catalog": provider_catalog,
            "chat_system_prompt": CHAT_SYSTEM_PROMPT,
        }
    )
