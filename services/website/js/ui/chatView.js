import { getUsageBreakdown } from '../usage/costCalculator.js';

/**
 * Creates transcript view helpers for message rendering and transcript state.
 */
export function createChatView(transcript, emptyState) {
  /**
   * Formats ISO timestamp into YYYY-MM-DD H:i:s (local time).
   */
  function formatTimestamp(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${date.getHours()}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  /**
   * Formats optional usage metadata into a compact token summary.
   */
  function formatUsageMarkup(usage, rawResponse) {
    const breakdown = getUsageBreakdown(usage, rawResponse);
    if (!breakdown) {
      return '';
    }

    return [
      `<i class="bi bi-bar-chart-line message-usage-icon" aria-hidden="true"></i><span>Usage:</span>`,
      `<i class="bi bi-volume-up-fill message-usage-icon" aria-hidden="true"></i><span>in: ${breakdown.inputAudioNonCachedTokens}/${breakdown.inputAudioCachedTokens} out: ${breakdown.outputAudioTokens}</span>`,
      `<span>·</span>`,
      `<i class="bi bi-chat-text-fill message-usage-icon" aria-hidden="true"></i><span>in: ${breakdown.inputTextNonCachedTokens}/${breakdown.inputTextCachedTokens} out: ${breakdown.outputTextTokens}</span>`,
    ].join(' ');
  }

  /**
   * Adds a single chat bubble to the transcript and returns its DOM node.
   */
  function addBubble(role, text, createdAt, usage, rawResponse, historyId, interactionId) {
    if (emptyState) {
      emptyState.style.display = 'none';
    }

    const isUser = role.includes('user');
    const label = isUser ? 'You' : 'AI';

    const msg = document.createElement('div');
    msg.className = 'message ' + role;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = label;

    const content = document.createElement('div');
    content.className = 'message-content';

    const contentText = document.createElement('div');
    contentText.className = 'message-content-text';
    contentText.textContent = text;

    const body = document.createElement('div');
    body.className = 'message-body';

    const dateMeta = document.createElement('div');
    dateMeta.className = 'message-date-inside';
    const timeValue = formatTimestamp(createdAt);
    dateMeta.innerHTML = `<i class="bi bi-clock"></i><span>${timeValue}</span>`;

    const timeMeta = document.createElement('div');
    timeMeta.className = 'message-time';
    const createdDate = createdAt ? new Date(createdAt) : new Date();

    const usageMarkup = formatUsageMarkup(usage, rawResponse);
    if (usageMarkup) {
      const usageMeta = document.createElement('span');
      usageMeta.className = 'message-usage';
      usageMeta.innerHTML = usageMarkup;
      timeMeta.appendChild(usageMeta);
    }

    if (!isUser) {
      const infoButton = document.createElement('button');
      infoButton.className = 'message-info-btn';
      infoButton.type = 'button';
      infoButton.setAttribute('aria-label', 'Response details');
      infoButton.title = 'Response details';
      infoButton.innerHTML = '<i class="bi bi-info-circle"></i>';
      timeMeta.appendChild(infoButton);
    }

    content.appendChild(contentText);
    content.appendChild(dateMeta);

    msg.appendChild(avatar);
    body.appendChild(content);
    if (timeMeta.childNodes.length) {
      body.appendChild(timeMeta);
    }
    msg.appendChild(body);
    transcript.appendChild(msg);
    transcript.scrollTop = transcript.scrollHeight;

    msg._content = contentText;
    msg._time = timeMeta;
    msg._usage = usage;
    msg._rawResponse = rawResponse;
    msg._historyId = historyId;
    msg._interactionId = interactionId;
    msg._createdAt = Number.isNaN(createdDate.getTime()) ? new Date().toISOString() : createdDate.toISOString();
    return msg;
  }

  /**
   * Renders an existing history list into the transcript.
   */
  function renderHistory(history) {
    if (!history.length) {
      if (emptyState) {
        emptyState.style.display = 'flex';
      }
      return;
    }

    history.forEach((item) => addBubble(item.role, item.text, item.createdAt, item.usage, item.rawResponse, item.id, item.interactionId));
    transcript.scrollTop = transcript.scrollHeight;
  }

  /**
   * Removes all rendered chat bubbles and shows empty state.
   */
  function clearTranscriptView() {
    transcript.querySelectorAll('.message').forEach((node) => node.remove());
    if (emptyState) {
      emptyState.style.display = 'flex';
    }
  }

  /**
   * Scrolls transcript to the latest message.
   */
  function scrollToBottom() {
    transcript.scrollTop = transcript.scrollHeight;
  }

  return {
    addBubble,
    renderHistory,
    clearTranscriptView,
    scrollToBottom,
  };
}
