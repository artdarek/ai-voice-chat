import { estimateCostFromUsageBreakdown, getUsageBreakdown } from '../usage/costCalculator.js';

/**
 * Escapes one CSV field using RFC4180-style quoting.
 */
function escapeCsvField(value) {
  const raw = String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * Triggers browser download of chat history as CSV.
 */
export function downloadChatHistoryCsv(history, providerCatalog = { providers: {} }) {
  if (!Array.isArray(history) || !history.length) {
    return;
  }

  const header = [
    'id',
    'interactionId',
    'createdAt',
    'provider',
    'model',
    'voice',
    'role',
    'inputType',
    'interrupted',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'audioInputTokens',
    'audioInputNonCachedTokens',
    'audioInputCachedTokens',
    'audioOutputTokens',
    'audioTotalTokens',
    'textInputTokens',
    'textInputNonCachedTokens',
    'textInputCachedTokens',
    'textOutputTokens',
    'textTotalTokens',
    'text',
    'totalCostUsd',
  ]
    .map(escapeCsvField)
    .join(',');

  const estimateRowCost = (item, usageBreakdown) => {
    if (String(item?.role || '').toLowerCase() === 'user') {
      return '';
    }

    const cost = estimateCostFromUsageBreakdown(
      usageBreakdown,
      providerCatalog,
      String(item?.provider || '').toLowerCase(),
      String(item?.model || '').toLowerCase()
    );
    if (!cost) {
      return '';
    }
    return Number.isFinite(cost.totalCost) ? cost.totalCost.toFixed(8) : '';
  };
  const toCsvToken = (value) => (typeof value === 'number' ? value : '');

  const rows = history.map((item) =>
    (() => {
      const breakdown = getUsageBreakdown(item?.usage, item?.rawResponse);
      const totalCost = estimateRowCost(item, breakdown);
      return [
      item.id || '',
      item.interactionId || '',
      item.createdAt || '',
      item.provider || 'unknown',
      item.model || 'unknown',
      item.voice || 'unknown',
      item.role || '',
      item.inputType || 'n/a',
      String(Boolean(item.interrupted)),
      item.usage?.inputTokens ?? '',
      item.usage?.outputTokens ?? '',
      item.usage?.totalTokens ?? '',
      toCsvToken(breakdown.inputAudioTokens),
      toCsvToken(breakdown.inputAudioNonCachedTokens),
      toCsvToken(breakdown.inputAudioCachedTokens),
      toCsvToken(breakdown.outputAudioTokens),
      (typeof breakdown.inputAudioTokens === 'number' || typeof breakdown.outputAudioTokens === 'number')
        ? breakdown.inputAudioTokens + breakdown.outputAudioTokens
        : '',
      toCsvToken(breakdown.inputTextTokens),
      toCsvToken(breakdown.inputTextNonCachedTokens),
      toCsvToken(breakdown.inputTextCachedTokens),
      toCsvToken(breakdown.outputTextTokens),
      (typeof breakdown.inputTextTokens === 'number' || typeof breakdown.outputTextTokens === 'number')
        ? breakdown.inputTextTokens + breakdown.outputTextTokens
        : '',
      item.text || '',
      totalCost,
    ];
    })()
      .map(escapeCsvField)
      .join(',')
  );

  const csv = [header, ...rows].join('\n');

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const filename = `chat-history-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
