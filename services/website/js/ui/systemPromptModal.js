import { HISTORY_LIMITS, STORAGE_KEYS } from '../constants.js';

const DEFAULT_CONTEXT_REPLAY_COUNT = 10;

/**
 * Creates controller for system prompt and context replay settings modal.
 */
export function createSystemPromptModal(elements, deps) {
  const {
    openButton,
    backdrop,
    closeButton,
    cancelButton,
    resetButton,
    saveButton,
    input,
    contextReplayEnabledInput,
    contextReplayCountInput,
  } = elements;
  const {
    getSessionOpen,
    requestReconnect,
    sendInstructionsUpdate,
  } = deps;

  let serverSystemPrompt = 'You are a friendly and polite assistant. Be warm, helpful, and concise in your responses.';

  function getSavedSystemPrompt() {
    return localStorage.getItem(STORAGE_KEYS.systemPrompt) || '';
  }

  function parseContextReplayCount(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return DEFAULT_CONTEXT_REPLAY_COUNT;
    }
    return Math.min(parsed, HISTORY_LIMITS.persistedMessages);
  }

  function getContextReplaySettings() {
    const rawEnabled = localStorage.getItem(STORAGE_KEYS.contextReplayEnabled);
    const enabled = rawEnabled === null ? true : rawEnabled !== 'false';
    const rawCount = localStorage.getItem(STORAGE_KEYS.contextReplayCount);
    const count = parseContextReplayCount(rawCount ?? DEFAULT_CONTEXT_REPLAY_COUNT);
    return { enabled, count };
  }

  function setContextReplayControlsEnabled(enabled) {
    if (contextReplayCountInput) {
      contextReplayCountInput.disabled = !enabled;
    }
  }

  function getEffectiveSystemPrompt() {
    return getSavedSystemPrompt() || serverSystemPrompt;
  }

  function openModal() {
    const replay = getContextReplaySettings();
    input.value = getEffectiveSystemPrompt();
    if (contextReplayEnabledInput) {
      contextReplayEnabledInput.checked = replay.enabled;
    }
    if (contextReplayCountInput) {
      contextReplayCountInput.value = String(replay.count);
    }
    setContextReplayControlsEnabled(replay.enabled);
    backdrop.style.display = 'flex';
    setTimeout(() => input.focus(), 50);
  }

  function closeModal() {
    backdrop.style.display = 'none';
  }

  function save() {
    const previousReplay = getContextReplaySettings();
    const previousEffectivePrompt = getEffectiveSystemPrompt();
    const value = input.value.trim();
    if (value && value !== serverSystemPrompt) {
      localStorage.setItem(STORAGE_KEYS.systemPrompt, value);
    } else {
      localStorage.removeItem(STORAGE_KEYS.systemPrompt);
    }

    const replayEnabled = Boolean(contextReplayEnabledInput?.checked);
    const replayCount = parseContextReplayCount(contextReplayCountInput?.value);
    localStorage.setItem(STORAGE_KEYS.contextReplayEnabled, replayEnabled ? 'true' : 'false');
    localStorage.setItem(STORAGE_KEYS.contextReplayCount, String(replayCount));

    closeModal();

    if (getSessionOpen()) {
      const replay = getContextReplaySettings();
      const promptChanged = previousEffectivePrompt !== getEffectiveSystemPrompt();
      const replayChanged =
        previousReplay.enabled !== replay.enabled ||
        previousReplay.count !== replay.count;

      if (replayChanged || promptChanged) {
        requestReconnect();
        return;
      }

      sendInstructionsUpdate(getEffectiveSystemPrompt());
    }
  }

  function resetDraft() {
    input.value = serverSystemPrompt;
    if (contextReplayEnabledInput) {
      contextReplayEnabledInput.checked = true;
    }
    if (contextReplayCountInput) {
      contextReplayCountInput.value = String(DEFAULT_CONTEXT_REPLAY_COUNT);
    }
    setContextReplayControlsEnabled(true);
    input.focus();
  }

  function setServerSystemPrompt(value) {
    if (typeof value === 'string' && value.trim()) {
      serverSystemPrompt = value;
    }
  }

  function bind() {
    openButton.addEventListener('click', openModal);
    closeButton.addEventListener('click', closeModal);
    cancelButton.addEventListener('click', closeModal);
    resetButton.addEventListener('click', resetDraft);
    saveButton.addEventListener('click', save);

    input.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        save();
      }
    });

    contextReplayEnabledInput?.addEventListener('change', () => {
      setContextReplayControlsEnabled(Boolean(contextReplayEnabledInput.checked));
    });

    contextReplayCountInput?.addEventListener('blur', () => {
      contextReplayCountInput.value = String(parseContextReplayCount(contextReplayCountInput.value));
    });

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        closeModal();
      }
    });
  }

  return {
    bind,
    close: closeModal,
    getContextReplaySettings,
    getEffectiveSystemPrompt,
    setServerSystemPrompt,
  };
}
