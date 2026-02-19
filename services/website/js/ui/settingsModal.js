import { STORAGE_KEYS } from '../constants.js';

/**
 * Creates API key modal helpers and binds modal interactions.
 */
export function createSettingsModal(elements, callbacks = {}) {
  const {
    btnSettings,
    modalBackdrop,
    apiKeyInput,
    keyIndicator,
    btnKeyRemove,
    btnEye,
    eyeShow,
    eyeHide,
    btnClose,
    btnCancel,
    btnSave,
  } = elements;

  const { onKeyRemoved } = callbacks;

  /**
   * Reads saved API key from localStorage.
   */
  function getSavedKey() {
    return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
  }

  /**
   * Updates key indicator state in the header.
   */
  function updateKeyIndicator() {
    keyIndicator.className = 'key-indicator ' + (getSavedKey() ? 'set' : 'missing');
  }

  /**
   * Opens modal and syncs form state with stored key.
   */
  function openModal() {
    const saved = getSavedKey();
    apiKeyInput.value = saved;
    btnKeyRemove.style.display = saved ? 'inline-flex' : 'none';
    modalBackdrop.style.display = 'flex';
    setTimeout(() => apiKeyInput.focus(), 50);
  }

  /**
   * Closes the API key modal.
   */
  function closeModal() {
    modalBackdrop.style.display = 'none';
  }

  /**
   * Attaches all modal-related DOM event listeners.
   */
  function bind() {
    btnSettings.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    btnSave.addEventListener('click', () => {
      const val = apiKeyInput.value.trim();
      if (!val) {
        return;
      }
      localStorage.setItem(STORAGE_KEYS.apiKey, val);
      updateKeyIndicator();
      closeModal();
    });

    btnKeyRemove.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEYS.apiKey);
      apiKeyInput.value = '';
      btnKeyRemove.style.display = 'none';
      updateKeyIndicator();
      if (typeof onKeyRemoved === 'function') {
        onKeyRemoved();
      }
      closeModal();
    });

    btnEye.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      eyeShow.style.display = isPassword ? 'none' : '';
      eyeHide.style.display = isPassword ? '' : 'none';
    });

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop.style.display !== 'none') {
        closeModal();
      }
    });

    apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        btnSave.click();
      }
    });
  }

  return {
    bind,
    getSavedKey,
    updateKeyIndicator,
    openModal,
    closeModal,
  };
}
