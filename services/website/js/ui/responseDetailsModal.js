import {
  extractUsageTokenBreakdown,
  getUsageDisplayValues,
} from '../usage/costCalculator.js';

/**
 * Creates response-details modal controller.
 */
export function createResponseDetailsModal(elements, deps) {
  const {
    transcript,
    backdrop,
    closeButton,
    tabGeneral,
    usageIn,
    usageOut,
    usageTotal,
    date,
    provider,
    model,
    userMessage,
    assistantMessage,
    raw,
    audioNcIn,
    audioNcOut,
    audioNcTotal,
    audioCachedIn,
    audioCachedOut,
    audioCachedTotal,
    textNcIn,
    textNcOut,
    textNcTotal,
    textCachedIn,
    textCachedOut,
    textCachedTotal,
    costTotalIn,
    costTotalOut,
    costTotalAll,
    costAudioNcIn,
    costAudioNcOut,
    costAudioNcTotal,
    costAudioCachedIn,
    costAudioCachedOut,
    costAudioCachedTotal,
    costTextNcIn,
    costTextNcOut,
    costTextNcTotal,
    costTextCachedIn,
    costTextCachedOut,
    costTextCachedTotal,
  } = elements;

  const {
    getHistory,
    getUsageBreakdown,
    estimateCostFromUsageBreakdown,
    formatUsd,
  } = deps;

  function isOpen() {
    return backdrop?.style.display !== 'none';
  }

  function close() {
    if (backdrop) {
      backdrop.style.display = 'none';
    }
  }

  function activateGeneralTab() {
    if (!tabGeneral) {
      return;
    }

    const bootstrapApi = window.bootstrap;
    if (bootstrapApi?.Tab) {
      bootstrapApi.Tab.getOrCreateInstance(tabGeneral).show();
      return;
    }

    tabGeneral.click();
  }

  function findPreviousUserMessageText(messageNode) {
    let cursor = messageNode?.previousElementSibling || null;
    while (cursor) {
      if (cursor.classList?.contains('message') && cursor.classList?.contains('user')) {
        const content = cursor.querySelector('.message-content-text') || cursor.querySelector('.message-content');
        return (content?.textContent || '').trim() || '-';
      }
      cursor = cursor.previousElementSibling;
    }
    return '-';
  }

  function findModalContextFromHistory(historyId) {
    if (!historyId) {
      return null;
    }

    const history = getHistory();
    const assistantIndex = history.findIndex((item) => item.id === historyId && item.role === 'assistant');
    if (assistantIndex < 0) {
      return null;
    }

    const assistant = history[assistantIndex];
    let userText = '-';
    if (assistant.interactionId) {
      const pairedUser = history.find((item) => item.role === 'user' && item.interactionId === assistant.interactionId);
      if (pairedUser?.text) {
        userText = pairedUser.text.trim() || '-';
      }
    }

    if (userText === '-') {
      for (let i = assistantIndex - 1; i >= 0; i -= 1) {
        if (history[i]?.role === 'user') {
          userText = (history[i].text || '').trim() || '-';
          break;
        }
      }
    }

    return { assistant, userText };
  }

  function openFromMessageNode(messageNode) {
    if (!messageNode) {
      return;
    }

    const historyContext = findModalContextFromHistory(messageNode._historyId);
    const sourceEntry = historyContext?.assistant;
    const sourceUsage = sourceEntry?.usage ?? messageNode._usage;
    const sourceRawResponse = sourceEntry?.rawResponse ?? messageNode._rawResponse;
    const sourceProvider = sourceEntry?.provider ?? messageNode._provider;
    const sourceModel = sourceEntry?.model ?? messageNode._model;
    const sourceUserText = historyContext?.userText ?? findPreviousUserMessageText(messageNode);
    const sourceAssistantText = (sourceEntry?.text || '').trim() || '-';
    const createdAtIso = sourceEntry?.createdAt ?? messageNode._createdAt;
    const createdAt = createdAtIso ? new Date(createdAtIso) : new Date();
    const hasValidDate = !Number.isNaN(createdAt.getTime());
    const usageDisplay = getUsageDisplayValues(sourceUsage);

    date.textContent = hasValidDate ? createdAt.toLocaleString() : '-';
    provider.textContent = sourceProvider || '-';
    model.textContent = sourceModel || '-';
    usageIn.textContent = usageDisplay.inputTokens;
    usageOut.textContent = usageDisplay.outputTokens;
    usageTotal.textContent = usageDisplay.totalTokens;
    userMessage.value = sourceUserText;
    if (assistantMessage) {
      assistantMessage.value = sourceAssistantText;
    }
    raw.textContent = sourceRawResponse
      ? JSON.stringify(sourceRawResponse, null, 2)
      : '-';

    const usageDetails = extractUsageTokenBreakdown(sourceRawResponse);
    audioNcIn.textContent = usageDetails.audioNonCachedIn;
    audioNcOut.textContent = usageDetails.audioNonCachedOut;
    audioNcTotal.textContent = usageDetails.audioNonCachedTotal;
    audioCachedIn.textContent = usageDetails.audioCachedIn;
    audioCachedOut.textContent = usageDetails.audioCachedOut;
    audioCachedTotal.textContent = usageDetails.audioCachedTotal;
    textNcIn.textContent = usageDetails.textNonCachedIn;
    textNcOut.textContent = usageDetails.textNonCachedOut;
    textNcTotal.textContent = usageDetails.textNonCachedTotal;
    textCachedIn.textContent = usageDetails.textCachedIn;
    textCachedOut.textContent = usageDetails.textCachedOut;
    textCachedTotal.textContent = usageDetails.textCachedTotal;

    const usageCost = estimateCostFromUsageBreakdown(
      getUsageBreakdown(sourceUsage, sourceRawResponse),
      sourceProvider,
      sourceModel
    );
    costTotalIn.textContent = usageCost ? formatUsd(usageCost.inputCost + usageCost.cachedInputCost) : '-';
    costTotalOut.textContent = usageCost ? formatUsd(usageCost.outputCost) : '-';
    costTotalAll.textContent = usageCost ? formatUsd(usageCost.totalCost) : '-';

    const audioNonCachedIn = usageCost ? usageCost.inputAudioNonCachedCost : undefined;
    const audioNonCachedOut = usageCost ? usageCost.outputAudioCost : undefined;
    costAudioNcIn.textContent = usageCost ? formatUsd(audioNonCachedIn) : '-';
    costAudioNcOut.textContent = usageCost ? formatUsd(audioNonCachedOut) : '-';
    costAudioNcTotal.textContent = usageCost ? formatUsd(audioNonCachedIn + audioNonCachedOut) : '-';

    const audioCachedInCost = usageCost ? usageCost.inputAudioCachedCost : undefined;
    const audioCachedOutCost = 0;
    costAudioCachedIn.textContent = usageCost ? formatUsd(audioCachedInCost) : '-';
    costAudioCachedOut.textContent = '-';
    costAudioCachedTotal.textContent = usageCost ? formatUsd(audioCachedInCost + audioCachedOutCost) : '-';

    const textNcInCost = usageCost ? usageCost.inputTextNonCachedCost : undefined;
    const textNcOutCost = usageCost ? usageCost.outputTextCost : undefined;
    costTextNcIn.textContent = usageCost ? formatUsd(textNcInCost) : '-';
    costTextNcOut.textContent = usageCost ? formatUsd(textNcOutCost) : '-';
    costTextNcTotal.textContent = usageCost ? formatUsd(textNcInCost + textNcOutCost) : '-';

    const textCachedInCost = usageCost ? usageCost.inputTextCachedCost : undefined;
    const textCachedOutCost = 0;
    costTextCachedIn.textContent = usageCost ? formatUsd(textCachedInCost) : '-';
    costTextCachedOut.textContent = '-';
    costTextCachedTotal.textContent = usageCost ? formatUsd(textCachedInCost + textCachedOutCost) : '-';

    activateGeneralTab();
    backdrop.style.display = 'flex';
  }

  function bind() {
    closeButton?.addEventListener('click', close);
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        close();
      }
    });

    transcript?.addEventListener('click', (e) => {
      const infoButton = e.target.closest('.message-info-btn');
      if (!infoButton) {
        return;
      }
      const messageNode = infoButton.closest('.message');
      openFromMessageNode(messageNode);
    });
  }

  return {
    bind,
    close,
    isOpen,
    openFromMessageNode,
  };
}
