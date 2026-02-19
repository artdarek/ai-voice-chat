def _append_query(url: str, query: str) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{query}"


def build_openai_ws_url(base_url: str, model: str) -> str:
    return _append_query(base_url, f"model={model}")


def build_azure_ws_url(base_url: str, deployment: str, api_version: str) -> str:
    with_api_version = _append_query(base_url, f"api-version={api_version}")
    return _append_query(with_api_version, f"deployment={deployment}")
