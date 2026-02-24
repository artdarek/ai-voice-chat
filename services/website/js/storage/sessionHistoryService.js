import { appendHistory, clearHistory, loadHistory } from './historyStore.js';

/**
 * Keeps chat history state and provides append/restore helpers.
 */
export function createSessionHistoryService(options) {
  const {
    getSelectedProvider,
    getSelectedRealtimeTarget,
    getVoice,
    getActiveSessionProvider,
    getActiveSessionModel,
    onHistoryChanged,
  } = options;

  let history = [];

  function notify() {
    if (typeof onHistoryChanged === 'function') {
      onHistoryChanged(history);
    }
  }

  function getHistory() {
    return history;
  }

  function setHistory(nextHistory) {
    history = Array.isArray(nextHistory) ? nextHistory : [];
    notify();
    return history;
  }

  function restore() {
    return setHistory(loadHistory());
  }

  function clear() {
    return setHistory(clearHistory());
  }

  function appendUserMessage(text, inputType = 'text', interactionId = undefined) {
    const selectedProvider = getActiveSessionProvider() || getSelectedProvider();
    const selectedTarget = getSelectedRealtimeTarget(selectedProvider);
    const nextHistory = appendHistory(
      history,
      'user',
      text,
      selectedProvider,
      getActiveSessionModel() || selectedTarget.resolvedModel,
      getVoice() || 'unknown',
      false,
      inputType,
      undefined,
      undefined,
      interactionId
    );

    setHistory(nextHistory);
    return nextHistory[nextHistory.length - 1];
  }

  function appendAssistantMessage(
    text,
    interrupted = false,
    usage = undefined,
    rawResponse = undefined,
    interactionId = undefined
  ) {
    const selectedProvider = getActiveSessionProvider() || getSelectedProvider();
    const selectedTarget = getSelectedRealtimeTarget(selectedProvider);
    const nextHistory = appendHistory(
      history,
      'assistant',
      text,
      selectedProvider,
      getActiveSessionModel() || selectedTarget.resolvedModel,
      getVoice() || 'unknown',
      interrupted,
      'n/a',
      usage,
      rawResponse,
      interactionId
    );

    setHistory(nextHistory);
    return nextHistory[nextHistory.length - 1];
  }

  return {
    getHistory,
    setHistory,
    restore,
    clear,
    appendUserMessage,
    appendAssistantMessage,
  };
}
