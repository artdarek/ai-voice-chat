/**
 * Binds top-level UI events for chat controls and keyboard shortcuts.
 */
export function bindAppEvents(elements, handlers) {
  const {
    btnConnect,
    btnClearChat,
    btnDownloadChat,
    btnClearConfirm,
    btnClearCancel,
    clearConfirmClose,
    clearConfirmBackdrop,
    voiceSelect,
    modelSelectInline,
    btnSend,
    textInput,
    btnMute,
    systemPromptBackdrop,
  } = elements;
  const {
    onConnectToggle,
    onOpenClearConfirm,
    onDownloadChat,
    onClearConfirm,
    onCloseClearConfirm,
    onReconnectRequested,
    onModelChanged,
    onSendText,
    onToggleMute,
    onCloseResponseDetails,
    onCloseSystemPrompt,
    isResponseDetailsOpen,
  } = handlers;

  btnConnect.addEventListener('click', onConnectToggle);

  btnClearChat.addEventListener('click', onOpenClearConfirm);
  btnDownloadChat.addEventListener('click', onDownloadChat);

  btnClearConfirm.addEventListener('click', onClearConfirm);
  btnClearCancel.addEventListener('click', onCloseClearConfirm);
  clearConfirmClose.addEventListener('click', onCloseClearConfirm);

  clearConfirmBackdrop.addEventListener('click', (event) => {
    if (event.target === clearConfirmBackdrop) {
      onCloseClearConfirm();
    }
  });

  voiceSelect.addEventListener('change', onReconnectRequested);

  modelSelectInline?.addEventListener('change', (event) => {
    onModelChanged(event?.target?.value);
  });

  btnSend.addEventListener('click', onSendText);

  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSendText();
    }
  });

  textInput.addEventListener('input', () => {
    textInput.style.height = 'auto';
    textInput.style.height = `${textInput.scrollHeight}px`;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && clearConfirmBackdrop.style.display !== 'none') {
      onCloseClearConfirm();
    }
    if (event.key === 'Escape' && isResponseDetailsOpen()) {
      onCloseResponseDetails();
    }
    if (event.key === 'Escape' && systemPromptBackdrop.style.display !== 'none') {
      onCloseSystemPrompt();
    }
  });

  btnMute.addEventListener('click', onToggleMute);
}
