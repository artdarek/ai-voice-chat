import os
from dotenv import load_dotenv

load_dotenv()

SERVER_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("OPENAI_MODEL", "gpt-realtime-mini-2025-12-15")
TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
SYSTEM_PROMPT = os.getenv(
    "OPENAI_SYSTEM_PROMPT",
    "You are a friendly and polite assistant. Be warm, helpful, and concise in your responses.",
)

OPENAI_WS_URL = f"wss://api.openai.com/v1/realtime?model={MODEL}"

SESSION_CONFIG = {
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
    },
}