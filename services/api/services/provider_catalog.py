import json
from pathlib import Path
from typing import Any


_HERE = Path(__file__).resolve().parent
_CONFIG_CANDIDATES = [
    _HERE.parent.parent.parent / "config" / "providers.json",  # local: <repo>/config/providers.json
    _HERE.parent / "config" / "providers.json",  # docker + local fallback: <api>/config/providers.json
]
PROVIDERS_CONFIG_PATH = next((path for path in _CONFIG_CANDIDATES if path.exists()), _CONFIG_CANDIDATES[0])


def load_provider_catalog() -> dict[str, Any]:
    with PROVIDERS_CONFIG_PATH.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    providers = payload.get("providers")
    if not isinstance(providers, dict):
        raise ValueError("Invalid providers.json: 'providers' must be an object")

    return payload


def get_provider_catalog_by_id() -> dict[str, Any]:
    return load_provider_catalog().get("providers", {})
