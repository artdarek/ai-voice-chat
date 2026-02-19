import { createOutputPlayback } from './audio/outputPlayback.js';
import { buildModelMemoryMessage } from './memory/contextBuilder.js';
import { createEventRouter } from './realtime/eventRouter.js';
import { appendHistory, clearHistory, loadHistory } from './storage/historyStore.js';
import { createChatView } from './ui/chatView.js';
import { createSettingsModal } from './ui/settingsModal.js';
import {
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

const btnConnect = document.getElementById('btn-connect');
const btnMute = document.getElementById('btn-mute');
const btnSend = document.getElementById('btn-send');
const btnSettings = document.getElementById('btn-settings');
const btnDownloadChat = document.getElementById('btn-download-chat');
const btnClearChat = document.getElementById('btn-clear-chat');
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
function appendUserMessage(text) {
  chatHistory = appendHistory(chatHistory, 'user', text);
}

/**
 * Persists one assistant message to local chat history.
 */
function appendAssistantMessage(text) {
  chatHistory = appendHistory(chatHistory, 'assistant', text);
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
    appendAssistantMessage(finalText);
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
}

/**
 * Clears persisted and in-memory conversation history and transcript view.
 */
function clearConversationMemory() {
  chatHistory = clearHistory();
  chatView.clearTranscriptView();
  currentAiBubble = null;
  pendingUserBubble = null;
}

/**
 * Escapes one CSV field using RFC4180-style quoting.
 */
function escapeCsvField(value) {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * Creates CSV and triggers browser download for current chat history.
 */
function downloadChatHistoryCsv() {
  if (!chatHistory.length) {
    return;
  }

  const header = ['id', 'createdAt', 'role', 'text'].map(escapeCsvField).join(',');
  const rows = chatHistory.map((item) =>
    [item.id || '', item.createdAt || '', item.role || '', item.text || '']
      .map(escapeCsvField)
      .join(',')
  );
  const csv = [header, ...rows].join('\n');

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const filename = `chat-history-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  appendUserMessage(text);

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
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: { voice: voiceSelect.value },
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
btnDownloadChat.addEventListener('click', downloadChatHistoryCsv);

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
