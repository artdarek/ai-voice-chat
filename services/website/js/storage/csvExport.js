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

  const header = ['id', 'createdAt', 'provider', 'role', 'inputType', 'interrupted', 'text']
    .map(escapeCsvField)
    .join(',');

  const rows = history.map((item) =>
    [
      item.id || '',
      item.createdAt || '',
      item.provider || 'unknown',
      item.role || '',
      item.inputType || 'n/a',
      String(Boolean(item.interrupted)),
      item.text || '',
    ]
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
