from config import SYSTEM_PROMPT, TRANSCRIPTION_MODEL
from tools.definitions import TOOL_DEFINITIONS


def build_session_config() -> dict:
    return {
        "type": "session.update",
        "session": {
            "modalities": ["audio", "text"],
            "instructions": SYSTEM_PROMPT,
            "input_audio_transcription": {"model": TRANSCRIPTION_MODEL},
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
