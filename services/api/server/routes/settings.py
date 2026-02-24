from fastapi import APIRouter
from fastapi.responses import JSONResponse

from config import (
    AZURE_OPENAI_API_KEY,
    CHAT_SYSTEM_PROMPT,
    DEFAULT_LLM_PROVIDER,
    GEMINI_API_KEY,
    OPENAI_API_KEY,
    SUPPORTED_REALTIME_PROVIDERS,
)
from services.provider_catalog import load_provider_catalog

router = APIRouter()


@router.get("/settings")
async def settings() -> JSONResponse:
    provider_catalog = load_provider_catalog()

    return JSONResponse(
        {
            "default_provider": DEFAULT_LLM_PROVIDER,
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
