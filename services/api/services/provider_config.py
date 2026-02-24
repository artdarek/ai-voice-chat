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
from services.provider_catalog import get_provider_catalog_by_id


class ProviderConfigError(ValueError):
    pass


@dataclass(frozen=True)
class ProviderConnectionConfig:
    provider: str
    ws_url: str
    headers: dict[str, str]
    requested_model: str | None
    requested_deployment: str | None
    resolved_model: str


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


def _resolve_openai_model(requested_model: str | None) -> str:
    provider_catalog = get_provider_catalog_by_id().get("openai", {})
    models = provider_catalog.get("models", [])
    allowed_ids = [
        str(item.get("id", "")).strip()
        for item in models
        if str(item.get("id", "")).strip() and item.get("enabled", True) is not False
    ]

    normalized_requested_model = (requested_model or "").strip()
    if normalized_requested_model:
        if allowed_ids and normalized_requested_model not in allowed_ids:
            raise ProviderConfigError(
                f"Unsupported or disabled model for provider 'openai': {normalized_requested_model}"
            )
        return normalized_requested_model

    default_model = (OPENAI_REALTIME_MODEL or "").strip()
    if default_model:
        if allowed_ids and default_model not in allowed_ids:
            raise ProviderConfigError(
                f"OPENAI_REALTIME_MODEL is not enabled in config/providers.json: {default_model}"
            )
        return default_model

    if allowed_ids:
        return allowed_ids[0]

    raise ProviderConfigError("No enabled OpenAI realtime model configured")


def _resolve_openai_config(user_api_key: str | None, requested_model: str | None) -> ProviderConnectionConfig:
    api_key = _require_api_key("openai", user_api_key, OPENAI_API_KEY)
    resolved_model = _resolve_openai_model(requested_model)
    return ProviderConnectionConfig(
        provider="openai",
        ws_url=build_openai_ws_url(OPENAI_REALTIME_BASE_URL, resolved_model),
        headers={
            "Authorization": f"Bearer {api_key}",
            "OpenAI-Beta": "realtime=v1",
        },
        requested_model=(requested_model or "").strip() or None,
        requested_deployment=None,
        resolved_model=resolved_model,
    )


def _resolve_azure_deployment(requested_deployment: str | None) -> tuple[str, str]:
    provider_catalog = get_provider_catalog_by_id().get("azure", {})
    deployments = provider_catalog.get("deployments", [])
    allowed_deployments = [
        {
            "name": str(item.get("name", "")).strip(),
            "model": str(item.get("model", "")).strip(),
        }
        for item in deployments
        if str(item.get("name", "")).strip() and item.get("enabled", True) is not False
    ]

    normalized_requested_deployment = (requested_deployment or "").strip()
    if normalized_requested_deployment:
        matched = next(
            (item for item in allowed_deployments if item["name"] == normalized_requested_deployment),
            None,
        )
        if not matched and allowed_deployments:
            raise ProviderConfigError(
                f"Unsupported or disabled deployment for provider 'azure': {normalized_requested_deployment}"
            )
        return normalized_requested_deployment, matched["model"] if matched else normalized_requested_deployment

    env_deployment = (AZURE_OPENAI_REALTIME_DEPLOYMENT or "").strip()
    if env_deployment:
        if allowed_deployments:
            matched = next((item for item in allowed_deployments if item["name"] == env_deployment), None)
            if not matched:
                raise ProviderConfigError(
                    "AZURE_OPENAI_REALTIME_DEPLOYMENT is not enabled in config/providers.json: "
                    f"{env_deployment}"
                )
            return env_deployment, matched["model"] or env_deployment
        return env_deployment, env_deployment

    if allowed_deployments:
        first = allowed_deployments[0]
        return first["name"], first["model"] or first["name"]

    raise ProviderConfigError("No enabled Azure deployment configured")


def _resolve_azure_config(user_api_key: str | None, requested_deployment: str | None) -> ProviderConnectionConfig:
    api_key = _require_api_key("azure", user_api_key, AZURE_OPENAI_API_KEY)
    if not AZURE_OPENAI_REALTIME_ENDPOINT:
        raise ProviderConfigError("Azure endpoint is missing (AZURE_OPENAI_REALTIME_ENDPOINT)")

    resolved_deployment, resolved_model = _resolve_azure_deployment(requested_deployment)

    return ProviderConnectionConfig(
        provider="azure",
        ws_url=build_azure_ws_url(
            AZURE_OPENAI_REALTIME_ENDPOINT,
            resolved_deployment,
            AZURE_OPENAI_REALTIME_API_VERSION,
        ),
        headers={
            "api-key": api_key,
            "OpenAI-Beta": "realtime=v1",
        },
        requested_model=None,
        requested_deployment=(requested_deployment or "").strip() or None,
        resolved_model=resolved_model,
    )


def resolve_provider_connection(
    provider: str | None,
    user_api_key: str | None,
    requested_model: str | None,
    requested_deployment: str | None,
) -> ProviderConnectionConfig:
    normalized_provider = normalize_provider(provider)
    if normalized_provider == "openai":
        return _resolve_openai_config(user_api_key, requested_model)
    if normalized_provider == "azure":
        return _resolve_azure_config(user_api_key, requested_deployment)
    raise ProviderConfigError(f"Unsupported provider: {normalized_provider}")
