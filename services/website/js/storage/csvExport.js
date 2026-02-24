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
export function downloadChatHistoryCsv(history) {
  if (!Array.isArray(history) || !history.length) {
    return;
  }

  const header = [
    'id',
    'createdAt',
    'provider',
    'role',
    'inputType',
    'interrupted',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'audioInputTokens',
    'audioOutputTokens',
    'audioTotalTokens',
    'textInputTokens',
    'textOutputTokens',
    'textTotalTokens',
    'text',
  ]
    .map(escapeCsvField)
    .join(',');

  const toTokenInt = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined);
  const extractTokenBreakdown = (item) => {
    const usage = item?.rawResponse?.response?.usage;
    if (!usage || typeof usage !== 'object') {
      return {
        audioIn: '',
        audioOut: '',
        audioTotal: '',
        textIn: '',
        textOut: '',
        textTotal: '',
      };
    }

    const inputDetails = usage.input_token_details || usage.inputTokenDetails || {};
    const outputDetails = usage.output_token_details || usage.outputTokenDetails || {};
    const audioIn = toTokenInt(inputDetails.audio_tokens ?? inputDetails.audioTokens);
    const audioOut = toTokenInt(outputDetails.audio_tokens ?? outputDetails.audioTokens);
    const textIn = toTokenInt(inputDetails.text_tokens ?? inputDetails.textTokens);
    const textOut = toTokenInt(outputDetails.text_tokens ?? outputDetails.textTokens);

    return {
      audioIn: typeof audioIn === 'number' ? audioIn : '',
      audioOut: typeof audioOut === 'number' ? audioOut : '',
      audioTotal: typeof audioIn === 'number' && typeof audioOut === 'number' ? audioIn + audioOut : '',
      textIn: typeof textIn === 'number' ? textIn : '',
      textOut: typeof textOut === 'number' ? textOut : '',
      textTotal: typeof textIn === 'number' && typeof textOut === 'number' ? textIn + textOut : '',
    };
  };

  const rows = history.map((item) =>
    (() => {
      const breakdown = extractTokenBreakdown(item);
      return [
      item.id || '',
      item.createdAt || '',
      item.provider || 'unknown',
      item.role || '',
      item.inputType || 'n/a',
      String(Boolean(item.interrupted)),
      item.usage?.inputTokens ?? '',
      item.usage?.outputTokens ?? '',
      item.usage?.totalTokens ?? '',
      breakdown.audioIn,
      breakdown.audioOut,
      breakdown.audioTotal,
      breakdown.textIn,
      breakdown.textOut,
      breakdown.textTotal,
      item.text || '',
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
