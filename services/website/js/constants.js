export const STORAGE_KEYS = {
  apiKey: 'openai_api_key',
  chatHistory: 'chat_history_v1',
};

export const HISTORY_LIMITS = {
  persistedMessages: 200,
  replayMessages: 20,
  maxMemoryChars: 8000,
};

export const STATUS_TEXT = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected - speak now',
  listening: 'Listening...',
  micAccessDenied: 'Mic access denied',
  connectionError: 'Connection error',
  muted: 'Muted',
};

export const STATUS_STATE = {
  connected: 'connected',
  connecting: 'connecting',
  listening: 'listening',
  error: 'error',
  muted: 'muted',
};

export const UI_TEXT = {
  connectButtonLabel: 'Connect',
  disconnectButtonLabel: 'Disconnect',
  muteButtonLabel: ' Mute',
  unmuteButtonLabel: ' Unmute',
  inputPlaceholderConnected: 'Type a message... (Enter to send, Shift+Enter for newline)',
  inputPlaceholderDisconnected: 'Connect first, then type a message... (Enter to send, Shift+Enter for newline)',
  pendingTranscription: '...',
};

export const SETTINGS_MODAL_TEXT = {
  serverHasKey:
    "The server has a configured API key. You can optionally override it with your own OpenAI key - it will be saved in your browser's local storage. Remove it to fall back to the server key.",
  serverMissingKey:
    "This server has no configured API key. Enter your own OpenAI API key - it will be saved in your browser's local storage and sent to the server only when connecting.",
};

export const MEMORY_CONTEXT_HEADER =
  'Context from previous chat session. Use it as memory for this conversation.';
