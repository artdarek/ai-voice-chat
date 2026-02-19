from dataclasses import dataclass

from config import (
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_REALTIME_API_VERSION,
    AZURE_OPENAI_REALTIME_DEPLOYMENT,
    AZURE_OPENAI_REALTIME_ENDPOINT,
    DEFAULT_LLM_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_REALTIME_BASE_URL,
    OPENAI_REALTIME_MODEL,
    SUPPORTED_REALTIME_PROVIDERS,
)
from services.openai_ws import build_azure_ws_url, build_openai_ws_url


class ProviderConfigError(ValueError):
    pass


@dataclass(frozen=True)
class ProviderConnectionConfig:
    provider: str
    ws_url: str
    headers: dict[str, str]


def normalize_provider(raw_provider: str | None) -> str:
    provider = (raw_provider or DEFAULT_LLM_PROVIDER).strip().lower()
    if provider not in SUPPORTED_REALTIME_PROVIDERS:
        raise ProviderConfigError(f"Unsupported provider: {provider}")
    return provider


def _require_api_key(provider: str, user_api_key: str | None, server_api_key: str | None) -> str:
    api_key = (user_api_key or "").strip() or (server_api_key or "").strip()
    if not api_key:
        raise ProviderConfigError(f"API key required for provider '{provider}'")
    return api_key


def _resolve_openai_config(user_api_key: str | None) -> ProviderConnectionConfig:
    api_key = _require_api_key("openai", user_api_key, OPENAI_API_KEY)
    return ProviderConnectionConfig(
        provider="openai",
        ws_url=build_openai_ws_url(OPENAI_REALTIME_BASE_URL, OPENAI_REALTIME_MODEL),
        headers={
            "Authorization": f"Bearer {api_key}",
            "OpenAI-Beta": "realtime=v1",
        },
    )


def _resolve_azure_config(user_api_key: str | None) -> ProviderConnectionConfig:
    api_key = _require_api_key("azure", user_api_key, AZURE_OPENAI_API_KEY)
    if not AZURE_OPENAI_REALTIME_ENDPOINT:
        raise ProviderConfigError("Azure endpoint is missing (AZURE_OPENAI_REALTIME_ENDPOINT)")
    if not AZURE_OPENAI_REALTIME_DEPLOYMENT:
        raise ProviderConfigError("Azure deployment is missing (AZURE_OPENAI_REALTIME_DEPLOYMENT)")

    return ProviderConnectionConfig(
        provider="azure",
        ws_url=build_azure_ws_url(
            AZURE_OPENAI_REALTIME_ENDPOINT,
            AZURE_OPENAI_REALTIME_DEPLOYMENT,
            AZURE_OPENAI_REALTIME_API_VERSION,
        ),
        headers={
            "api-key": api_key,
            "OpenAI-Beta": "realtime=v1",
        },
    )


def resolve_provider_connection(provider: str | None, user_api_key: str | None) -> ProviderConnectionConfig:
    normalized_provider = normalize_provider(provider)
    if normalized_provider == "openai":
        return _resolve_openai_config(user_api_key)
    if normalized_provider == "azure":
        return _resolve_azure_config(user_api_key)
    raise ProviderConfigError(f"Unsupported provider: {normalized_provider}")
