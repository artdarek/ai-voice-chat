from config import (
    AZURE_OPENAI_TRANSCRIPTION_MODEL,
    CHAT_SYSTEM_PROMPT,
    OPENAI_TRANSCRIPTION_MODEL,
)
from tools.definitions import TOOL_DEFINITIONS


def _resolve_transcription_model(provider: str) -> str:
    if provider == "azure":
        return AZURE_OPENAI_TRANSCRIPTION_MODEL
    return OPENAI_TRANSCRIPTION_MODEL


def build_session_config(provider: str) -> dict:
    return {
        "type": "session.update",
        "session": {
            "modalities": ["audio", "text"],
            "instructions": CHAT_SYSTEM_PROMPT,
            "input_audio_transcription": {"model": _resolve_transcription_model(provider)},
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 600,
            },
            "tools": TOOL_DEFINITIONS,
            "tool_choice": "auto",
        },
    }
