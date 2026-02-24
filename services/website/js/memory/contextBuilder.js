import { HISTORY_LIMITS, MEMORY_CONTEXT_HEADER } from '../constants.js';

/**
 * Builds a compact reconnect context message from recent conversation history.
 */
export function buildModelMemoryMessage(history, options = {}) {
  const enabled = options.enabled !== false;
  if (!enabled) {
    return '';
  }

  const rawCount = Number(options.count);
  const normalizedCount = Number.isInteger(rawCount) && rawCount > 0
    ? rawCount
    : HISTORY_LIMITS.replayMessages;
  const recent = history.slice(-normalizedCount);
  if (!recent.length) {
    return '';
  }

  const lines = recent.map((item) => {
    const speaker = item.role === 'user' ? 'User' : 'Assistant';
    const normalized = item.text.replace(/\s+/g, ' ').trim();
    return `${speaker}: ${normalized}`;
  });

  let memory = [
    MEMORY_CONTEXT_HEADER,
    ...lines,
  ].join('\n');

  if (memory.length > HISTORY_LIMITS.maxMemoryChars) {
    memory = '...' + memory.slice(-(HISTORY_LIMITS.maxMemoryChars - 3));
  }

  return memory;
}
