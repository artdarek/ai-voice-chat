from fastapi import APIRouter
from fastapi.responses import JSONResponse

from config import (
    AZURE_OPENAI_API_KEY,
    DEFAULT_LLM_PROVIDER,
    GEMINI_API_KEY,
    OPENAI_API_KEY,
    SUPPORTED_REALTIME_PROVIDERS,
)

router = APIRouter()


@router.get("/settings")
async def settings() -> JSONResponse:
    return JSONResponse(
        {
            "default_provider": DEFAULT_LLM_PROVIDER,
            "supported_realtime_providers": list(SUPPORTED_REALTIME_PROVIDERS),
            "providers": {
                "openai": {"server_key": bool(OPENAI_API_KEY)},
                "azure": {"server_key": bool(AZURE_OPENAI_API_KEY)},
                "gemini": {"server_key": bool(GEMINI_API_KEY)},
            },
        }
    )
