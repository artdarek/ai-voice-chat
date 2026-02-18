# Plan: Conversation History Persistence

## Context

Each new WebSocket connection starts a fresh OpenAI Realtime session with no memory of previous conversations. The goal is to persist conversation history in `localStorage` and replay it as `conversation.item.create` events right after reconnecting, so the AI has context of what was discussed before.

User decisions:
- Storage: **localStorage** (browser-side, no backend changes needed)
- Retention: **permanent** until manually cleared
- Overflow: **keep last 40 turns** (splice oldest when exceeded)

---

## How replay works (OpenAI Realtime API)

After `session.update` is sent on `ws.onopen`, inject previous turns:

```json
// user turn
{ "type": "conversation.item.create", "item": {
    "type": "message", "role": "user",
    "content": [{ "type": "input_text", "text": "..." }] }}

// assistant turn
{ "type": "conversation.item.create", "item": {
    "type": "message", "role": "assistant",
    "content": [{ "type": "text", "text": "..." }] }}
```

No `response.create` is sent after replaying — this is context injection only, not a new turn.

---

## Files to modify

| File | Changes |
|---|---|
| `services/website/app.js` | History logic, replay, save hooks, clear button handler |
| `services/website/index.html` | "Clear history" trash button in header |
| `services/website/style.css` | `.history-separator` + `.message.history` opacity + trash button hover |

No backend changes needed.

---

## Implementation detail

### A. History helpers (top of app.js, near other LS constants)

```javascript
const LS_HISTORY = 'chat_history';
const HISTORY_MAX = 40;

function loadHistory()  { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); }
function saveHistory(h) { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); }

function pushHistory(role, text) {
  if (!text || !text.trim()) return;
  const h = loadHistory();
  h.push({ role, text: text.trim() });
  if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
  saveHistory(h);
  updateClearBtn();
}
```

### B. Render history on page load

Called once on DOMContentLoaded, before user connects:

```javascript
function renderHistory() {
  const h = loadHistory();
  if (!h.length) return;
  emptyState.style.display = 'none';
  const sep = document.createElement('div');
  sep.className = 'history-separator';
  sep.textContent = 'Previous session';
  transcript.appendChild(sep);
  h.forEach(item => addBubble(item.role + ' history', item.text));
}
renderHistory();
```

### C. Replay on connect (ws.onopen, after session.update)

```javascript
for (const item of loadHistory()) {
  ws.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: item.role,
      content: [{ type: item.role === 'user' ? 'input_text' : 'text', text: item.text }],
    },
  }));
}
```

### D. Save turns — hooks into existing handleEvent + sendTextMessage

| Where | Event/function | Action |
|---|---|---|
| `handleEvent` | `conversation.item.input_audio_transcription.completed` | `pushHistory('user', event.transcript)` |
| `handleEvent` | `response.audio_transcript.done` | `pushHistory('assistant', event.transcript)` |
| `sendTextMessage()` | before sending to WS | `pushHistory('user', text)` |

### E. Clear history button

**index.html** — add trash button in `.header-right`, before `#btn-settings`:
```html
<button id="btn-clear-history" class="btn-icon btn-icon-danger"
        title="Clear conversation history" style="display:none" aria-label="Clear history">
  <!-- trash SVG -->
</button>
```

**app.js**:
```javascript
function updateClearBtn() {
  btnClearHistory.style.display = loadHistory().length ? 'flex' : 'none';
}

btnClearHistory.addEventListener('click', () => {
  localStorage.removeItem(LS_HISTORY);
  updateClearBtn();
  // rebuild transcript DOM
  transcript.innerHTML = '';
  transcript.appendChild(emptyState);
  emptyState.style.display = '';
});
```

`updateClearBtn()` called on: `renderHistory()`, after every `pushHistory()`, after clear.

---

## Visual design (style.css additions)

```css
.history-separator {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-dim);
  padding: 8px 0 4px;
  position: relative;
  /* horizontal lines via ::before / ::after */
}

.message.history {
  opacity: 0.5;
}

.btn-icon-danger:hover {
  color: var(--error);
  background: rgba(239,68,68,0.1);
}
```

---

## Edge cases

- **Empty history** → no separator, no replay, clear button hidden
- **Partial AI response** (disconnect mid-stream) → only saved on `response.audio_transcript.done`, so incomplete responses are not stored
- **Text messages** → saved immediately in `sendTextMessage()` before WS send
- **Clear while connected** → only clears localStorage + DOM; active session continues unaffected; AI won't lose context for the *current* session, but next reconnect starts fresh
- **History overflow** → oldest items spliced when `> HISTORY_MAX`

---

## Verification

1. Connect, exchange 3+ messages (voice or text), disconnect
2. Reload page → "Previous session" separator visible with dimmed old messages
3. Connect again → AI answers a question about earlier conversation
4. Click trash icon → transcript cleared, button hidden, localStorage empty
5. Reconnect → AI starts fresh with no prior context
