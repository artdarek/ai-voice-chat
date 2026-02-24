/**
 * Controls connection-related UI elements (status, connect button, mute state, input enabled state).
 */
export function createConnectionPanel(elements, labels) {
  const {
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
  } = elements;
  const {
    connectButtonLabel,
    disconnectButtonLabel,
    muteButtonLabel,
    unmuteButtonLabel,
    inputPlaceholderConnected,
    inputPlaceholderDisconnected,
  } = labels;

  function setStatus(text, state) {
    statusText.textContent = text;
    statusDot.className = `status-dot ${state || ''}`;
  }

  function setMutedUi(isMuted, mutedStatus, connectedStatus, mutedState, connectedState) {
    iconMic.style.display = isMuted ? 'none' : '';
    iconMicOff.style.display = isMuted ? '' : 'none';
    btnMuteLabel.textContent = isMuted ? unmuteButtonLabel : muteButtonLabel;
    btnMute.classList.toggle('active', isMuted);
    setStatus(isMuted ? mutedStatus : connectedStatus, isMuted ? mutedState : connectedState);
  }

  function resetMuteUi() {
    iconMic.style.display = '';
    iconMicOff.style.display = 'none';
    btnMuteLabel.textContent = muteButtonLabel;
    btnMute.classList.remove('active');
  }

  function setConnected() {
    btnConnect.innerHTML = `<i class="bi bi-x-circle"></i>`;
    btnConnect.classList.add('disconnect');
    btnConnect.disabled = false;
    btnMute.style.display = 'inline-flex';
    providerSelectInline.disabled = false;
    if (modelSelectInline) {
      modelSelectInline.disabled = !modelSelectInline.options.length;
    }
    voiceSelect.disabled = false;
    textInput.disabled = false;
    textInput.placeholder = inputPlaceholderConnected;
    btnSend.disabled = false;
    textInput.focus();
  }

  function setDisconnected() {
    btnConnect.innerHTML = `<i class="bi bi-plus-circle"></i> ${connectButtonLabel}`;
    btnConnect.classList.remove('disconnect');
    btnConnect.disabled = false;
    btnMute.style.display = 'none';
    providerSelectInline.disabled = false;
    if (modelSelectInline) {
      modelSelectInline.disabled = !modelSelectInline.options.length;
    }
    voiceSelect.disabled = false;
    textInput.disabled = true;
    textInput.placeholder = inputPlaceholderDisconnected;
    btnSend.disabled = true;
  }

  return {
    setStatus,
    setMutedUi,
    resetMuteUi,
    setConnected,
    setDisconnected,
  };
}
