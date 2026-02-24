import { STATUS_STATE, STATUS_TEXT, UI_TEXT } from '../constants.js';

/**
 * Normalizes provider usage payload to a stable UI/storage shape.
 */
function extractUsage(event) {
  const raw = event?.response?.usage;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const toInt = (value) => {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    const normalized = Math.max(0, Math.floor(value));
    return Number.isInteger(normalized) ? normalized : undefined;
  };

  const inputTokens = toInt(raw.input_tokens ?? raw.prompt_tokens);
  const outputTokens = toInt(raw.output_tokens ?? raw.completion_tokens);
  const totalTokens = toInt(raw.total_tokens ?? (typeof inputTokens === 'number' && typeof outputTokens === 'number'
    ? inputTokens + outputTokens
    : undefined));

  if (
    typeof inputTokens !== 'number' &&
    typeof outputTokens !== 'number' &&
    typeof totalTokens !== 'number'
  ) {
    return undefined;
  }

  return {
    ...(typeof inputTokens === 'number' ? { inputTokens } : {}),
    ...(typeof outputTokens === 'number' ? { outputTokens } : {}),
    ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
  };
}

/**
 * Creates OpenAI realtime event handler with injected UI/storage dependencies.
 */
export function createEventRouter(deps) {
  const {
    setStatus,
    chatView,
    playback,
    setVoiceSelectDisabled,
    appendUserMessage,
    setPendingUserBubble,
    getPendingUserBubble,
    setCurrentAiBubble,
    getCurrentAiBubble,
    createInteractionId,
    setActiveInteractionId,
    getActiveInteractionId,
    setAssistantResponding,
    getAssistantResponding,
    finalizeCurrentAssistantBubble,
    requestResponseCancel,
  } = deps;

  /**
   * Handles one parsed realtime event and applies corresponding UI/state updates.
   */
  function handleEvent(event) {
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        setStatus(STATUS_TEXT.connected, STATUS_STATE.connected);
        break;

      case 'input_audio_buffer.speech_started': {
        setStatus(STATUS_TEXT.listening, STATUS_STATE.listening);
        if (getAssistantResponding()) {
          requestResponseCancel();
          finalizeCurrentAssistantBubble(true);
          setAssistantResponding(false);
        }
        const pending = chatView.addBubble('user pending', UI_TEXT.pendingTranscription);
        pending._interactionId = createInteractionId();
        setActiveInteractionId(pending._interactionId);
        setPendingUserBubble(pending);
        playback.reset();
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const transcriptText = (event.transcript || '').trim();
        const pendingUserBubble = getPendingUserBubble();

        if (pendingUserBubble) {
          if (transcriptText) {
            pendingUserBubble._content.textContent = transcriptText;
            pendingUserBubble.classList.remove('pending');
            appendUserMessage(transcriptText, 'voice', pendingUserBubble._interactionId);
            setActiveInteractionId(pendingUserBubble._interactionId);
          } else {
            pendingUserBubble.remove();
            setActiveInteractionId(null);
          }
          setPendingUserBubble(null);
        } else if (transcriptText) {
          const interactionId = createInteractionId();
          const bubble = chatView.addBubble('user', transcriptText);
          bubble._interactionId = interactionId;
          appendUserMessage(transcriptText, 'voice', interactionId);
          setActiveInteractionId(interactionId);
        }
        break;
      }

      case 'response.audio.delta':
        if (event.delta) {
          setVoiceSelectDisabled(true);
          setAssistantResponding(true);
          playback.playAudioChunk(event.delta);
        }
        break;

      case 'response.audio_transcript.delta': {
        if (!event.delta) {
          break;
        }
        setAssistantResponding(true);

        let currentAiBubble = getCurrentAiBubble();
        if (!currentAiBubble) {
          currentAiBubble = chatView.addBubble('assistant streaming', '');
          currentAiBubble._interactionId = getActiveInteractionId() || createInteractionId();
          setCurrentAiBubble(currentAiBubble);
        }

        currentAiBubble._content.textContent += event.delta;
        chatView.scrollToBottom();
        break;
      }

      case 'response.audio_transcript.done': {
        const currentAiBubble = getCurrentAiBubble();
        if (currentAiBubble) {
          currentAiBubble.classList.remove('streaming');
        }
        break;
      }

      case 'response.done':
        if (getCurrentAiBubble()) {
          getCurrentAiBubble()._usage = extractUsage(event);
          getCurrentAiBubble()._rawResponse = event;
        }
        finalizeCurrentAssistantBubble(false);
        setAssistantResponding(false);
        setStatus(STATUS_TEXT.connected, STATUS_STATE.connected);
        break;

      case 'error':
        console.error('OpenAI error:', event.error);
        finalizeCurrentAssistantBubble(true);
        setAssistantResponding(false);
        setStatus('Error: ' + (event.error?.message || 'unknown'), STATUS_STATE.error);
        break;
    }
  }

  return { handleEvent };
}
