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
   * Adds a single chat bubble to the transcript and returns its DOM node.
   */
  function addBubble(role, text, createdAt, usage) {
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
    content.textContent = text;

    const body = document.createElement('div');
    body.className = 'message-body';

    const timeMeta = document.createElement('div');
    timeMeta.className = 'message-time';
    const timeValue = formatTimestamp(createdAt);
    timeMeta.innerHTML = `<i class="bi bi-clock"></i><span>${timeValue}</span>`;

    const usageValue = formatUsage(usage);
    if (usageValue) {
      const usageMeta = document.createElement('span');
      usageMeta.className = 'message-usage';
      usageMeta.textContent = usageValue;
      timeMeta.appendChild(usageMeta);
    }

    msg.appendChild(avatar);
    body.appendChild(content);
    body.appendChild(timeMeta);
    msg.appendChild(body);
    transcript.appendChild(msg);
    transcript.scrollTop = transcript.scrollHeight;

    msg._content = content;
    msg._time = timeMeta;
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

    history.forEach((item) => addBubble(item.role, item.text, item.createdAt, item.usage));
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
