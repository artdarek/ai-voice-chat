import { buildModelMemoryMessage } from '../memory/contextBuilder.js';
import { STATUS_STATE, STATUS_TEXT } from '../constants.js';

/**
 * Orchestrates connect/disconnect/reconnect and text message send flow.
 */
export function createSessionFlow(deps) {
  const {
    btnConnect,
    textInput,
    voiceSelect,
    settingsModal,
    modelSelector,
    sessionConnector,
    sessionHistoryService,
    systemPromptModal,
    connectionPanel,
    chatView,
    createInteractionId,
    finalizeCurrentAssistantBubble,
    getIsAssistantResponding,
    setIsAssistantResponding,
    setActiveInteractionId,
  } = deps;

  function disconnect() {
    sessionConnector.disconnect();
  }

  function reconnectIfOpen() {
    if (!sessionConnector.isOpen()) {
      return;
    }
    disconnect();
    connect();
  }

  async function connect() {
    const provider = settingsModal.getSelectedProvider();
    const target = modelSelector.getSelectedRealtimeTarget(provider);
    if (!settingsModal.isProviderSupported(provider)) {
      connectionPanel.setStatus(`${provider} is not available in this version`, STATUS_STATE.error);
      settingsModal.openModal();
      return;
    }

    if (!settingsModal.hasEffectiveKey(provider)) {
      settingsModal.openModal();
      return;
    }

    const userKey = settingsModal.getSavedKey(provider);
    const replay = systemPromptModal.getContextReplaySettings();
    const memoryContext = buildModelMemoryMessage(sessionHistoryService.getHistory(), replay);
    btnConnect.disabled = true;

    const connected = await sessionConnector.connect({
      provider,
      target,
      userKey,
      voice: voiceSelect.value,
      instructions: systemPromptModal.getEffectiveSystemPrompt(),
      memoryContext,
    });
    if (!connected) {
      return;
    }

    connectionPanel.setConnected();
  }

  function toggleConnection() {
    if (sessionConnector.isOpen()) {
      disconnect();
    } else {
      connectionPanel.setStatus(STATUS_TEXT.connecting, STATUS_STATE.connecting);
      connect();
    }
  }

  function sendTextMessage() {
    const text = textInput.value.trim();
    if (!text || !sessionConnector.isOpen()) {
      return;
    }

    sessionConnector.cancelResponse();
    if (getIsAssistantResponding()) {
      finalizeCurrentAssistantBubble(true);
      setIsAssistantResponding(false);
    }

    const interactionId = createInteractionId();
    setActiveInteractionId(interactionId);
    const userBubble = chatView.addBubble('user', text);
    userBubble._interactionId = interactionId;
    sessionHistoryService.appendUserMessage(text, 'text', interactionId);

    textInput.value = '';
    textInput.style.height = 'auto';

    // Give provider a short moment to apply cancellation before creating the next turn.
    setTimeout(() => {
      if (!sessionConnector.isOpen()) {
        return;
      }
      sessionConnector.sendJson({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      });
      sessionConnector.sendJson({ type: 'response.create' });
    }, 50);
  }

  return {
    connect,
    disconnect,
    reconnectIfOpen,
    sendTextMessage,
    toggleConnection,
  };
}
