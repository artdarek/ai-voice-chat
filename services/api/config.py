import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-mini-2025-12-15")
TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")
SYSTEM_PROMPT = os.getenv(
    "OPENAI_SYSTEM_PROMPT",
    "You are a friendly and polite assistant. Be warm, helpful, and concise in your responses.",
)

REALTIME_BASE_URL = os.getenv(
    "OPENAI_REALTIME_BASE_URL", "wss://api.openai.com/v1/realtime"
)
