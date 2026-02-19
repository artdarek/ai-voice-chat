import os
from dotenv import load_dotenv

load_dotenv()

SUPPORTED_REALTIME_PROVIDERS = ("openai", "azure")

DEFAULT_LLM_PROVIDER = os.getenv("DEFAULT_LLM_PROVIDER", "openai").lower()
if DEFAULT_LLM_PROVIDER not in SUPPORTED_REALTIME_PROVIDERS:
    DEFAULT_LLM_PROVIDER = "openai"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-mini-2025-12-15")
OPENAI_REALTIME_BASE_URL = os.getenv(
    "OPENAI_REALTIME_BASE_URL", "wss://api.openai.com/v1/realtime"
)
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1")

AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_REALTIME_ENDPOINT = os.getenv("AZURE_OPENAI_REALTIME_ENDPOINT")
AZURE_OPENAI_REALTIME_DEPLOYMENT = os.getenv("AZURE_OPENAI_REALTIME_DEPLOYMENT")
AZURE_OPENAI_REALTIME_API_VERSION = os.getenv(
    "AZURE_OPENAI_REALTIME_API_VERSION", "2025-04-01-preview"
)
AZURE_OPENAI_TRANSCRIPTION_MODEL = os.getenv(
    "AZURE_OPENAI_TRANSCRIPTION_MODEL", "whisper-1"
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

CHAT_SYSTEM_PROMPT = os.getenv(
    "CHAT_SYSTEM_PROMPT",
    "You are a friendly and polite assistant. Be warm, helpful, and concise in your responses.",
)
