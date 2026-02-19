export const STORAGE_KEYS = {
  llmProvider: 'llm_provider',
  openaiApiKey: 'openai_api_key',
  azureApiKey: 'azure_api_key',
  geminiApiKey: 'gemini_api_key',
  chatHistory: 'chat_history_v1',
};

export const PROVIDERS = {
  openai: { label: 'OpenAI', keyStorageKey: STORAGE_KEYS.openaiApiKey, keyPlaceholder: 'sk-...' },
  azure: { label: 'Azure OpenAI', keyStorageKey: STORAGE_KEYS.azureApiKey, keyPlaceholder: 'azure-api-key...' },
  gemini: { label: 'Gemini', keyStorageKey: STORAGE_KEYS.geminiApiKey, keyPlaceholder: 'AIza...' },
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
  providerServerHasKey:
    "This provider has a server-side key configured. You can optionally override it with your own key, stored in this browser.",
  providerServerMissingKey:
    'No server-side key is configured for this provider. Add your own key to connect.',
  geminiNotAvailable:
    'Gemini key can be saved now, but Gemini Live runtime is not enabled in this version yet.',
};

export const MEMORY_CONTEXT_HEADER =
  'Context from previous chat session. Use it as memory for this conversation.';
