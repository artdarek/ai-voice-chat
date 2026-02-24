/**
 * Normalizes token usage payload (usage + rawResponse usage details) into one stable shape.
 */
export function getUsageBreakdown(usage, rawResponse) {
  const toInt = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined);
  const rawUsage = rawResponse?.response?.usage;
  const inputDetails = rawUsage?.input_token_details || rawUsage?.inputTokenDetails || {};
  const outputDetails = rawUsage?.output_token_details || rawUsage?.outputTokenDetails || {};
  const cachedDetails = inputDetails.cached_tokens_details || inputDetails.cachedTokenDetails || {};

  let inputTextTokens = toInt(inputDetails.text_tokens ?? inputDetails.textTokens) || 0;
  let inputAudioTokens = toInt(inputDetails.audio_tokens ?? inputDetails.audioTokens) || 0;
  let outputTextTokens = toInt(outputDetails.text_tokens ?? outputDetails.textTokens) || 0;
  let outputAudioTokens = toInt(outputDetails.audio_tokens ?? outputDetails.audioTokens) || 0;
  const inputAudioCachedTokens = toInt(cachedDetails.audio_tokens ?? cachedDetails.audioTokens) || 0;
  const inputTextCachedTokens = toInt(cachedDetails.text_tokens ?? cachedDetails.textTokens) || 0;

  const usageInput = toInt(usage?.inputTokens);
  const usageOutput = toInt(usage?.outputTokens);
  const usageTotal = toInt(usage?.totalTokens);
  const rawInput = toInt(rawUsage?.input_tokens ?? rawUsage?.prompt_tokens);
  const rawOutput = toInt(rawUsage?.output_tokens ?? rawUsage?.completion_tokens);
  const rawTotal = toInt(rawUsage?.total_tokens);

  let inputTokens = rawInput ?? usageInput;
  let outputTokens = rawOutput ?? usageOutput;
  let totalTokens = rawTotal ?? usageTotal;

  if (typeof inputTokens !== 'number' && typeof totalTokens === 'number' && typeof outputTokens === 'number') {
    inputTokens = Math.max(0, totalTokens - outputTokens);
  }
  if (typeof outputTokens !== 'number' && typeof totalTokens === 'number' && typeof inputTokens === 'number') {
    outputTokens = Math.max(0, totalTokens - inputTokens);
  }
  if (typeof totalTokens !== 'number' && typeof inputTokens === 'number' && typeof outputTokens === 'number') {
    totalTokens = inputTokens + outputTokens;
  }
  if (typeof inputTokens !== 'number') {
    inputTokens = inputTextTokens + inputAudioTokens;
  }
  if (typeof outputTokens !== 'number') {
    outputTokens = outputTextTokens + outputAudioTokens;
  }
  if (typeof totalTokens !== 'number') {
    totalTokens = inputTokens + outputTokens;
  }
  if (inputTextTokens === 0 && inputAudioTokens === 0 && inputTokens > 0) {
    inputTextTokens = inputTokens;
  }
  if (outputTextTokens === 0 && outputAudioTokens === 0 && outputTokens > 0) {
    outputTextTokens = outputTokens;
  }
  const normalizedAudioCached = Math.min(inputAudioCachedTokens, inputAudioTokens);
  const normalizedTextCached = Math.min(inputTextCachedTokens, inputTextTokens);

  return {
    inputTextTokens,
    inputAudioTokens,
    inputTextNonCachedTokens: Math.max(0, inputTextTokens - normalizedTextCached),
    inputAudioNonCachedTokens: Math.max(0, inputAudioTokens - normalizedAudioCached),
    inputTextCachedTokens: normalizedTextCached,
    inputAudioCachedTokens: normalizedAudioCached,
    outputTextTokens,
    outputAudioTokens,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

/**
 * Gets compact usage totals for UI display.
 */
export function getMessageUsageTotals(usage) {
  const breakdown = getUsageBreakdown(usage, undefined);
  return {
    inputTokens: breakdown.inputTokens,
    outputTokens: breakdown.outputTokens,
    totalTokens: breakdown.totalTokens,
  };
}

/**
 * Formats usage totals with fallback markers for incomplete payloads.
 */
export function getUsageDisplayValues(usage) {
  if (!usage || typeof usage !== 'object') {
    return { inputTokens: '-', outputTokens: '-', totalTokens: '-' };
  }

  const hasValue = (value) => Number.isInteger(value) && value >= 0;
  const totals = getMessageUsageTotals(usage);
  const hasInput = hasValue(usage.inputTokens) || (hasValue(usage.totalTokens) && hasValue(usage.outputTokens));
  const hasOutput = hasValue(usage.outputTokens) || (hasValue(usage.totalTokens) && hasValue(usage.inputTokens));
  const hasTotal = hasValue(usage.totalTokens) || (hasValue(usage.inputTokens) && hasValue(usage.outputTokens));

  return {
    inputTokens: hasInput ? String(totals.inputTokens) : '-',
    outputTokens: hasOutput ? String(totals.outputTokens) : '-',
    totalTokens: hasTotal ? String(totals.totalTokens) : '-',
  };
}

/**
 * Builds token usage rows used in response details modal.
 */
export function extractUsageTokenBreakdown(rawResponse) {
  const usage = rawResponse?.response?.usage;
  if (!usage || typeof usage !== 'object') {
    return {
      audioNonCachedIn: '-',
      audioNonCachedOut: '-',
      audioNonCachedTotal: '-',
      audioCachedIn: '-',
      audioCachedOut: '-',
      audioCachedTotal: '-',
      textNonCachedIn: '-',
      textNonCachedOut: '-',
      textNonCachedTotal: '-',
      textCachedIn: '-',
      textCachedOut: '-',
      textCachedTotal: '-',
    };
  }

  const toTokenInt = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined);
  const toTokenString = (value) => (typeof value === 'number' ? String(value) : '-');
  const getTotalString = (input, output) => (
    typeof input === 'number' && typeof output === 'number' ? String(input + output) : '-'
  );

  const inputDetails = usage.input_token_details || usage.inputTokenDetails || {};
  const outputDetails = usage.output_token_details || usage.outputTokenDetails || {};
  const audioIn = toTokenInt(inputDetails.audio_tokens ?? inputDetails.audioTokens);
  const textIn = toTokenInt(inputDetails.text_tokens ?? inputDetails.textTokens);
  const audioOut = toTokenInt(outputDetails.audio_tokens ?? outputDetails.audioTokens);
  const textOut = toTokenInt(outputDetails.text_tokens ?? outputDetails.textTokens);
  const cachedDetails = inputDetails.cached_tokens_details || inputDetails.cachedTokenDetails || {};
  const audioCachedIn = toTokenInt(
    cachedDetails.audio_tokens ??
    cachedDetails.audioTokens ??
    inputDetails.audio_cached_tokens ??
    inputDetails.audioCachedTokens ??
    inputDetails.cached_audio_tokens ??
    inputDetails.cachedAudioTokens
  ) || 0;
  const textCachedIn = toTokenInt(
    cachedDetails.text_tokens ??
    cachedDetails.textTokens ??
    inputDetails.text_cached_tokens ??
    inputDetails.textCachedTokens ??
    inputDetails.cached_text_tokens ??
    inputDetails.cachedTextTokens
  ) || 0;
  const audioNonCachedIn = typeof audioIn === 'number' ? Math.max(0, audioIn - audioCachedIn) : undefined;
  const textNonCachedIn = typeof textIn === 'number' ? Math.max(0, textIn - textCachedIn) : undefined;

  return {
    audioNonCachedIn: toTokenString(audioNonCachedIn),
    audioNonCachedOut: toTokenString(audioOut),
    audioNonCachedTotal: getTotalString(audioNonCachedIn, audioOut),
    audioCachedIn: toTokenString(audioCachedIn),
    audioCachedOut: '-',
    audioCachedTotal: toTokenString(audioCachedIn),
    textNonCachedIn: toTokenString(textNonCachedIn),
    textNonCachedOut: toTokenString(textOut),
    textNonCachedTotal: getTotalString(textNonCachedIn, textOut),
    textCachedIn: toTokenString(textCachedIn),
    textCachedOut: '-',
    textCachedTotal: toTokenString(textCachedIn),
  };
}

function toRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

/**
 * Returns resolved model pricing (USD / 1M tokens) for provider/model.
 */
export function getModelPricing(providerCatalog, provider, model) {
  const pricing = providerCatalog?.providers?.[provider]?.pricing || {};
  const modelPricing = model ? pricing[model] : undefined;
  if (!modelPricing || typeof modelPricing !== 'object') {
    return null;
  }

  return {
    inputTextPer1m: toRate(modelPricing?.input?.text),
    inputAudioPer1m: toRate(modelPricing?.input?.audio),
    cachedInputTextPer1m: toRate(modelPricing?.cached_input?.text),
    cachedInputAudioPer1m: toRate(modelPricing?.cached_input?.audio),
    outputTextPer1m: toRate(modelPricing?.output?.text),
    outputAudioPer1m: toRate(modelPricing?.output?.audio),
  };
}

/**
 * Estimates detailed costs for one usage breakdown.
 */
export function estimateCostFromUsageBreakdown(usageBreakdown, providerCatalog, provider, model) {
  const pricing = getModelPricing(providerCatalog, provider, model);
  if (!pricing) {
    return null;
  }

  const inputTextNonCachedCost = (usageBreakdown.inputTextNonCachedTokens / 1_000_000) * pricing.inputTextPer1m;
  const inputAudioNonCachedCost = (usageBreakdown.inputAudioNonCachedTokens / 1_000_000) * pricing.inputAudioPer1m;
  const inputTextCachedCost = (usageBreakdown.inputTextCachedTokens / 1_000_000) * pricing.cachedInputTextPer1m;
  const inputAudioCachedCost = (usageBreakdown.inputAudioCachedTokens / 1_000_000) * pricing.cachedInputAudioPer1m;
  const outputTextCost = (usageBreakdown.outputTextTokens / 1_000_000) * pricing.outputTextPer1m;
  const outputAudioCost = (usageBreakdown.outputAudioTokens / 1_000_000) * pricing.outputAudioPer1m;

  const inputCost = inputTextNonCachedCost + inputAudioNonCachedCost;
  const cachedInputCost = inputTextCachedCost + inputAudioCachedCost;
  const outputCost = outputTextCost + outputAudioCost;
  const totalCost = inputCost + cachedInputCost + outputCost;

  return {
    inputTextNonCachedCost,
    inputAudioNonCachedCost,
    inputTextCachedCost,
    inputAudioCachedCost,
    outputTextCost,
    outputAudioCost,
    inputCost,
    cachedInputCost,
    outputCost,
    totalCost,
  };
}

/**
 * Formats USD values for UI.
 */
export function formatUsd(value, decimals = 6) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return `$${value.toFixed(decimals)}`;
}
