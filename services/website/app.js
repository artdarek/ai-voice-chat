let ws = null;
let audioContext = null;
let micStream = null;
let workletNode = null;
let nextPlayTime = 0;
let isMuted = false;
let currentAiBubble = null;
let pendingUserBubble = null;
let requiresApiKey = false;

const btnConnect = document.getElementById('btn-connect');
const btnMute = document.getElementById('btn-mute');
const btnSend = document.getElementById('btn-send');
const btnSettings = document.getElementById('btn-settings');
const textInput = document.getElementById('text-input');
const voiceSelect = document.getElementById('voice-select');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const transcript = document.getElementById('transcript');

// ── API Key / Modal ──────────────────────────────────────────────────
const LS_KEY = 'openai_api_key';
const modalBackdrop = document.getElementById('modal-backdrop');
const apiKeyInput = document.getElementById('api-key-input');
const keyIndicator = document.getElementById('key-indicator');
const btnKeyRemove = document.getElementById('btn-key-remove');

function getSavedKey() { return localStorage.getItem(LS_KEY) || ''; }

function updateKeyIndicator() {
  keyIndicator.className = 'key-indicator ' + (getSavedKey() ? 'set' : 'missing');
}

function openModal() {
  const saved = getSavedKey();
  apiKeyInput.value = saved;
  btnKeyRemove.style.display = saved ? 'inline-flex' : 'none';
  modalBackdrop.style.display = 'flex';
  setTimeout(() => apiKeyInput.focus(), 50);
}

function closeModal() {
  modalBackdrop.style.display = 'none';
}

btnSettings.addEventListener('click', openModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);

document.getElementById('btn-key-save').addEventListener('click', () => {
  const val = apiKeyInput.value.trim();
  if (!val) return;
  localStorage.setItem(LS_KEY, val);
  updateKeyIndicator();
  closeModal();
});

btnKeyRemove.addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  apiKeyInput.value = '';
  btnKeyRemove.style.display = 'none';
  updateKeyIndicator();
  if (ws) {
    disconnect();
    closeModal();
  }
});

const btnEye = document.getElementById('btn-eye');
btnEye.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  document.getElementById('eye-show').style.display = isPassword ? 'none' : '';
  document.getElementById('eye-hide').style.display = isPassword ? '' : 'none';
});

modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalBackdrop.style.display !== 'none') closeModal();
});

apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-key-save').click();
});

// ── Init: fetch server config ────────────────────────────────────────
async function initConfig() {
  try {
    const res = await fetch('/config');
    const data = await res.json();
    requiresApiKey = !data.server_key;
  } catch {
    requiresApiKey = true;
  }

  if (requiresApiKey) {
    btnSettings.style.display = 'flex';
    updateKeyIndicator();
    if (!getSavedKey()) openModal();
  }
}

initConfig();

function setStatus(text, state) {
  statusText.textContent = text;
  statusDot.className = 'status-dot ' + (state || '');
}

const emptyState = document.getElementById('empty-state');

function addBubble(role, text) {
  if (emptyState) emptyState.style.display = 'none';

  const isUser = role.includes('user');
  const label = isUser ? 'You' : 'AI';

  const msg = document.createElement('div');
  msg.className = 'message ' + role;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = label;

  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;

  msg.appendChild(avatar);
  msg.appendChild(content);
  transcript.appendChild(msg);
  transcript.scrollTop = transcript.scrollHeight;

  // return the wrapper so callers can update it;
  // store content ref on the element for easy access
  msg._content = content;
  return msg;
}

function playAudioChunk(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

  const buf = audioContext.createBuffer(1, float32.length, 24000);
  buf.getChannelData(0).set(float32);
  const src = audioContext.createBufferSource();
  src.buffer = buf;
  src.connect(audioContext.destination);
  const start = Math.max(nextPlayTime, audioContext.currentTime);
  src.start(start);
  nextPlayTime = start + buf.duration;
}

function sendTextMessage() {
  const text = textInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

  // Show immediately in transcript
  addBubble('user', text);
  textInput.value = '';
  textInput.style.height = 'auto';

  ws.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }],
    },
  }));
  ws.send(JSON.stringify({ type: 'response.create' }));
}

async function connect() {
  if (requiresApiKey && !getSavedKey()) {
    openModal();
    return;
  }

  btnConnect.disabled = true;
  setStatus('Connecting...', 'connecting');

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus('Mic access denied', 'error');
    btnConnect.disabled = false;
    return;
  }

  audioContext = new AudioContext({ sampleRate: 24000 });
  await audioContext.audioWorklet.addModule('audio-processor.js');

  const source = audioContext.createMediaStreamSource(micStream);
  workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

  workletNode.port.onmessage = ({ data }) => {
    if (data.type === 'audio' && ws && ws.readyState === WebSocket.OPEN) {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data.data)));
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
    }
  };

  source.connect(workletNode);

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = requiresApiKey
    ? `${protocol}://${location.host}/ws?api_key=${encodeURIComponent(getSavedKey())}`
    : `${protocol}://${location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        voice: voiceSelect.value,
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
      },
    }));
  };

  ws.onmessage = ({ data }) => {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    handleEvent(event);
  };

  ws.onclose = () => {
    setStatus('Disconnected', '');
    btnConnect.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Connect`;
    btnConnect.classList.remove('disconnect');
    btnConnect.disabled = false;
    btnMute.style.display = 'none';
    voiceSelect.disabled = false;
    textInput.disabled = true;
    textInput.placeholder = 'Connect first, then type a message… (Enter to send, Shift+Enter for newline)';
    btnSend.disabled = true;
    currentAiBubble = null;
    pendingUserBubble = null;
  };

  ws.onerror = () => {
    setStatus('Connection error', 'error');
  };

  btnConnect.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Disconnect`;
  btnConnect.classList.add('disconnect');
  btnConnect.disabled = false;
  btnMute.style.display = 'inline-flex';
  textInput.disabled = false;
  textInput.placeholder = 'Type a message… (Enter to send, Shift+Enter for newline)';
  btnSend.disabled = false;
  textInput.focus();
}

function handleEvent(event) {
  switch (event.type) {
    case 'session.created':
    case 'session.updated':
      setStatus('Connected — speak now', 'connected');
      break;

    case 'input_audio_buffer.speech_started':
      setStatus('Listening...', 'listening');
      // Create placeholder user bubble immediately so it appears before AI response
      pendingUserBubble = addBubble('user pending', '…');
      currentAiBubble = null;
      nextPlayTime = 0;
      break;

    case 'conversation.item.input_audio_transcription.completed':
      if (pendingUserBubble) {
        pendingUserBubble._content.textContent = event.transcript || '';
        pendingUserBubble.classList.remove('pending');
        pendingUserBubble = null;
      } else if (event.transcript) {
        addBubble('user', event.transcript);
      }
      break;

    case 'response.audio.delta':
      if (event.delta) {
        voiceSelect.disabled = true;
        playAudioChunk(event.delta);
      }
      break;

    case 'response.audio_transcript.delta':
      if (event.delta) {
        if (!currentAiBubble) {
          currentAiBubble = addBubble('assistant streaming', '');
        }
        currentAiBubble._content.textContent += event.delta;
        transcript.scrollTop = transcript.scrollHeight;
      }
      break;

    case 'response.audio_transcript.done':
      if (currentAiBubble) {
        currentAiBubble.classList.remove('streaming');
        currentAiBubble = null;
      }
      break;

    case 'response.done':
      setStatus('Connected — speak now', 'connected');
      break;

    case 'error':
      console.error('OpenAI error:', event.error);
      setStatus('Error: ' + (event.error?.message || 'unknown'), 'error');
      break;
  }
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  nextPlayTime = 0;
  isMuted = false;
  btnMute.textContent = 'Mute';
  btnMute.classList.remove('active');
}

btnConnect.addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    disconnect();
  } else {
    connect();
  }
});

voiceSelect.addEventListener('change', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'session.update',
      session: { voice: voiceSelect.value },
    }));
  }
});

btnSend.addEventListener('click', sendTextMessage);

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage();
  }
});

textInput.addEventListener('input', () => {
  textInput.style.height = 'auto';
  textInput.style.height = textInput.scrollHeight + 'px';
});

btnMute.addEventListener('click', () => {
  if (!micStream) return;
  isMuted = !isMuted;
  micStream.getAudioTracks().forEach(t => (t.enabled = !isMuted));
  document.getElementById('icon-mic').style.display = isMuted ? 'none' : '';
  document.getElementById('icon-mic-off').style.display = isMuted ? '' : 'none';
  btnMute.childNodes[btnMute.childNodes.length - 1].textContent = isMuted ? ' Unmute' : ' Mute';
  btnMute.classList.toggle('active', isMuted);
  setStatus(isMuted ? 'Muted' : 'Connected — speak now', isMuted ? 'muted' : 'connected');
});
