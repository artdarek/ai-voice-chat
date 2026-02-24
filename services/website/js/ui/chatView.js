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
  function formatUsage(usage, rawResponse) {
    const breakdown = extractUsageBreakdown(usage, rawResponse);
    if (!breakdown) {
      return '';
    }

    return [
      `in ${breakdown.inputTextTokens}/${breakdown.inputAudioTokens} (${breakdown.inputTokens})`,
      `out ${breakdown.outputTextTokens}/${breakdown.outputAudioTokens} (${breakdown.outputTokens})`,
      `total ${breakdown.inputTokens}/${breakdown.outputTokens} (${breakdown.totalTokens})`,
    ].join(' · ');
  }

  function extractUsageBreakdown(usage, rawResponse) {
    if ((!usage || typeof usage !== 'object') && (!rawResponse || typeof rawResponse !== 'object')) {
      return null;
    }

    const toInt = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined);
    const rawUsage = rawResponse?.response?.usage;
    const inputDetails = rawUsage?.input_token_details || rawUsage?.inputTokenDetails || {};
    const outputDetails = rawUsage?.output_token_details || rawUsage?.outputTokenDetails || {};

    let inputTextTokens = toInt(inputDetails.text_tokens ?? inputDetails.textTokens) || 0;
    let inputAudioTokens = toInt(inputDetails.audio_tokens ?? inputDetails.audioTokens) || 0;
    let outputTextTokens = toInt(outputDetails.text_tokens ?? outputDetails.textTokens) || 0;
    let outputAudioTokens = toInt(outputDetails.audio_tokens ?? outputDetails.audioTokens) || 0;

    const usageInput = toInt(usage?.inputTokens);
    const usageOutput = toInt(usage?.outputTokens);
    const usageTotal = toInt(usage?.totalTokens);
    const rawInput = toInt(rawUsage?.input_tokens ?? rawUsage?.prompt_tokens);
    const rawOutput = toInt(rawUsage?.output_tokens ?? rawUsage?.completion_tokens);
    const rawTotal = toInt(rawUsage?.total_tokens);

    const inputTokens = rawInput ?? usageInput ?? (inputTextTokens + inputAudioTokens);
    const outputTokens = rawOutput ?? usageOutput ?? (outputTextTokens + outputAudioTokens);
    const totalTokens = rawTotal ?? usageTotal ?? (inputTokens + outputTokens);
    if (inputTextTokens === 0 && inputAudioTokens === 0 && inputTokens > 0) {
      inputTextTokens = inputTokens;
    }
    if (outputTextTokens === 0 && outputAudioTokens === 0 && outputTokens > 0) {
      outputTextTokens = outputTokens;
    }

    return {
      inputTextTokens,
      inputAudioTokens,
      outputTextTokens,
      outputAudioTokens,
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }

  /**
   * Adds a single chat bubble to the transcript and returns its DOM node.
   */
  function addBubble(role, text, createdAt, usage, rawResponse) {
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

    const usageValue = formatUsage(usage, rawResponse);
    if (usageValue) {
      const usageMeta = document.createElement('span');
      usageMeta.className = 'message-usage';
      usageMeta.innerHTML = `<i class="bi bi-bar-chart-line message-usage-icon" aria-hidden="true"></i><span>${usageValue}</span>`;
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

    history.forEach((item) => addBubble(item.role, item.text, item.createdAt, item.usage, item.rawResponse));
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
