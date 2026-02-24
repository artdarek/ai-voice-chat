import { HISTORY_LIMITS, STORAGE_KEYS } from '../constants.js';

/**
 * Validates optional per-turn token usage metadata.
 */
function isUsageValid(usage) {
  if (typeof usage === 'undefined') {
    return true;
  }
  if (!usage || typeof usage !== 'object') {
    return false;
  }

  const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
  return (
    (typeof usage.inputTokens === 'undefined' || isNonNegativeInteger(usage.inputTokens)) &&
    (typeof usage.outputTokens === 'undefined' || isNonNegativeInteger(usage.outputTokens)) &&
    (typeof usage.totalTokens === 'undefined' || isNonNegativeInteger(usage.totalTokens))
  );
}

/**
 * Validates optional raw provider response payload saved per assistant turn.
 */
function isRawResponseValid(rawResponse) {
  if (typeof rawResponse === 'undefined') {
    return true;
  }
  return rawResponse !== null && typeof rawResponse === 'object';
}

/**
 * Validates optional interaction (run) identifier shared by user/assistant pair.
 */
function isInteractionIdValid(interactionId) {
  return typeof interactionId === 'undefined' || typeof interactionId === 'string';
}

/**
 * Checks whether a parsed storage item matches expected chat message shape.
 */
function isHistoryItemValid(item) {
  return (
    item &&
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.text === 'string' &&
    typeof item.createdAt === 'string' &&
    (typeof item.provider === 'string' || typeof item.provider === 'undefined') &&
    (typeof item.interrupted === 'boolean' || typeof item.interrupted === 'undefined') &&
    (typeof item.inputType === 'string' || typeof item.inputType === 'undefined') &&
    isUsageValid(item.usage) &&
    isRawResponseValid(item.rawResponse) &&
    isInteractionIdValid(item.interactionId)
  );
}

/**
 * Filters and normalizes raw persisted history to a safe runtime format.
 */
function normalizeHistory(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isHistoryItemValid)
    .map((item, index) => ({
      id: item.id || `msg-${index}-${item.createdAt}`,
      role: item.role,
      text: item.text,
      createdAt: item.createdAt,
      provider: item.provider || 'unknown',
      interrupted: Boolean(item.interrupted),
      inputType: item.inputType || 'n/a',
      usage: item.usage
        ? {
            ...(typeof item.usage.inputTokens === 'number' ? { inputTokens: item.usage.inputTokens } : {}),
            ...(typeof item.usage.outputTokens === 'number' ? { outputTokens: item.usage.outputTokens } : {}),
            ...(typeof item.usage.totalTokens === 'number' ? { totalTokens: item.usage.totalTokens } : {}),
          }
        : undefined,
      rawResponse: isRawResponseValid(item.rawResponse) ? item.rawResponse : undefined,
      interactionId: isInteractionIdValid(item.interactionId) ? item.interactionId : undefined,
    }));
}

/**
 * Loads chat history from localStorage and returns a validated array.
 */
export function loadHistory() {
  let parsed;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.chatHistory) || '[]');
  } catch {
    return [];
  }

  return normalizeHistory(parsed);
}

/**
 * Persists chat history with an upper bound and returns the bounded array.
 */
export function saveHistory(history) {
  const bounded = history.slice(-HISTORY_LIMITS.persistedMessages);
  try {
    localStorage.setItem(STORAGE_KEYS.chatHistory, JSON.stringify(bounded));
  } catch {
    // Ignore write failures (for example localStorage quota exceeded).
  }
  return bounded;
}

/**
 * Appends a single message to history and persists it.
 */
export function appendHistory(
  history,
  role,
  text,
  provider = 'unknown',
  interrupted = false,
  inputType = 'n/a',
  usage = undefined,
  rawResponse = undefined,
  interactionId = undefined
) {
  const normalizedText = (text || '').trim();
  if (!normalizedText) {
    return history;
  }

  const entry = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text: normalizedText,
    createdAt: new Date().toISOString(),
    provider: (provider || 'unknown').toLowerCase(),
    interrupted: Boolean(interrupted),
    inputType: (inputType || 'n/a').toLowerCase(),
    usage: isUsageValid(usage) ? usage : undefined,
    rawResponse: isRawResponseValid(rawResponse) ? rawResponse : undefined,
    interactionId: isInteractionIdValid(interactionId) ? interactionId : undefined,
  };

  return saveHistory([...history, entry]);
}

/**
 * Clears persisted chat history and returns an empty history array.
 */
export function clearHistory() {
  localStorage.removeItem(STORAGE_KEYS.chatHistory);
  return [];
}
