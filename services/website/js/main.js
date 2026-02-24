import { createOutputPlayback } from './audio/outputPlayback.js';
import { buildModelMemoryMessage } from './memory/contextBuilder.js';
import { createEventRouter } from './realtime/eventRouter.js';
import { downloadChatHistoryCsv } from './storage/csvExport.js';
import { appendHistory, clearHistory, loadHistory } from './storage/historyStore.js';
import { createChatView } from './ui/chatView.js';
import { createSettingsModal } from './ui/settingsModal.js';
import {
  HISTORY_LIMITS,
  PROVIDERS,
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
let activeSessionModel = null;
let activeInteractionId = null;
let serverSystemPrompt = 'You are a friendly and polite assistant. Be warm, helpful, and concise in your responses.';
let providerCatalog = { providers: {} };
const FALLBACK_PROVIDER_CATALOG = {
  providers: {
    openai: {
      label: 'OpenAI',
      models: [
        { id: 'gpt-realtime-mini-2025-12-15', label: 'gpt-realtime-mini-2025-12-15' },
      ],
      pricing: {},
    },
    azure: {
      label: 'Azure OpenAI',
      deployments: [
        { name: 'gpt-realtime-mini', model: 'gpt-realtime-mini', label: 'gpt-realtime-mini' },
      ],
      pricing: {},
    },
  },
};

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
const responseInfoBackdrop = document.getElementById('response-info-backdrop');
const responseInfoClose = document.getElementById('response-info-close');
const responseInfoUsageIn = document.getElementById('response-info-usage-in');
const responseInfoUsageOut = document.getElementById('response-info-usage-out');
const responseInfoUsageTotal = document.getElementById('response-info-usage-total');
const responseInfoDate = document.getElementById('response-info-date');
const responseInfoUser = document.getElementById('response-info-user');
const responseInfoRaw = document.getElementById('response-info-raw');
const responseInfoAudioIn = document.getElementById('response-info-audio-in');
const responseInfoTextIn = document.getElementById('response-info-text-in');
const responseInfoAudioOut = document.getElementById('response-info-audio-out');
const responseInfoTextOut = document.getElementById('response-info-text-out');
const responseInfoAudioTotal = document.getElementById('response-info-audio-total');
const responseInfoTextTotal = document.getElementById('response-info-text-total');
const responseInfoCostInput = document.getElementById('response-info-cost-input');
const responseInfoCostCachedInput = document.getElementById('response-info-cost-cached-input');
const responseInfoCostOutput = document.getElementById('response-info-cost-output');
const responseInfoCostTotal = document.getElementById('response-info-cost-total');
const responseTabGeneral = document.getElementById('response-tab-general');
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
const DEFAULT_CONTEXT_REPLAY_COUNT = 10;

/**
 * Updates connection status text and indicator state.
 */
function setStatus(text, state) {
  statusText.textContent = text;
  statusDot.className = 'status-dot ' + (state || '');
}

function createInteractionId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Persists one user message to local chat history.
 */
function appendUserMessage(text, inputType = 'text', interactionId = undefined) {
  const selectedProvider = activeSessionProvider || settingsModal.getSelectedProvider();
  const selectedTarget = getSelectedRealtimeTarget(selectedProvider);
  const nextHistory = appendHistory(
    chatHistory,
    'user',
    text,
    selectedProvider,
    activeSessionModel || selectedTarget.resolvedModel,
    false,
    inputType,
    undefined,
    undefined,
    interactionId
  );
  chatHistory = nextHistory;
  return nextHistory[nextHistory.length - 1];
}

/**
 * Persists one assistant message to local chat history.
 */
function appendAssistantMessage(text, interrupted = false, usage = undefined, rawResponse = undefined, interactionId = undefined) {
  const selectedProvider = activeSessionProvider || settingsModal.getSelectedProvider();
  const selectedTarget = getSelectedRealtimeTarget(selectedProvider);
  const nextHistory = appendHistory(
    chatHistory,
    'assistant',
    text,
    selectedProvider,
    activeSessionModel || selectedTarget.resolvedModel,
    interrupted,
    'n/a',
    usage,
    rawResponse,
    interactionId
  );
  chatHistory = nextHistory;
  updateUsageSummary();
  return nextHistory[nextHistory.length - 1];
}

/**
 * Returns normalized per-message usage totals with safe fallback inference.
 */
function getMessageUsageTotals(usage) {
  const breakdown = getUsageBreakdown(usage, undefined);
  return {
    inputTokens: breakdown.inputTokens,
    outputTokens: breakdown.outputTokens,
    totalTokens: breakdown.totalTokens,
  };
}

function getUsageBreakdown(usage, rawResponse) {
  const toInt = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined);
  const rawUsage = rawResponse?.response?.usage;
  const inputDetails = rawUsage?.input_token_details || rawUsage?.inputTokenDetails || {};
  const outputDetails = rawUsage?.output_token_details || rawUsage?.outputTokenDetails || {};
  const cachedDetails = inputDetails.cached_tokens_details || inputDetails.cachedTokenDetails || {};

  let inputTextTokens = toInt(inputDetails.text_tokens ?? inputDetails.textTokens) || 0;
  let inputAudioTokens = toInt(inputDetails.audio_tokens ?? inputDetails.audioTokens) || 0;
  let outputTextTokens = toInt(outputDetails.text_tokens ?? outputDetails.textTokens) || 0;
  let outputAudioTokens = toInt(outputDetails.audio_tokens ?? outputDetails.audioTokens) || 0;
  const inputAudioCachedTokens = toInt(cachedDetails.audio_tokens ?? cachedDetails.audioTokens) || 0;
  const inputTextCachedTokens = toInt(cachedDetails.text_tokens ?? cachedDetails.textTokens) || 0;

  const usageInput = toInt(usage?.inputTokens);
  const usageOutput = toInt(usage?.outputTokens);
  const usageTotal = toInt(usage?.totalTokens);
  const rawInput = toInt(rawUsage?.input_tokens ?? rawUsage?.prompt_tokens);
  const rawOutput = toInt(rawUsage?.output_tokens ?? rawUsage?.completion_tokens);
  const rawTotal = toInt(rawUsage?.total_tokens);

  let inputTokens = rawInput ?? usageInput;
  let outputTokens = rawOutput ?? usageOutput;
  let totalTokens = rawTotal ?? usageTotal;

  if (typeof inputTokens !== 'number' && typeof totalTokens === 'number' && typeof outputTokens === 'number') {
    inputTokens = Math.max(0, totalTokens - outputTokens);
  }
  if (typeof outputTokens !== 'number' && typeof totalTokens === 'number' && typeof inputTokens === 'number') {
    outputTokens = Math.max(0, totalTokens - inputTokens);
  }
  if (typeof totalTokens !== 'number' && typeof inputTokens === 'number' && typeof outputTokens === 'number') {
    totalTokens = inputTokens + outputTokens;
  }
  if (typeof inputTokens !== 'number') {
    inputTokens = inputTextTokens + inputAudioTokens;
  }
  if (typeof outputTokens !== 'number') {
    outputTokens = outputTextTokens + outputAudioTokens;
  }
  if (typeof totalTokens !== 'number') {
    totalTokens = inputTokens + outputTokens;
  }
  if (inputTextTokens === 0 && inputAudioTokens === 0 && inputTokens > 0) {
    inputTextTokens = inputTokens;
  }
  if (outputTextTokens === 0 && outputAudioTokens === 0 && outputTokens > 0) {
    outputTextTokens = outputTokens;
  }
  const normalizedAudioCached = Math.min(inputAudioCachedTokens, inputAudioTokens);
  const normalizedTextCached = Math.min(inputTextCachedTokens, inputTextTokens);

  return {
    inputTextTokens,
    inputAudioTokens,
    inputTextNonCachedTokens: Math.max(0, inputTextTokens - normalizedTextCached),
    inputAudioNonCachedTokens: Math.max(0, inputAudioTokens - normalizedAudioCached),
    inputTextCachedTokens: normalizedTextCached,
    inputAudioCachedTokens: normalizedAudioCached,
    outputTextTokens,
    outputAudioTokens,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function getProviderRuntimeConfig(provider) {
  return providerCatalog?.providers?.[provider] || FALLBACK_PROVIDER_CATALOG.providers[provider] || {};
}

function getStoredRealtimeSelections() {
  let parsed;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.realtimeModelSelections) || '{}');
  } catch {
    parsed = {};
  }
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function saveRealtimeSelection(provider, value) {
  if (!provider || !value) {
    return;
  }
  const next = { ...getStoredRealtimeSelections(), [provider]: value };
  localStorage.setItem(STORAGE_KEYS.realtimeModelSelections, JSON.stringify(next));
}

function renderProviderOptions(supportedProviders = []) {
  const catalogProviders = providerCatalog?.providers && typeof providerCatalog.providers === 'object'
    ? providerCatalog.providers
    : {};
  const entries = Object.entries(catalogProviders)
    .map(([id, cfg]) => ({
      id: String(id || '').trim().toLowerCase(),
      label: String(cfg?.label || id || '').trim(),
    }))
    .filter((item) => item.id && item.label && PROVIDERS[item.id]);

  const fallbackEntries = [
    { id: 'openai', label: 'OpenAI' },
    { id: 'azure', label: 'Azure OpenAI' },
  ].filter((item) => PROVIDERS[item.id]);

  const available = entries.length ? entries : fallbackEntries;
  if (!available.length) {
    return;
  }

  const normalizedSupported = Array.isArray(supportedProviders)
    ? supportedProviders.map((p) => String(p || '').toLowerCase())
    : [];

  const current = (settingsModal?.getSelectedProvider?.() || localStorage.getItem(STORAGE_KEYS.llmProvider) || '').toLowerCase();
  const selected = available.some((item) => item.id === current) ? current : available[0].id;
  const render = (selectEl) => {
    if (!selectEl) {
      return;
    }
    selectEl.innerHTML = available
      .map((item) => `<option value="${item.id}">${item.label}</option>`)
      .join('');
    if (normalizedSupported.length) {
      Array.from(selectEl.options).forEach((opt) => {
        opt.disabled = !normalizedSupported.includes(opt.value);
      });
    }
    selectEl.value = selected;
  };

  render(providerSelectInline);
  render(providerSelectModal);
}

function renderModelOptions(provider) {
  if (!modelSelectInline) {
    return;
  }
  const normalizedProvider = (provider || 'openai').toLowerCase();
  const runtimeConfig = getProviderRuntimeConfig(normalizedProvider);
  const options = normalizedProvider === 'azure'
    ? (runtimeConfig.deployments || []).map((item) => ({
      value: String(item?.name || '').trim(),
      label: String(item?.label || item?.name || '').trim(),
      enabled: item?.enabled !== false,
    }))
    : (runtimeConfig.models || []).map((item) => ({
      value: String(item?.id || '').trim(),
      label: String(item?.label || item?.id || '').trim(),
      enabled: item?.enabled !== false,
    }));

  const validOptions = options.filter((item) => item.value && item.label && item.enabled);
  modelSelectInline.innerHTML = validOptions
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join('');

  if (!validOptions.length) {
    modelSelectInline.innerHTML = '<option value="">No models available</option>';
    modelSelectInline.disabled = true;
    return;
  }

  const saved = getStoredRealtimeSelections()[normalizedProvider];
  const fallback = validOptions[0].value;
  const selected = validOptions.some((item) => item.value === saved) ? saved : fallback;
  modelSelectInline.disabled = false;
  modelSelectInline.value = selected;
  saveRealtimeSelection(normalizedProvider, selected);
}

function getSelectedRealtimeTarget(provider = settingsModal.getSelectedProvider()) {
  const normalizedProvider = (provider || 'openai').toLowerCase();
  const selectedValue = (modelSelectInline?.value || '').trim();
  const runtimeConfig = getProviderRuntimeConfig(normalizedProvider);

  if (normalizedProvider === 'azure') {
    const deployment = (runtimeConfig.deployments || []).find((item) => item.name === selectedValue);
    const deploymentName = deployment?.name || selectedValue || '';
    const resolvedModel = deployment?.model || deploymentName || 'unknown';
    return {
      provider: 'azure',
      model: undefined,
      deployment: deploymentName || undefined,
      resolvedModel,
    };
  }

  const model = (runtimeConfig.models || []).find((item) => item.id === selectedValue);
  const modelId = model?.id || selectedValue || '';
  return {
    provider: 'openai',
    model: modelId || undefined,
    deployment: undefined,
    resolvedModel: modelId || 'unknown',
  };
}

function parseRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function getModelPricing(provider, model) {
  const pricing = getProviderRuntimeConfig(provider)?.pricing || {};
  const modelPricing = model ? pricing[model] : undefined;
  if (!modelPricing || typeof modelPricing !== 'object') {
    return null;
  }

  return {
    inputTextPer1m: parseRate(modelPricing?.input?.text),
    inputAudioPer1m: parseRate(modelPricing?.input?.audio),
    cachedInputTextPer1m: parseRate(modelPricing?.cached_input?.text),
    cachedInputAudioPer1m: parseRate(modelPricing?.cached_input?.audio),
    outputTextPer1m: parseRate(modelPricing?.output?.text),
    outputAudioPer1m: parseRate(modelPricing?.output?.audio),
  };
}

function estimateCostFromUsageBreakdown(usageBreakdown, provider, model) {
  const pricing = getModelPricing(provider, model);
  if (!pricing) {
    return null;
  }

  const inputCost = (
    (usageBreakdown.inputTextNonCachedTokens / 1_000_000) * pricing.inputTextPer1m +
    (usageBreakdown.inputAudioNonCachedTokens / 1_000_000) * pricing.inputAudioPer1m
  );
  const cachedInputCost = (
    (usageBreakdown.inputTextCachedTokens / 1_000_000) * pricing.cachedInputTextPer1m +
    (usageBreakdown.inputAudioCachedTokens / 1_000_000) * pricing.cachedInputAudioPer1m
  );
  const outputCost = (
    (usageBreakdown.outputTextTokens / 1_000_000) * pricing.outputTextPer1m +
    (usageBreakdown.outputAudioTokens / 1_000_000) * pricing.outputAudioPer1m
  );
  const totalCost = inputCost + cachedInputCost + outputCost;

  return {
    inputCost,
    cachedInputCost,
    outputCost,
    totalCost,
  };
}

function formatUsd(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return `$${value.toFixed(6)}`;
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
      const usage = getUsageBreakdown(item?.usage, item?.rawResponse);
      const usageCost = estimateCostFromUsageBreakdown(usage, item?.provider, item?.model);
      acc.inputTextTokens += usage.inputTextTokens;
      acc.inputAudioTokens += usage.inputAudioTokens;
      acc.inputTextNonCachedTokens += usage.inputTextNonCachedTokens;
      acc.inputAudioNonCachedTokens += usage.inputAudioNonCachedTokens;
      acc.inputTextCachedTokens += usage.inputTextCachedTokens;
      acc.inputAudioCachedTokens += usage.inputAudioCachedTokens;
      acc.outputTextTokens += usage.outputTextTokens;
      acc.outputAudioTokens += usage.outputAudioTokens;
      acc.inputTokens += usage.inputTokens;
      acc.outputTokens += usage.outputTokens;
      acc.totalTokens += usage.totalTokens;
      acc.totalCost += usageCost?.totalCost || 0;
      return acc;
    },
    {
      inputTextTokens: 0,
      inputAudioTokens: 0,
      inputTextNonCachedTokens: 0,
      inputAudioNonCachedTokens: 0,
      inputTextCachedTokens: 0,
      inputAudioCachedTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
    }
  );

  usageSummaryText.innerHTML = [
    `<i class="bi bi-bar-chart-line usage-summary-icon" aria-hidden="true"></i><span>Usage:</span>`,
    `<i class="bi bi-volume-up-fill usage-summary-icon" aria-hidden="true"></i><span>in: ${totals.inputAudioNonCachedTokens}/${totals.inputAudioCachedTokens} out: ${totals.outputAudioTokens}</span>`,
    `<span>·</span>`,
    `<i class="bi bi-chat-text-fill usage-summary-icon" aria-hidden="true"></i><span>in: ${totals.inputTextNonCachedTokens}/${totals.inputTextCachedTokens} out: ${totals.outputTextTokens}</span>`,
    `<span>·</span>`,
    `<i class="bi bi-cash-coin usage-summary-icon" aria-hidden="true"></i><span>${formatUsd(totals.totalCost)}</span>`,
  ].join(' ');

  if (usageSummaryInteractions) {
    const interactions = chatHistory.reduce(
      (acc, item) => acc + (item?.role === 'assistant' ? 1 : 0),
      0
    );
    usageSummaryInteractions.textContent = String(interactions);
  }
}

/**
 * Formats optional usage metadata into a compact token summary.
 */
function formatUsageMarkup(usage, rawResponse, provider, model) {
  if ((!usage || typeof usage !== 'object') && (!rawResponse || typeof rawResponse !== 'object')) {
    return '';
  }

  const totals = getUsageBreakdown(usage, rawResponse);
  const usageCost = estimateCostFromUsageBreakdown(totals, provider, model);
  return [
    `<i class="bi bi-bar-chart-line message-usage-icon" aria-hidden="true"></i><span>Usage:</span>`,
    `<i class="bi bi-volume-up-fill message-usage-icon" aria-hidden="true"></i><span>in: ${totals.inputAudioNonCachedTokens}/${totals.inputAudioCachedTokens} out: ${totals.outputAudioTokens}</span>`,
    `<span>·</span>`,
    `<i class="bi bi-chat-text-fill message-usage-icon" aria-hidden="true"></i><span>in: ${totals.inputTextNonCachedTokens}/${totals.inputTextCachedTokens} out: ${totals.outputTextTokens}</span>`,
    usageCost ? `<span>·</span><i class="bi bi-cash-coin message-usage-icon" aria-hidden="true"></i><span>${formatUsd(usageCost.totalCost)}</span>` : '',
  ].join(' ');
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
    const assistantEntry = appendAssistantMessage(finalText, interrupted, bubble._usage, bubble._rawResponse, bubble._interactionId);
    bubble._historyId = assistantEntry?.id;
    bubble._provider = assistantEntry?.provider || bubble._provider;
    bubble._model = assistantEntry?.model || bubble._model;
    activeInteractionId = null;
  }

  const usageMarkup = formatUsageMarkup(bubble._usage, bubble._rawResponse, bubble._provider, bubble._model);
  if (usageMarkup && bubble._time && !bubble._time.querySelector('.message-usage')) {
    const usageMeta = document.createElement('span');
    usageMeta.className = 'message-usage';
    usageMeta.innerHTML = usageMarkup;
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
  providerSelectInline.disabled = false;
  if (modelSelectInline) {
    modelSelectInline.disabled = !modelSelectInline.options.length;
  }
  voiceSelect.disabled = false;
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
  if (modelSelectInline) {
    modelSelectInline.disabled = !modelSelectInline.options.length;
  }
  voiceSelect.disabled = false;
  textInput.disabled = true;
  textInput.placeholder = UI_TEXT.inputPlaceholderDisconnected;
  btnSend.disabled = true;
  finalizeCurrentAssistantBubble(true);
  isAssistantResponding = false;
  activeSessionProvider = null;
  activeSessionModel = null;
  pendingUserBubble = null;
  activeInteractionId = null;
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
    onProviderChanged: (provider) => {
      renderModelOptions(provider);
      if (ws) {
        disconnect();
        connect();
      }
    },
  }
);

settingsModal.bind();

const eventRouter = createEventRouter({
  setStatus,
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
  getActiveModel: () => activeSessionModel || getSelectedRealtimeTarget().resolvedModel,
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
  providerCatalog = payload?.provider_catalog || FALLBACK_PROVIDER_CATALOG;
  renderProviderOptions(payload?.supported_realtime_providers || []);
  settingsModal.setServerSettings(payload || undefined);
  renderModelOptions(settingsModal.getSelectedProvider());
  updateUsageSummary();
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
  activeInteractionId = null;
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
      const content = cursor.querySelector('.message-content-text') || cursor.querySelector('.message-content');
      return (content?.textContent || '').trim() || '-';
    }
    cursor = cursor.previousElementSibling;
  }
  return '-';
}

function findModalContextFromHistory(historyId) {
  if (!historyId) {
    return null;
  }

  const assistantIndex = chatHistory.findIndex((item) => item.id === historyId && item.role === 'assistant');
  if (assistantIndex < 0) {
    return null;
  }

  const assistant = chatHistory[assistantIndex];
  let userText = '-';
  if (assistant.interactionId) {
    const pairedUser = chatHistory.find((item) => item.role === 'user' && item.interactionId === assistant.interactionId);
    if (pairedUser?.text) {
      userText = pairedUser.text.trim() || '-';
    }
  }

  if (userText === '-') {
    for (let i = assistantIndex - 1; i >= 0; i -= 1) {
      if (chatHistory[i]?.role === 'user') {
        userText = (chatHistory[i].text || '').trim() || '-';
        break;
      }
    }
  }

  return { assistant, userText };
}

function openResponseInfoModal(messageNode) {
  if (!messageNode) {
    return;
  }

  const historyContext = findModalContextFromHistory(messageNode._historyId);
  const sourceEntry = historyContext?.assistant;
  const sourceUsage = sourceEntry?.usage ?? messageNode._usage;
  const sourceRawResponse = sourceEntry?.rawResponse ?? messageNode._rawResponse;
  const sourceProvider = sourceEntry?.provider ?? messageNode._provider;
  const sourceModel = sourceEntry?.model ?? messageNode._model;
  const sourceUserText = historyContext?.userText ?? findPreviousUserMessageText(messageNode);
  const createdAtIso = sourceEntry?.createdAt ?? messageNode._createdAt;
  const createdAt = createdAtIso ? new Date(createdAtIso) : new Date();
  const hasValidDate = !Number.isNaN(createdAt.getTime());
  const usageDisplay = getUsageDisplayValues(sourceUsage);
  responseInfoDate.textContent = hasValidDate ? createdAt.toLocaleString() : '-';
  responseInfoUsageIn.textContent = usageDisplay.inputTokens;
  responseInfoUsageOut.textContent = usageDisplay.outputTokens;
  responseInfoUsageTotal.textContent = usageDisplay.totalTokens;
  responseInfoUser.value = sourceUserText;
  responseInfoRaw.textContent = sourceRawResponse
    ? JSON.stringify(sourceRawResponse, null, 2)
    : '-';
  const usageDetails = extractUsageTokenBreakdown(sourceRawResponse);
  responseInfoAudioIn.textContent = usageDetails.audioIn;
  responseInfoTextIn.textContent = usageDetails.textIn;
  responseInfoAudioOut.textContent = usageDetails.audioOut;
  responseInfoTextOut.textContent = usageDetails.textOut;
  responseInfoAudioTotal.textContent = usageDetails.audioTotal;
  responseInfoTextTotal.textContent = usageDetails.textTotal;
  const usageCost = estimateCostFromUsageBreakdown(
    getUsageBreakdown(sourceUsage, sourceRawResponse),
    sourceProvider,
    sourceModel
  );
  responseInfoCostInput.textContent = usageCost ? formatUsd(usageCost.inputCost) : '-';
  responseInfoCostCachedInput.textContent = usageCost ? formatUsd(usageCost.cachedInputCost) : '-';
  responseInfoCostOutput.textContent = usageCost ? formatUsd(usageCost.outputCost) : '-';
  responseInfoCostTotal.textContent = usageCost ? formatUsd(usageCost.totalCost) : '-';
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

function getUsageDisplayValues(usage) {
  if (!usage || typeof usage !== 'object') {
    return { inputTokens: '-', outputTokens: '-', totalTokens: '-' };
  }

  const hasValue = (value) => Number.isInteger(value) && value >= 0;
  const totals = getMessageUsageTotals(usage);
  const hasInput = hasValue(usage.inputTokens) || (hasValue(usage.totalTokens) && hasValue(usage.outputTokens));
  const hasOutput = hasValue(usage.outputTokens) || (hasValue(usage.totalTokens) && hasValue(usage.inputTokens));
  const hasTotal = hasValue(usage.totalTokens) || (hasValue(usage.inputTokens) && hasValue(usage.outputTokens));

  return {
    inputTokens: hasInput ? String(totals.inputTokens) : '-',
    outputTokens: hasOutput ? String(totals.outputTokens) : '-',
    totalTokens: hasTotal ? String(totals.totalTokens) : '-',
  };
}

function extractUsageTokenBreakdown(rawResponse) {
  const usage = rawResponse?.response?.usage;
  if (!usage || typeof usage !== 'object') {
    return {
      audioIn: '-',
      audioOut: '-',
      audioTotal: '-',
      textIn: '-',
      textOut: '-',
      textTotal: '-',
    };
  }

  const toTokenInt = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined);
  const toTokenString = (value) => (typeof value === 'number' ? String(value) : '-');
  const getTotalString = (input, output) => (
    typeof input === 'number' && typeof output === 'number' ? String(input + output) : '-'
  );
  const formatInWithCache = (total, cached) => {
    if (typeof total !== 'number') {
      return '-';
    }
    const normalizedCached = typeof cached === 'number' ? Math.min(Math.max(cached, 0), total) : 0;
    const nonCached = Math.max(0, total - normalizedCached);
    return `${total} (${nonCached}/${normalizedCached})`;
  };

  const inputDetails = usage.input_token_details || usage.inputTokenDetails || {};
  const outputDetails = usage.output_token_details || usage.outputTokenDetails || {};
  const audioIn = toTokenInt(inputDetails.audio_tokens ?? inputDetails.audioTokens);
  const textIn = toTokenInt(inputDetails.text_tokens ?? inputDetails.textTokens);
  const audioOut = toTokenInt(outputDetails.audio_tokens ?? outputDetails.audioTokens);
  const textOut = toTokenInt(outputDetails.text_tokens ?? outputDetails.textTokens);
  const cachedDetails = inputDetails.cached_tokens_details || inputDetails.cachedTokenDetails || {};
  const audioCachedIn = toTokenInt(
    cachedDetails.audio_tokens ??
    cachedDetails.audioTokens ??
    inputDetails.audio_cached_tokens ??
    inputDetails.audioCachedTokens ??
    inputDetails.cached_audio_tokens ??
    inputDetails.cachedAudioTokens
  ) || 0;
  const textCachedIn = toTokenInt(
    cachedDetails.text_tokens ??
    cachedDetails.textTokens ??
    inputDetails.text_cached_tokens ??
    inputDetails.textCachedTokens ??
    inputDetails.cached_text_tokens ??
    inputDetails.cachedTextTokens
  ) || 0;

  return {
    audioIn: formatInWithCache(audioIn, audioCachedIn),
    audioOut: toTokenString(audioOut),
    audioTotal: getTotalString(audioIn, audioOut),
    textIn: formatInWithCache(textIn, textCachedIn),
    textOut: toTokenString(textOut),
    textTotal: getTotalString(textIn, textOut),
  };
}

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

function openSystemPromptModal() {
  const replay = getContextReplaySettings();
  systemPromptInput.value = getEffectiveSystemPrompt();
  if (contextReplayEnabledInput) {
    contextReplayEnabledInput.checked = replay.enabled;
  }
  if (contextReplayCountInput) {
    contextReplayCountInput.value = String(replay.count);
  }
  setContextReplayControlsEnabled(replay.enabled);
  systemPromptBackdrop.style.display = 'flex';
  setTimeout(() => systemPromptInput.focus(), 50);
}

function closeSystemPromptModal() {
  systemPromptBackdrop.style.display = 'none';
}

function saveSystemPrompt() {
  const previousReplay = getContextReplaySettings();
  const previousEffectivePrompt = getEffectiveSystemPrompt();
  const value = systemPromptInput.value.trim();
  if (value && value !== serverSystemPrompt) {
    localStorage.setItem(STORAGE_KEYS.systemPrompt, value);
  } else {
    localStorage.removeItem(STORAGE_KEYS.systemPrompt);
  }

  const replayEnabled = Boolean(contextReplayEnabledInput?.checked);
  const replayCount = parseContextReplayCount(contextReplayCountInput?.value);
  localStorage.setItem(STORAGE_KEYS.contextReplayEnabled, replayEnabled ? 'true' : 'false');
  localStorage.setItem(STORAGE_KEYS.contextReplayCount, String(replayCount));

  closeSystemPromptModal();

  if (ws && ws.readyState === WebSocket.OPEN) {
    const replay = getContextReplaySettings();
    const promptChanged = previousEffectivePrompt !== getEffectiveSystemPrompt();
    const replayChanged =
      previousReplay.enabled !== replay.enabled ||
      previousReplay.count !== replay.count;

    if (replayChanged || promptChanged) {
      disconnect();
      connect();
      return;
    }

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
  if (contextReplayEnabledInput) {
    contextReplayEnabledInput.checked = true;
  }
  if (contextReplayCountInput) {
    contextReplayCountInput.value = String(DEFAULT_CONTEXT_REPLAY_COUNT);
  }
  setContextReplayControlsEnabled(true);
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

  const interactionId = createInteractionId();
  activeInteractionId = interactionId;
  const userBubble = chatView.addBubble('user', text);
  userBubble._interactionId = interactionId;
  appendUserMessage(text, 'text', interactionId);

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
  const target = getSelectedRealtimeTarget(provider);
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
  if (provider === 'azure' && target.deployment) {
    wsParams.set('deployment', target.deployment);
  }
  if (provider === 'openai' && target.model) {
    wsParams.set('model', target.model);
  }
  if (userKey) {
    wsParams.set('api_key', userKey);
  }
  const wsUrl = `${protocol}://${location.host}/ws?${wsParams.toString()}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    activeSessionProvider = provider;
    activeSessionModel = target.resolvedModel || 'unknown';
    saveRealtimeSelection(provider, provider === 'azure' ? target.deployment : target.model);
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          voice: voiceSelect.value,
          instructions: getEffectiveSystemPrompt(),
        },
      })
    );

    const replay = getContextReplaySettings();
    const memoryContext = buildModelMemoryMessage(chatHistory, replay);
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

contextReplayEnabledInput?.addEventListener('change', () => {
  setContextReplayControlsEnabled(Boolean(contextReplayEnabledInput.checked));
});

contextReplayCountInput?.addEventListener('blur', () => {
  contextReplayCountInput.value = String(parseContextReplayCount(contextReplayCountInput.value));
});

systemPromptBackdrop.addEventListener('click', (e) => {
  if (e.target === systemPromptBackdrop) {
    closeSystemPromptModal();
  }
});

voiceSelect.addEventListener('change', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    disconnect();
    connect();
  }
});

modelSelectInline?.addEventListener('change', () => {
  const provider = settingsModal.getSelectedProvider();
  saveRealtimeSelection(provider, modelSelectInline.value);
  if (ws && ws.readyState === WebSocket.OPEN) {
    disconnect();
    connect();
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
