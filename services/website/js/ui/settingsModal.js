import { PROVIDERS, SETTINGS_MODAL_TEXT, STORAGE_KEYS } from '../constants.js';

const RUNTIME_SUPPORTED_PROVIDERS = ['openai', 'azure'];

/**
 * Creates settings modal helpers and binds modal interactions.
 */
export function createSettingsModal(elements, callbacks = {}) {
  const {
    btnSettings,
    modalBackdrop,
    providerSelect,
    externalProviderSelect,
    modalTitle,
    modalDesc,
    apiKeyInput,
    keyIndicator,
    providerHint,
    btnKeyRemove,
    btnEye,
    eyeShow,
    eyeHide,
    btnClose,
    btnCancel,
    btnSave,
  } = elements;

  const { onKeyRemoved, onProviderChanged } = callbacks;

  const serverSettings = {
    default_provider: 'openai',
    supported_realtime_providers: [...RUNTIME_SUPPORTED_PROVIDERS],
    providers: {
      openai: { server_key: false },
      azure: { server_key: false },
      gemini: { server_key: false },
    },
  };

  function normalizeProvider(provider) {
    const key = (provider || '').toLowerCase();
    if (PROVIDERS[key]) {
      return key;
    }
    return 'openai';
  }

  function getSelectedProvider() {
    const stored = localStorage.getItem(STORAGE_KEYS.llmProvider);
    return normalizeProvider(stored || providerSelect.value || serverSettings.default_provider);
  }

  function getSavedKey(provider = getSelectedProvider()) {
    const normalizedProvider = normalizeProvider(provider);
    const storageKey = PROVIDERS[normalizedProvider].keyStorageKey;
    return localStorage.getItem(storageKey) || '';
  }

  function setSelectedProvider(provider) {
    const normalizedProvider = normalizeProvider(provider);
    localStorage.setItem(STORAGE_KEYS.llmProvider, normalizedProvider);
    providerSelect.value = normalizedProvider;
    if (externalProviderSelect) {
      externalProviderSelect.value = normalizedProvider;
    }
  }

  function notifyProviderChanged(previousProvider) {
    const selectedProvider = getSelectedProvider();
    if (typeof onProviderChanged === 'function' && previousProvider !== selectedProvider) {
      onProviderChanged(selectedProvider);
    }
  }

  function changeProvider(provider) {
    const previousProvider = getSelectedProvider();
    setSelectedProvider(provider);
    syncProviderUi();
    updateKeyIndicator();
    notifyProviderChanged(previousProvider);
  }

  function isProviderSupported(provider = getSelectedProvider()) {
    return serverSettings.supported_realtime_providers.includes(normalizeProvider(provider));
  }

  function providerHasServerKey(provider = getSelectedProvider()) {
    const normalizedProvider = normalizeProvider(provider);
    return Boolean(serverSettings.providers[normalizedProvider]?.server_key);
  }

  function hasEffectiveKey(provider = getSelectedProvider()) {
    return Boolean(getSavedKey(provider) || providerHasServerKey(provider));
  }

  function updateKeyIndicator() {
    keyIndicator.className = 'key-indicator ' + (hasEffectiveKey() ? 'set' : 'missing');
  }

  function syncProviderUi() {
    const provider = getSelectedProvider();
    const providerConfig = PROVIDERS[provider];
    const savedKey = getSavedKey(provider);

    modalTitle.textContent = `${providerConfig.label} Settings`;
    apiKeyInput.placeholder = providerConfig.keyPlaceholder;
    apiKeyInput.value = savedKey;
    btnKeyRemove.style.display = savedKey ? 'inline-flex' : 'none';

    if (provider === 'gemini') {
      modalDesc.textContent = SETTINGS_MODAL_TEXT.geminiNotAvailable;
      providerHint.textContent = 'Runtime status: planned (not yet available for Connect).';
    } else if (providerHasServerKey(provider)) {
      modalDesc.textContent = SETTINGS_MODAL_TEXT.providerServerHasKey;
      providerHint.textContent = `Runtime status: supported (${providerConfig.label}).`;
    } else {
      modalDesc.textContent = SETTINGS_MODAL_TEXT.providerServerMissingKey;
      providerHint.textContent = `Runtime status: supported (${providerConfig.label}), user key required.`;
    }
  }

  function openModal() {
    syncProviderUi();
    modalBackdrop.style.display = 'flex';
    setTimeout(() => apiKeyInput.focus(), 50);
  }

  function closeModal() {
    modalBackdrop.style.display = 'none';
  }

  function persistCurrentProviderKey() {
    const provider = getSelectedProvider();
    const value = apiKeyInput.value.trim();
    const storageKey = PROVIDERS[provider].keyStorageKey;

    if (value) {
      localStorage.setItem(storageKey, value);
    } else {
      localStorage.removeItem(storageKey);
    }

    btnKeyRemove.style.display = value ? 'inline-flex' : 'none';
    updateKeyIndicator();
  }

  function setServerSettings(payload = {}) {
    serverSettings.default_provider = normalizeProvider(payload.default_provider || 'openai');
    serverSettings.supported_realtime_providers = Array.isArray(payload.supported_realtime_providers)
      ? payload.supported_realtime_providers.filter((p) => ['openai', 'azure', 'gemini'].includes((p || '').toLowerCase()))
      : [...RUNTIME_SUPPORTED_PROVIDERS];
    if (!serverSettings.supported_realtime_providers.length) {
      serverSettings.supported_realtime_providers = [...RUNTIME_SUPPORTED_PROVIDERS];
    }
    serverSettings.providers.openai.server_key = Boolean(payload.providers?.openai?.server_key);
    serverSettings.providers.azure.server_key = Boolean(payload.providers?.azure?.server_key);
    serverSettings.providers.gemini.server_key = Boolean(payload.providers?.gemini?.server_key);

    const current = getSelectedProvider();
    const nextProvider = serverSettings.supported_realtime_providers.includes(current)
      ? current
      : serverSettings.default_provider;
    setSelectedProvider(nextProvider);

    Array.from(providerSelect.options).forEach((option) => {
      if (option.value === 'gemini') {
        option.disabled = !serverSettings.supported_realtime_providers.includes('gemini');
      }
    });
    if (externalProviderSelect) {
      Array.from(externalProviderSelect.options).forEach((option) => {
        if (option.value === 'gemini') {
          option.disabled = !serverSettings.supported_realtime_providers.includes('gemini');
        }
      });
    }

    updateKeyIndicator();
    syncProviderUi();
  }

  function bind() {
    btnSettings.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    providerSelect.addEventListener('change', () => {
      persistCurrentProviderKey();
      changeProvider(providerSelect.value);
    });
    if (externalProviderSelect) {
      externalProviderSelect.addEventListener('change', () => {
        changeProvider(externalProviderSelect.value);
      });
    }

    btnSave.addEventListener('click', () => {
      persistCurrentProviderKey();
      closeModal();
    });

    btnKeyRemove.addEventListener('click', () => {
      const provider = getSelectedProvider();
      localStorage.removeItem(PROVIDERS[provider].keyStorageKey);
      apiKeyInput.value = '';
      btnKeyRemove.style.display = 'none';
      updateKeyIndicator();
      if (typeof onKeyRemoved === 'function') {
        onKeyRemoved(provider);
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
    getSelectedProvider,
    hasEffectiveKey,
    isProviderSupported,
    updateKeyIndicator,
    openModal,
    closeModal,
    setServerSettings,
    setSelectedProvider: changeProvider,
  };
}
