/**
 * Handles rendering of conversation usage summary and per-message usage metadata.
 */
export function createUsagePresenter(elements, deps) {
  const { usageSummaryText, usageSummaryInteractions } = elements;
  const {
    getHistory,
    getProviderCatalog,
    getUsageBreakdown,
    estimateCostFromUsageBreakdown,
    formatUsd,
  } = deps;

  function formatMessageUsageMarkup(usage, rawResponse, provider, model) {
    if ((!usage || typeof usage !== 'object') && (!rawResponse || typeof rawResponse !== 'object')) {
      return '';
    }

    const totals = getUsageBreakdown(usage, rawResponse);
    const usageCost = estimateCostFromUsageBreakdown(
      totals,
      getProviderCatalog(),
      provider,
      model
    );
    return [
      `<i class="bi bi-bar-chart-line message-usage-icon" aria-hidden="true"></i><span>Usage:</span>`,
      `<i class="bi bi-volume-up-fill message-usage-icon" aria-hidden="true"></i><span>in: ${totals.inputAudioNonCachedTokens}/${totals.inputAudioCachedTokens} out: ${totals.outputAudioTokens}</span>`,
      `<span>·</span>`,
      `<i class="bi bi-chat-text-fill message-usage-icon" aria-hidden="true"></i><span>in: ${totals.inputTextNonCachedTokens}/${totals.inputTextCachedTokens} out: ${totals.outputTextTokens}</span>`,
      usageCost ? `<span>·</span><i class="bi bi-cash-coin message-usage-icon" aria-hidden="true"></i><span>${formatUsd(usageCost.totalCost)}</span>` : '',
    ].join(' ');
  }

  function attachUsageToBubble(bubble, usage, rawResponse, provider, model) {
    const usageMarkup = formatMessageUsageMarkup(usage, rawResponse, provider, model);
    if (!usageMarkup || !bubble?._time) {
      return;
    }

    const existingUsage = bubble._time.querySelector('.message-usage');
    if (existingUsage) {
      existingUsage.innerHTML = usageMarkup;
      return;
    }

    const usageMeta = document.createElement('span');
    usageMeta.className = 'message-usage';
    usageMeta.innerHTML = usageMarkup;
    const infoButton = bubble._time.querySelector('.message-info-btn');
    if (infoButton) {
      bubble._time.insertBefore(usageMeta, infoButton);
    } else {
      bubble._time.appendChild(usageMeta);
    }
  }

  function updateSummary() {
    if (!usageSummaryText) {
      return;
    }

    const history = getHistory();
    const totals = history.reduce(
      (acc, item) => {
        const usage = getUsageBreakdown(item?.usage, item?.rawResponse);
        const usageCost = estimateCostFromUsageBreakdown(
          usage,
          getProviderCatalog(),
          item?.provider,
          item?.model
        );
        acc.inputTextNonCachedTokens += usage.inputTextNonCachedTokens;
        acc.inputAudioNonCachedTokens += usage.inputAudioNonCachedTokens;
        acc.inputTextCachedTokens += usage.inputTextCachedTokens;
        acc.inputAudioCachedTokens += usage.inputAudioCachedTokens;
        acc.outputTextTokens += usage.outputTextTokens;
        acc.outputAudioTokens += usage.outputAudioTokens;
        acc.totalCost += usageCost?.totalCost || 0;
        return acc;
      },
      {
        inputTextNonCachedTokens: 0,
        inputAudioNonCachedTokens: 0,
        inputTextCachedTokens: 0,
        inputAudioCachedTokens: 0,
        outputTextTokens: 0,
        outputAudioTokens: 0,
        totalCost: 0,
      }
    );

    usageSummaryText.innerHTML = [
      `<i class="bi bi-bar-chart-line usage-summary-icon" aria-hidden="true"></i><span>Usage:</span>`,
      `<i class="bi bi-volume-up-fill usage-summary-icon" aria-hidden="true"></i><span>in: ${totals.inputAudioNonCachedTokens}/${totals.inputAudioCachedTokens} out: ${totals.outputAudioTokens}</span>`,
      `<span>·</span>`,
      `<i class="bi bi-chat-text-fill usage-summary-icon" aria-hidden="true"></i><span>in: ${totals.inputTextNonCachedTokens}/${totals.inputTextCachedTokens} out: ${totals.outputTextTokens}</span>`,
      `<span>·</span>`,
      `<i class="bi bi-cash-coin usage-summary-icon" aria-hidden="true"></i><span>${formatUsd(totals.totalCost)}</span>`,
    ].join(' ');

    if (usageSummaryInteractions) {
      const interactions = history.reduce(
        (acc, item) => acc + (item?.role === 'assistant' ? 1 : 0),
        0
      );
      usageSummaryInteractions.textContent = String(interactions);
    }
  }

  return {
    attachUsageToBubble,
    updateSummary,
  };
}
