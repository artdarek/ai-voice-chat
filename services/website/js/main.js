import { createOutputPlayback } from './audio/outputPlayback.js';
import { createEventRouter } from './realtime/eventRouter.js';
import { createSessionConnector } from './realtime/sessionConnector.js';
import { createSessionFlow } from './realtime/sessionFlow.js';
import { downloadChatHistoryCsv } from './storage/csvExport.js';
import { createSessionHistoryService } from './storage/sessionHistoryService.js';
import { createChatView } from './ui/chatView.js';
import { bindAppEvents } from './ui/appEventBindings.js';
import { createConnectionPanel } from './ui/connectionPanel.js';
import { createModelSelector } from './ui/modelSelector.js';
import { createResponseDetailsModal } from './ui/responseDetailsModal.js';
import { createSettingsModal } from './ui/settingsModal.js';
import { createSystemPromptModal } from './ui/systemPromptModal.js';
import { createUsagePresenter } from './ui/usagePresenter.js';
import {
  estimateCostFromUsageBreakdown,
  formatUsd,
  getUsageBreakdown,
} from './usage/costCalculator.js';
import {
  STORAGE_KEYS,
  STATUS_STATE,
  STATUS_TEXT,
  UI_TEXT,
} from './constants.js';

let currentAiBubble = null;
let pendingUserBubble = null;
let isAssistantResponding = false;
let activeSessionProvider = null;
let activeSessionModel = null;
let activeInteractionId = null;

const btnConnect = document.getElementById('btn-connect');
const btnMute = document.getElementById('btn-mute');
const btnSend = document.getElementById('btn-send');
const btnSettings = document.getElementById('btn-settings');
const btnDownloadChat = document.getElementById('btn-download-chat');
const btnClearChat = document.getElementById('btn-clear-chat');
const btnSystemPrompt = document.getElementById('btn-system-prompt');
const textInput = document.getElementById('text-input');
const providerSelectModal = document.getElementById('provider-select');
const providerSelectInline = document.getElementById('provider-select-inline');
const modelSelectInline = document.getElementById('model-select-inline');
const voiceSelect = document.getElementById('voice-select');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const transcript = document.getElementById('transcript');
const emptyState = document.getElementById('empty-state');
const iconMic = document.getElementById('icon-mic');
const iconMicOff = document.getElementById('icon-mic-off');
const btnMuteLabel = document.getElementById('btn-mute-label');
const clearConfirmBackdrop = document.getElementById('clear-confirm-backdrop');
const clearConfirmClose = document.getElementById('clear-confirm-close');
const btnClearCancel = document.getElementById('btn-clear-cancel');
const btnClearConfirm = document.getElementById('btn-clear-confirm');
const systemPromptBackdrop = document.getElementById('system-prompt-backdrop');
const systemPromptClose = document.getElementById('system-prompt-close');
const btnSystemPromptCancel = document.getElementById('btn-system-prompt-cancel');
const btnSystemPromptReset = document.getElementById('btn-system-prompt-reset');
const btnSystemPromptSave = document.getElementById('btn-system-prompt-save');
const systemPromptInput = document.getElementById('system-prompt-input');
const contextReplayEnabledInput = document.getElementById('context-replay-enabled');
const contextReplayCountInput = document.getElementById('context-replay-count');
const usageSummaryText = document.getElementById('usage-summary-text');
const usageSummaryInteractions = document.getElementById('usage-summary-interactions');

const chatView = createChatView(transcript, emptyState);
const playback = createOutputPlayback();

const connectionPanel = createConnectionPanel(
  {
    btnConnect,
    btnMute,
    btnMuteLabel,
    iconMic,
    iconMicOff,
    providerSelectInline,
    modelSelectInline,
    voiceSelect,
    textInput,
    btnSend,
    statusDot,
    statusText,
  },
  {
    connectButtonLabel: UI_TEXT.connectButtonLabel,
    disconnectButtonLabel: UI_TEXT.disconnectButtonLabel,
    muteButtonLabel: UI_TEXT.muteButtonLabel,
    unmuteButtonLabel: UI_TEXT.unmuteButtonLabel,
    inputPlaceholderConnected: UI_TEXT.inputPlaceholderConnected,
    inputPlaceholderDisconnected: UI_TEXT.inputPlaceholderDisconnected,
  }
);

const sessionConnector = createSessionConnector({
  playback,
  onEvent: (event) => {
    eventRouter.handleEvent(event);
  },
  onOpen: ({ provider, target }) => {
    activeSessionProvider = provider;
    activeSessionModel = target.resolvedModel || 'unknown';
    modelSelector.saveRealtimeSelection(provider, provider === 'azure' ? target.deployment : target.model);
  },
  onClose: () => {
    isAssistantResponding = false;
    resetSessionStateAfterDisconnect();
  },
  onError: () => {
    isAssistantResponding = false;
    connectionPanel.setStatus(STATUS_TEXT.connectionError, STATUS_STATE.error);
  },
  onMicDenied: () => {
    connectionPanel.setStatus(STATUS_TEXT.micAccessDenied, STATUS_STATE.error);
    btnConnect.disabled = false;
  },
  onMuteChanged: (isMuted) => {
    connectionPanel.setMutedUi(
      isMuted,
      STATUS_TEXT.muted,
      STATUS_TEXT.connected,
      STATUS_STATE.muted,
      STATUS_STATE.connected
    );
  },
  onMuteReset: () => {
    connectionPanel.resetMuteUi();
  },
});
const modelSelector = createModelSelector(
  {
    providerSelectModal,
    providerSelectInline,
    modelSelectInline,
  },
  {
    getCurrentProvider: () => (
      localStorage.getItem(STORAGE_KEYS.llmProvider) ||
      providerSelectInline?.value ||
      providerSelectModal?.value ||
      'openai'
    ),
  }
);

function createInteractionId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Finalizes currently streaming assistant bubble, keeping partial output if interrupted.
 */
function finalizeCurrentAssistantBubble(interrupted = false) {
  const bubble = currentAiBubble;
  if (!bubble) {
    return;
  }

  let finalText = (bubble._content.textContent || '').trim();
  if (interrupted && finalText && !/[.!?…:]$/.test(finalText)) {
    finalText += '...';
    bubble._content.textContent = finalText;
  }

  if (finalText) {
    const assistantEntry = sessionHistoryService.appendAssistantMessage(
      finalText,
      interrupted,
      bubble._usage,
      bubble._rawResponse,
      bubble._interactionId
    );
    bubble._historyId = assistantEntry?.id;
    bubble._provider = assistantEntry?.provider || bubble._provider;
    bubble._model = assistantEntry?.model || bubble._model;
    activeInteractionId = null;
  }

  usagePresenter.attachUsageToBubble(
    bubble,
    bubble._usage,
    bubble._rawResponse,
    bubble._provider,
    bubble._model
  );

  bubble.classList.remove('streaming');
  currentAiBubble = null;
}

const usagePresenter = createUsagePresenter(
  {
    usageSummaryText,
    usageSummaryInteractions,
  },
  {
    getHistory: () => sessionHistoryService.getHistory(),
    getProviderCatalog: () => modelSelector.getProviderCatalog(),
    getUsageBreakdown,
    estimateCostFromUsageBreakdown,
    formatUsd,
  }
);

const sessionHistoryService = createSessionHistoryService({
  getSelectedProvider: () => settingsModal.getSelectedProvider(),
  getSelectedRealtimeTarget: (provider) => modelSelector.getSelectedRealtimeTarget(provider),
  getVoice: () => voiceSelect.value || 'unknown',
  getActiveSessionProvider: () => activeSessionProvider,
  getActiveSessionModel: () => activeSessionModel,
  onHistoryChanged: () => {
    usagePresenter.updateSummary();
  },
});

function resetSessionStateAfterDisconnect() {
  connectionPanel.setStatus(STATUS_TEXT.disconnected, '');
  connectionPanel.setDisconnected();
  finalizeCurrentAssistantBubble(true);
  isAssistantResponding = false;
  activeSessionProvider = null;
  activeSessionModel = null;
  pendingUserBubble = null;
  activeInteractionId = null;
}

function appendUserMessage(text, inputType = 'text', interactionId = undefined) {
  return sessionHistoryService.appendUserMessage(text, inputType, interactionId);
}

const settingsModal = createSettingsModal(
  {
    btnSettings,
    modalBackdrop: document.getElementById('modal-backdrop'),
    providerSelect: document.getElementById('provider-select'),
    externalProviderSelect: providerSelectInline,
    modalTitle: document.getElementById('modal-title'),
    modalDesc: document.getElementById('modal-desc'),
    apiKeyInput: document.getElementById('api-key-input'),
    keyIndicator: document.getElementById('key-indicator'),
    providerHint: document.getElementById('provider-hint'),
    btnKeyRemove: document.getElementById('btn-key-remove'),
    btnEye: document.getElementById('btn-eye'),
    eyeShow: document.getElementById('eye-show'),
    eyeHide: document.getElementById('eye-hide'),
    btnClose: document.getElementById('modal-close'),
    btnCancel: document.getElementById('btn-modal-cancel'),
    btnSave: document.getElementById('btn-key-save'),
  },
  {
    onKeyRemoved: () => {
      if (sessionConnector.isOpen()) {
        sessionFlow.disconnect();
      }
    },
    onProviderChanged: (provider) => {
      modelSelector.renderModelOptions(provider);
      sessionFlow.reconnectIfOpen();
    },
  }
);

settingsModal.bind();

const eventRouter = createEventRouter({
  setStatus: (text, state) => connectionPanel.setStatus(text, state),
  chatView,
  playback,
  setVoiceSelectDisabled: () => {},
  appendUserMessage,
  setPendingUserBubble: (bubble) => {
    pendingUserBubble = bubble;
  },
  getPendingUserBubble: () => pendingUserBubble,
  setCurrentAiBubble: (bubble) => {
    currentAiBubble = bubble;
  },
  getCurrentAiBubble: () => currentAiBubble,
  createInteractionId,
  setActiveInteractionId: (interactionId) => {
    activeInteractionId = interactionId;
  },
  getActiveInteractionId: () => activeInteractionId,
  setAssistantResponding: (active) => {
    isAssistantResponding = active;
  },
  getAssistantResponding: () => isAssistantResponding,
  getActiveProvider: () => activeSessionProvider || settingsModal.getSelectedProvider(),
  getActiveModel: () => (
    activeSessionModel ||
    modelSelector.getSelectedRealtimeTarget(settingsModal.getSelectedProvider()).resolvedModel
  ),
  finalizeCurrentAssistantBubble,
  requestResponseCancel: () => {
    sessionConnector.cancelResponse();
  },
});

/**
 * Loads server settings and configures API key modal behavior.
 */
async function initSettings() {
  let payload = null;
  try {
    const res = await fetch('/settings');
    payload = await res.json();
  } catch {
    payload = null;
  }

  btnSettings.style.display = 'flex';
  modelSelector.setProviderCatalog(payload?.provider_catalog);
  modelSelector.renderProviderOptions(payload?.supported_realtime_providers || []);
  settingsModal.setServerSettings(payload || undefined);
  modelSelector.renderModelOptions(settingsModal.getSelectedProvider());
  usagePresenter.updateSummary();
  systemPromptModal.setServerSystemPrompt(payload?.chat_system_prompt);

  const provider = settingsModal.getSelectedProvider();
  if (!settingsModal.isProviderSupported(provider) || !settingsModal.hasEffectiveKey(provider)) {
    settingsModal.openModal();
  }
}

/**
 * Restores persisted history into in-memory state and transcript view.
 */
function restoreChatHistory() {
  const history = sessionHistoryService.restore();
  chatView.renderHistory(history);
}

/**
 * Clears persisted and in-memory conversation history and transcript view.
 */
function clearConversationMemory() {
  sessionHistoryService.clear();
  chatView.clearTranscriptView();
  currentAiBubble = null;
  pendingUserBubble = null;
  activeInteractionId = null;
}

/**
 * Opens clear-history confirmation modal.
 */
function openClearConfirmModal() {
  clearConfirmBackdrop.style.display = 'flex';
}

/**
 * Closes clear-history confirmation modal.
 */
function closeClearConfirmModal() {
  clearConfirmBackdrop.style.display = 'none';
}

const responseDetailsModal = createResponseDetailsModal(
  {
    transcript,
    backdrop: document.getElementById('response-info-backdrop'),
    closeButton: document.getElementById('response-info-close'),
    tabGeneral: document.getElementById('response-tab-general'),
    usageIn: document.getElementById('response-info-usage-in'),
    usageOut: document.getElementById('response-info-usage-out'),
    usageTotal: document.getElementById('response-info-usage-total'),
    date: document.getElementById('response-info-date'),
    provider: document.getElementById('response-info-provider'),
    model: document.getElementById('response-info-model'),
    userMessage: document.getElementById('response-info-user'),
    assistantMessage: document.getElementById('response-info-assistant'),
    raw: document.getElementById('response-info-raw'),
    audioNcIn: document.getElementById('response-info-audio-nc-in'),
    audioNcOut: document.getElementById('response-info-audio-nc-out'),
    audioNcTotal: document.getElementById('response-info-audio-nc-total'),
    audioCachedIn: document.getElementById('response-info-audio-cached-in'),
    audioCachedOut: document.getElementById('response-info-audio-cached-out'),
    audioCachedTotal: document.getElementById('response-info-audio-cached-total'),
    textNcIn: document.getElementById('response-info-text-nc-in'),
    textNcOut: document.getElementById('response-info-text-nc-out'),
    textNcTotal: document.getElementById('response-info-text-nc-total'),
    textCachedIn: document.getElementById('response-info-text-cached-in'),
    textCachedOut: document.getElementById('response-info-text-cached-out'),
    textCachedTotal: document.getElementById('response-info-text-cached-total'),
    costTotalIn: document.getElementById('response-info-cost-total-in'),
    costTotalOut: document.getElementById('response-info-cost-total-out'),
    costTotalAll: document.getElementById('response-info-cost-total-all'),
    costAudioNcIn: document.getElementById('response-info-cost-audio-nc-in'),
    costAudioNcOut: document.getElementById('response-info-cost-audio-nc-out'),
    costAudioNcTotal: document.getElementById('response-info-cost-audio-nc-total'),
    costAudioCachedIn: document.getElementById('response-info-cost-audio-cached-in'),
    costAudioCachedOut: document.getElementById('response-info-cost-audio-cached-out'),
    costAudioCachedTotal: document.getElementById('response-info-cost-audio-cached-total'),
    costTextNcIn: document.getElementById('response-info-cost-text-nc-in'),
    costTextNcOut: document.getElementById('response-info-cost-text-nc-out'),
    costTextNcTotal: document.getElementById('response-info-cost-text-nc-total'),
    costTextCachedIn: document.getElementById('response-info-cost-text-cached-in'),
    costTextCachedOut: document.getElementById('response-info-cost-text-cached-out'),
    costTextCachedTotal: document.getElementById('response-info-cost-text-cached-total'),
  },
  {
    getHistory: () => sessionHistoryService.getHistory(),
    getUsageBreakdown,
    estimateCostFromUsageBreakdown: (usageBreakdown, provider, model) => (
      estimateCostFromUsageBreakdown(
        usageBreakdown,
        modelSelector.getProviderCatalog(),
        provider,
        model
      )
    ),
    formatUsd,
  }
);

responseDetailsModal.bind();

const systemPromptModal = createSystemPromptModal(
  {
    openButton: btnSystemPrompt,
    backdrop: systemPromptBackdrop,
    closeButton: systemPromptClose,
    cancelButton: btnSystemPromptCancel,
    resetButton: btnSystemPromptReset,
    saveButton: btnSystemPromptSave,
    input: systemPromptInput,
    contextReplayEnabledInput,
    contextReplayCountInput,
  },
  {
    getSessionOpen: () => sessionConnector.isOpen(),
    requestReconnect: () => sessionFlow.reconnectIfOpen(),
    sendInstructionsUpdate: (instructions) => {
      sessionConnector.sendJson({
        type: 'session.update',
        session: { instructions },
      });
    },
  }
);

systemPromptModal.bind();

const sessionFlow = createSessionFlow({
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
  getIsAssistantResponding: () => isAssistantResponding,
  setIsAssistantResponding: (value) => {
    isAssistantResponding = value;
  },
  setActiveInteractionId: (interactionId) => {
    activeInteractionId = interactionId;
  },
});

bindAppEvents(
  {
    btnConnect,
    btnClearChat,
    btnDownloadChat,
    btnClearConfirm,
    btnClearCancel,
    clearConfirmClose,
    clearConfirmBackdrop,
    voiceSelect,
    modelSelectInline,
    btnSend,
    textInput,
    btnMute,
    systemPromptBackdrop,
  },
  {
    onConnectToggle: () => sessionFlow.toggleConnection(),
    onOpenClearConfirm: () => {
      openClearConfirmModal();
    },
    onDownloadChat: () => {
      downloadChatHistoryCsv(sessionHistoryService.getHistory(), modelSelector.getProviderCatalog());
    },
    onClearConfirm: () => {
      if (sessionConnector.isOpen()) {
        sessionFlow.disconnect();
      }
      clearConversationMemory();
      resetSessionStateAfterDisconnect();
      closeClearConfirmModal();
    },
    onCloseClearConfirm: () => {
      closeClearConfirmModal();
    },
    onReconnectRequested: () => sessionFlow.reconnectIfOpen(),
    onModelChanged: (selectedModel) => {
      const provider = settingsModal.getSelectedProvider();
      modelSelector.saveRealtimeSelection(provider, selectedModel);
      sessionFlow.reconnectIfOpen();
    },
    onSendText: () => sessionFlow.sendTextMessage(),
    onToggleMute: () => {
      sessionConnector.toggleMute();
    },
    onCloseResponseDetails: () => {
      responseDetailsModal.close();
    },
    onCloseSystemPrompt: () => {
      systemPromptModal.close();
    },
    isResponseDetailsOpen: () => responseDetailsModal.isOpen(),
  }
);

restoreChatHistory();
initSettings();
