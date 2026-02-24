import { createOutputPlayback } from './audio/outputPlayback.js';
import { buildModelMemoryMessage } from './memory/contextBuilder.js';
import { createEventRouter } from './realtime/eventRouter.js';
import { downloadChatHistoryCsv } from './storage/csvExport.js';
import { appendHistory, clearHistory, loadHistory } from './storage/historyStore.js';
import { createChatView } from './ui/chatView.js';
import { createSettingsModal } from './ui/settingsModal.js';
import {
  STORAGE_KEYS,
  STATUS_STATE,
  STATUS_TEXT,
  UI_TEXT,
} from './constants.js';

let ws = null;
let audioContext = null;
let micStream = null;
let workletNode = null;
let isMuted = false;
let chatHistory = [];
let currentAiBubble = null;
let pendingUserBubble = null;
let isAssistantResponding = false;
let activeSessionProvider = null;
let serverSystemPrompt = 'You are a friendly and polite assistant. Be warm, helpful, and concise in your responses.';

const btnConnect = document.getElementById('btn-connect');
const btnMute = document.getElementById('btn-mute');
const btnSend = document.getElementById('btn-send');
const btnSettings = document.getElementById('btn-settings');
const btnDownloadChat = document.getElementById('btn-download-chat');
const btnClearChat = document.getElementById('btn-clear-chat');
const btnSystemPrompt = document.getElementById('btn-system-prompt');
const textInput = document.getElementById('text-input');
const providerSelectInline = document.getElementById('provider-select-inline');
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
const responseInfoBackdrop = document.getElementById('response-info-backdrop');
const responseInfoClose = document.getElementById('response-info-close');
const responseInfoUsage = document.getElementById('response-info-usage');
const responseInfoDate = document.getElementById('response-info-date');
const responseInfoUser = document.getElementById('response-info-user');
const responseInfoRaw = document.getElementById('response-info-raw');
const responseTabGeneral = document.getElementById('response-tab-general');
const systemPromptBackdrop = document.getElementById('system-prompt-backdrop');
const systemPromptClose = document.getElementById('system-prompt-close');
const btnSystemPromptCancel = document.getElementById('btn-system-prompt-cancel');
const btnSystemPromptReset = document.getElementById('btn-system-prompt-reset');
const btnSystemPromptSave = document.getElementById('btn-system-prompt-save');
const systemPromptInput = document.getElementById('system-prompt-input');
const usageSummaryText = document.getElementById('usage-summary-text');

const chatView = createChatView(transcript, emptyState);
const playback = createOutputPlayback();

/**
 * Updates connection status text and indicator state.
 */
function setStatus(text, state) {
  statusText.textContent = text;
  statusDot.className = 'status-dot ' + (state || '');
}

/**
 * Persists one user message to local chat history.
 */
function appendUserMessage(text, inputType = 'text') {
  chatHistory = appendHistory(
    chatHistory,
    'user',
    text,
    activeSessionProvider || settingsModal.getSelectedProvider(),
    false,
    inputType
  );
}

/**
 * Persists one assistant message to local chat history.
 */
function appendAssistantMessage(text, interrupted = false, usage = undefined, rawResponse = undefined) {
  chatHistory = appendHistory(
    chatHistory,
    'assistant',
    text,
    activeSessionProvider || settingsModal.getSelectedProvider(),
    interrupted,
    'n/a',
    usage,
    rawResponse
  );
  updateUsageSummary();
}

/**
 * Returns normalized per-message usage totals with safe fallback inference.
 */
function getMessageUsageTotals(usage) {
  if (!usage || typeof usage !== 'object') {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  const hasValue = (value) => Number.isInteger(value) && value >= 0;
  let inputTokens = hasValue(usage.inputTokens) ? usage.inputTokens : undefined;
  let outputTokens = hasValue(usage.outputTokens) ? usage.outputTokens : undefined;
  let totalTokens = hasValue(usage.totalTokens) ? usage.totalTokens : undefined;

  if (typeof inputTokens !== 'number' && typeof totalTokens === 'number' && typeof outputTokens === 'number') {
    inputTokens = Math.max(0, totalTokens - outputTokens);
  }
  if (typeof outputTokens !== 'number' && typeof totalTokens === 'number' && typeof inputTokens === 'number') {
    outputTokens = Math.max(0, totalTokens - inputTokens);
  }
  if (typeof totalTokens !== 'number' && typeof inputTokens === 'number' && typeof outputTokens === 'number') {
    totalTokens = inputTokens + outputTokens;
  }

  return {
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    totalTokens: totalTokens || 0,
  };
}

/**
 * Updates conversation-level token totals shown above message input.
 */
function updateUsageSummary() {
  if (!usageSummaryText) {
    return;
  }

  const totals = chatHistory.reduce(
    (acc, item) => {
      const usage = getMessageUsageTotals(item?.usage);
      acc.inputTokens += usage.inputTokens;
      acc.outputTokens += usage.outputTokens;
      acc.totalTokens += usage.totalTokens;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  );

  usageSummaryText.textContent =
    `in: ${totals.inputTokens} · out: ${totals.outputTokens} · total: ${totals.totalTokens}`;
}

/**
 * Formats optional usage metadata into a compact token summary.
 */
function formatUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return '';
  }

  const hasNumber = (value) => Number.isInteger(value) && value >= 0;
  const parts = [];
  if (hasNumber(usage.inputTokens)) {
    parts.push(`in ${usage.inputTokens}`);
  }
  if (hasNumber(usage.outputTokens)) {
    parts.push(`out ${usage.outputTokens}`);
  }
  if (hasNumber(usage.totalTokens)) {
    parts.push(`total ${usage.totalTokens}`);
  }

  return parts.length ? parts.join(' · ') : '';
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
    appendAssistantMessage(finalText, interrupted, bubble._usage, bubble._rawResponse);
  }

  const usageText = formatUsage(bubble._usage);
  if (usageText && bubble._time && !bubble._time.querySelector('.message-usage')) {
    const usageMeta = document.createElement('span');
    usageMeta.className = 'message-usage';
    usageMeta.innerHTML = `<i class="bi bi-bar-chart-line message-usage-icon" aria-hidden="true"></i><span>${usageText}</span>`;
    const infoButton = bubble._time.querySelector('.message-info-btn');
    if (infoButton) {
      bubble._time.insertBefore(usageMeta, infoButton);
    } else {
      bubble._time.appendChild(usageMeta);
    }
  }

  bubble.classList.remove('streaming');
  currentAiBubble = null;
}

/**
 * Applies UI state for an active websocket connection.
 */
function setConnectedUi() {
  btnConnect.innerHTML = `<i class="bi bi-x-circle"></i> ${UI_TEXT.disconnectButtonLabel}`;
  btnConnect.classList.add('disconnect');
  btnConnect.disabled = false;
  btnMute.style.display = 'inline-flex';
  textInput.disabled = false;
  textInput.placeholder = UI_TEXT.inputPlaceholderConnected;
  btnSend.disabled = false;
  textInput.focus();
}

/**
 * Applies UI state for disconnected mode.
 */
function setDisconnectedUi() {
  setStatus(STATUS_TEXT.disconnected, '');
  btnConnect.innerHTML = `<i class="bi bi-plus-circle"></i> ${UI_TEXT.connectButtonLabel}`;
  btnConnect.classList.remove('disconnect');
  btnConnect.disabled = false;
  btnMute.style.display = 'none';
  providerSelectInline.disabled = false;
  voiceSelect.disabled = false;
  textInput.disabled = true;
  textInput.placeholder = UI_TEXT.inputPlaceholderDisconnected;
  btnSend.disabled = true;
  finalizeCurrentAssistantBubble(true);
  isAssistantResponding = false;
  activeSessionProvider = null;
  pendingUserBubble = null;
}

/**
 * Closes current realtime session and tears down media resources.
 */
function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }

  playback.reset();
  isMuted = false;
  iconMic.style.display = '';
  iconMicOff.style.display = 'none';
  btnMuteLabel.textContent = UI_TEXT.muteButtonLabel;
  btnMute.classList.remove('active');
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
      if (ws) {
        disconnect();
      }
    },
    onProviderChanged: () => {
      if (ws) {
        disconnect();
      }
    },
  }
);

settingsModal.bind();

const eventRouter = createEventRouter({
  setStatus,
  chatView,
  playback,
  setVoiceSelectDisabled: (disabled) => {
    voiceSelect.disabled = disabled;
  },
  appendUserMessage,
  setPendingUserBubble: (bubble) => {
    pendingUserBubble = bubble;
  },
  getPendingUserBubble: () => pendingUserBubble,
  setCurrentAiBubble: (bubble) => {
    currentAiBubble = bubble;
  },
  getCurrentAiBubble: () => currentAiBubble,
  setAssistantResponding: (active) => {
    isAssistantResponding = active;
  },
  getAssistantResponding: () => isAssistantResponding,
  finalizeCurrentAssistantBubble,
  requestResponseCancel: () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'response.cancel' }));
    }
    playback.reset();
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
  settingsModal.setServerSettings(payload || undefined);
  serverSystemPrompt = payload?.chat_system_prompt || serverSystemPrompt;

  const provider = settingsModal.getSelectedProvider();
  if (!settingsModal.isProviderSupported(provider) || !settingsModal.hasEffectiveKey(provider)) {
    settingsModal.openModal();
  }
}

/**
 * Restores persisted history into in-memory state and transcript view.
 */
function restoreChatHistory() {
  chatHistory = loadHistory();
  chatView.renderHistory(chatHistory);
  updateUsageSummary();
}

/**
 * Clears persisted and in-memory conversation history and transcript view.
 */
function clearConversationMemory() {
  chatHistory = clearHistory();
  chatView.clearTranscriptView();
  currentAiBubble = null;
  pendingUserBubble = null;
  updateUsageSummary();
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

function findPreviousUserMessageText(messageNode) {
  let cursor = messageNode?.previousElementSibling || null;
  while (cursor) {
    if (cursor.classList?.contains('message') && cursor.classList?.contains('user')) {
      const content = cursor.querySelector('.message-content');
      return (content?.textContent || '').trim() || '-';
    }
    cursor = cursor.previousElementSibling;
  }
  return '-';
}

function openResponseInfoModal(messageNode) {
  if (!messageNode) {
    return;
  }

  const createdAtIso = messageNode._createdAt;
  const createdAt = createdAtIso ? new Date(createdAtIso) : new Date();
  const hasValidDate = !Number.isNaN(createdAt.getTime());
  responseInfoDate.textContent = hasValidDate ? createdAt.toLocaleString() : '-';
  responseInfoUsage.textContent = formatUsage(messageNode._usage) || '-';
  responseInfoUser.value = findPreviousUserMessageText(messageNode);
  responseInfoRaw.textContent = messageNode._rawResponse
    ? JSON.stringify(messageNode._rawResponse, null, 2)
    : '-';
  activateResponseGeneralTab();
  responseInfoBackdrop.style.display = 'flex';
}

function closeResponseInfoModal() {
  responseInfoBackdrop.style.display = 'none';
}

function activateResponseGeneralTab() {
  if (!responseTabGeneral) {
    return;
  }

  const bootstrapApi = window.bootstrap;
  if (bootstrapApi?.Tab) {
    bootstrapApi.Tab.getOrCreateInstance(responseTabGeneral).show();
    return;
  }

  responseTabGeneral.click();
}

function getSavedSystemPrompt() {
  return localStorage.getItem(STORAGE_KEYS.systemPrompt) || '';
}

function getEffectiveSystemPrompt() {
  return getSavedSystemPrompt() || serverSystemPrompt;
}

function openSystemPromptModal() {
  systemPromptInput.value = getEffectiveSystemPrompt();
  systemPromptBackdrop.style.display = 'flex';
  setTimeout(() => systemPromptInput.focus(), 50);
}

function closeSystemPromptModal() {
  systemPromptBackdrop.style.display = 'none';
}

function saveSystemPrompt() {
  const value = systemPromptInput.value.trim();
  if (value && value !== serverSystemPrompt) {
    localStorage.setItem(STORAGE_KEYS.systemPrompt, value);
  } else {
    localStorage.removeItem(STORAGE_KEYS.systemPrompt);
  }

  closeSystemPromptModal();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: { instructions: getEffectiveSystemPrompt() },
      })
    );
  }
}

function resetSystemPromptDraft() {
  systemPromptInput.value = serverSystemPrompt;
  systemPromptInput.focus();
}

/**
 * Sends one typed user message to realtime API and local transcript/history.
 */
function sendTextMessage() {
  const text = textInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify({ type: 'response.cancel' }));
  playback.reset();
  if (isAssistantResponding) {
    finalizeCurrentAssistantBubble(true);
    isAssistantResponding = false;
  }

  chatView.addBubble('user', text);
  appendUserMessage(text, 'text');

  textInput.value = '';
  textInput.style.height = 'auto';

  // Give provider a short moment to apply cancellation before creating the next turn.
  setTimeout(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      })
    );
    ws.send(JSON.stringify({ type: 'response.create' }));
  }, 50);
}

/**
 * Starts microphone capture and opens realtime websocket session.
 */
async function connect() {
  const provider = settingsModal.getSelectedProvider();
  if (!settingsModal.isProviderSupported(provider)) {
    setStatus(`${provider} is not available in this version`, STATUS_STATE.error);
    settingsModal.openModal();
    return;
  }

  if (!settingsModal.hasEffectiveKey(provider)) {
    settingsModal.openModal();
    return;
  }

  btnConnect.disabled = true;
  setStatus(STATUS_TEXT.connecting, STATUS_STATE.connecting);

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setStatus(STATUS_TEXT.micAccessDenied, STATUS_STATE.error);
    btnConnect.disabled = false;
    return;
  }

  audioContext = new AudioContext({ sampleRate: 24000 });
  playback.setAudioContext(audioContext);
  await audioContext.audioWorklet.addModule('js/audio-processor.js');

  const source = audioContext.createMediaStreamSource(micStream);
  workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

  workletNode.port.onmessage = ({ data }) => {
    if (data.type === 'audio' && ws && ws.readyState === WebSocket.OPEN) {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data.data)));
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
    }
  };
  source.connect(workletNode);

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const userKey = settingsModal.getSavedKey(provider);
  const wsParams = new URLSearchParams({ provider });
  if (userKey) {
    wsParams.set('api_key', userKey);
  }
  const wsUrl = `${protocol}://${location.host}/ws?${wsParams.toString()}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    activeSessionProvider = provider;
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          voice: voiceSelect.value,
          instructions: getEffectiveSystemPrompt(),
        },
      })
    );

    const memoryContext = buildModelMemoryMessage(chatHistory);
    if (memoryContext) {
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: memoryContext }],
          },
        })
      );
    }
  };

  ws.onmessage = ({ data }) => {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    eventRouter.handleEvent(event);
  };

  ws.onclose = () => {
    isAssistantResponding = false;
    setDisconnectedUi();
  };

  ws.onerror = () => {
    isAssistantResponding = false;
    setStatus(STATUS_TEXT.connectionError, STATUS_STATE.error);
  };

  setConnectedUi();
}

btnConnect.addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    disconnect();
  } else {
    connect();
  }
});

btnClearChat.addEventListener('click', () => {
  openClearConfirmModal();
});
btnDownloadChat.addEventListener('click', () => {
  downloadChatHistoryCsv(chatHistory);
});

btnClearConfirm.addEventListener('click', () => {
  if (ws) {
    disconnect();
  }
  clearConversationMemory();
  setDisconnectedUi();
  closeClearConfirmModal();
});

btnClearCancel.addEventListener('click', closeClearConfirmModal);
clearConfirmClose.addEventListener('click', closeClearConfirmModal);

clearConfirmBackdrop.addEventListener('click', (e) => {
  if (e.target === clearConfirmBackdrop) {
    closeClearConfirmModal();
  }
});

transcript.addEventListener('click', (e) => {
  const infoButton = e.target.closest('.message-info-btn');
  if (!infoButton) {
    return;
  }
  const messageNode = infoButton.closest('.message');
  openResponseInfoModal(messageNode);
});

responseInfoClose.addEventListener('click', closeResponseInfoModal);
responseInfoBackdrop.addEventListener('click', (e) => {
  if (e.target === responseInfoBackdrop) {
    closeResponseInfoModal();
  }
});

btnSystemPrompt.addEventListener('click', openSystemPromptModal);
systemPromptClose.addEventListener('click', closeSystemPromptModal);
btnSystemPromptReset.addEventListener('click', resetSystemPromptDraft);
btnSystemPromptCancel.addEventListener('click', closeSystemPromptModal);
btnSystemPromptSave.addEventListener('click', saveSystemPrompt);

systemPromptInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    saveSystemPrompt();
  }
});

systemPromptBackdrop.addEventListener('click', (e) => {
  if (e.target === systemPromptBackdrop) {
    closeSystemPromptModal();
  }
});

voiceSelect.addEventListener('change', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: { voice: voiceSelect.value },
      })
    );
  }
});

btnSend.addEventListener('click', sendTextMessage);

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage();
  }
});

textInput.addEventListener('input', () => {
  textInput.style.height = 'auto';
  textInput.style.height = textInput.scrollHeight + 'px';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && clearConfirmBackdrop.style.display !== 'none') {
    closeClearConfirmModal();
  }
  if (e.key === 'Escape' && responseInfoBackdrop.style.display !== 'none') {
    closeResponseInfoModal();
  }
  if (e.key === 'Escape' && systemPromptBackdrop.style.display !== 'none') {
    closeSystemPromptModal();
  }
});

btnMute.addEventListener('click', () => {
  if (!micStream) {
    return;
  }

  isMuted = !isMuted;
  micStream.getAudioTracks().forEach((t) => {
    t.enabled = !isMuted;
  });

  iconMic.style.display = isMuted ? 'none' : '';
  iconMicOff.style.display = isMuted ? '' : 'none';
  btnMuteLabel.textContent = isMuted ? UI_TEXT.unmuteButtonLabel : UI_TEXT.muteButtonLabel;
  btnMute.classList.toggle('active', isMuted);
  setStatus(isMuted ? STATUS_TEXT.muted : STATUS_TEXT.connected, isMuted ? STATUS_STATE.muted : STATUS_STATE.connected);
});

restoreChatHistory();
initSettings();
