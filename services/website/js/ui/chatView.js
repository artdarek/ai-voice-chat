/**
 * Creates transcript view helpers for message rendering and transcript state.
 */
export function createChatView(transcript, emptyState) {
  /**
   * Adds a single chat bubble to the transcript and returns its DOM node.
   */
  function addBubble(role, text) {
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

    msg.appendChild(avatar);
    msg.appendChild(content);
    transcript.appendChild(msg);
    transcript.scrollTop = transcript.scrollHeight;

    msg._content = content;
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

    history.forEach((item) => addBubble(item.role, item.text));
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
