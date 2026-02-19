import { STATUS_STATE, STATUS_TEXT, UI_TEXT } from '../constants.js';

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
            appendUserMessage(transcriptText);
          } else {
            pendingUserBubble.remove();
          }
          setPendingUserBubble(null);
        } else if (transcriptText) {
          chatView.addBubble('user', transcriptText);
          appendUserMessage(transcriptText);
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
          setCurrentAiBubble(currentAiBubble);
        }

        currentAiBubble._content.textContent += event.delta;
        chatView.scrollToBottom();
        break;
      }

      case 'response.audio_transcript.done': {
        finalizeCurrentAssistantBubble(false);
        break;
      }

      case 'response.done':
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
