def build_openai_ws_url(base_url: str, model: str) -> str:
    return f"{base_url}?model={model}"
