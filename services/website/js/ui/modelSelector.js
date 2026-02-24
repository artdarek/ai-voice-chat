import { PROVIDERS, STORAGE_KEYS } from '../constants.js';

const FALLBACK_PROVIDER_CATALOG = {
  providers: {
    openai: {
      label: 'OpenAI',
      models: [
        { id: 'gpt-realtime-mini-2025-12-15', label: 'gpt-realtime-mini-2025-12-15' },
      ],
      pricing: {},
    },
    azure: {
      label: 'Azure OpenAI',
      deployments: [
        { name: 'gpt-realtime-mini', model: 'gpt-realtime-mini', label: 'gpt-realtime-mini' },
      ],
      pricing: {},
    },
  },
};

/**
 * Controls provider/model selectors and per-provider model selection persistence.
 */
export function createModelSelector(elements, callbacks = {}) {
  const {
    providerSelectModal,
    providerSelectInline,
    modelSelectInline,
  } = elements;

  const { getCurrentProvider } = callbacks;

  let providerCatalog = FALLBACK_PROVIDER_CATALOG;

  function getProviderCatalog() {
    return providerCatalog;
  }

  function setProviderCatalog(catalog) {
    providerCatalog = catalog?.providers ? catalog : FALLBACK_PROVIDER_CATALOG;
  }

  function getProviderRuntimeConfig(provider) {
    return providerCatalog?.providers?.[provider] || FALLBACK_PROVIDER_CATALOG.providers[provider] || {};
  }

  function getStoredRealtimeSelections() {
    let parsed;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.realtimeModelSelections) || '{}');
    } catch {
      parsed = {};
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  function saveRealtimeSelection(provider, value) {
    if (!provider || !value) {
      return;
    }
    const next = { ...getStoredRealtimeSelections(), [provider]: value };
    localStorage.setItem(STORAGE_KEYS.realtimeModelSelections, JSON.stringify(next));
  }

  function renderProviderOptions(supportedProviders = []) {
    const catalogProviders = providerCatalog?.providers && typeof providerCatalog.providers === 'object'
      ? providerCatalog.providers
      : {};
    const entries = Object.entries(catalogProviders)
      .map(([id, cfg]) => ({
        id: String(id || '').trim().toLowerCase(),
        label: String(cfg?.label || id || '').trim(),
      }))
      .filter((item) => item.id && item.label && PROVIDERS[item.id]);

    const fallbackEntries = [
      { id: 'openai', label: 'OpenAI' },
      { id: 'azure', label: 'Azure OpenAI' },
    ].filter((item) => PROVIDERS[item.id]);

    const available = entries.length ? entries : fallbackEntries;
    if (!available.length) {
      return;
    }

    const normalizedSupported = Array.isArray(supportedProviders)
      ? supportedProviders.map((p) => String(p || '').toLowerCase())
      : [];

    const currentProvider = typeof getCurrentProvider === 'function'
      ? String(getCurrentProvider() || '').toLowerCase()
      : '';
    const selected = available.some((item) => item.id === currentProvider)
      ? currentProvider
      : available[0].id;

    const render = (selectEl) => {
      if (!selectEl) {
        return;
      }
      selectEl.innerHTML = available
        .map((item) => `<option value="${item.id}">${item.label}</option>`)
        .join('');
      if (normalizedSupported.length) {
        Array.from(selectEl.options).forEach((opt) => {
          opt.disabled = !normalizedSupported.includes(opt.value);
        });
      }
      selectEl.value = selected;
    };

    render(providerSelectInline);
    render(providerSelectModal);
  }

  function renderModelOptions(provider) {
    if (!modelSelectInline) {
      return;
    }

    const normalizedProvider = (provider || 'openai').toLowerCase();
    const runtimeConfig = getProviderRuntimeConfig(normalizedProvider);
    const options = normalizedProvider === 'azure'
      ? (runtimeConfig.deployments || []).map((item) => ({
        value: String(item?.name || '').trim(),
        label: String(item?.label || item?.name || '').trim(),
        enabled: item?.enabled !== false,
      }))
      : (runtimeConfig.models || []).map((item) => ({
        value: String(item?.id || '').trim(),
        label: String(item?.label || item?.id || '').trim(),
        enabled: item?.enabled !== false,
      }));

    const validOptions = options.filter((item) => item.value && item.label && item.enabled);
    modelSelectInline.innerHTML = validOptions
      .map((item) => `<option value="${item.value}">${item.label}</option>`)
      .join('');

    if (!validOptions.length) {
      modelSelectInline.innerHTML = '<option value="">No models available</option>';
      modelSelectInline.disabled = true;
      return;
    }

    const saved = getStoredRealtimeSelections()[normalizedProvider];
    const fallback = validOptions[0].value;
    const selected = validOptions.some((item) => item.value === saved) ? saved : fallback;
    modelSelectInline.disabled = false;
    modelSelectInline.value = selected;
    saveRealtimeSelection(normalizedProvider, selected);
  }

  function getSelectedRealtimeTarget(provider) {
    const normalizedProvider = (provider || 'openai').toLowerCase();
    const selectedValue = (modelSelectInline?.value || '').trim();
    const runtimeConfig = getProviderRuntimeConfig(normalizedProvider);

    if (normalizedProvider === 'azure') {
      const deployment = (runtimeConfig.deployments || []).find((item) => item.name === selectedValue);
      const deploymentName = deployment?.name || selectedValue || '';
      const resolvedModel = deployment?.model || deploymentName || 'unknown';
      return {
        provider: 'azure',
        model: undefined,
        deployment: deploymentName || undefined,
        resolvedModel,
      };
    }

    const model = (runtimeConfig.models || []).find((item) => item.id === selectedValue);
    const modelId = model?.id || selectedValue || '';
    return {
      provider: 'openai',
      model: modelId || undefined,
      deployment: undefined,
      resolvedModel: modelId || 'unknown',
    };
  }

  return {
    getProviderCatalog,
    setProviderCatalog,
    saveRealtimeSelection,
    renderProviderOptions,
    renderModelOptions,
    getSelectedRealtimeTarget,
  };
}
