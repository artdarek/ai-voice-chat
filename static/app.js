let ws = null;
let audioContext = null;
let micStream = null;
let workletNode = null;
let nextPlayTime = 0;
let isMuted = false;
let currentAiBubble = null;
let pendingUserBubble = null;

const btnConnect = document.getElementById('btn-connect');
const btnMute = document.getElementById('btn-mute');
const voiceSelect = document.getElementById('voice-select');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const transcript = document.getElementById('transcript');

function setStatus(text, state) {
  statusText.textContent = text;
  statusDot.className = 'status-dot ' + (state || '');
}

function addBubble(role, text) {
  const div = document.createElement('div');
  div.className = 'bubble ' + role;
  div.textContent = text;
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
  return div;
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

async function connect() {
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
  ws = new WebSocket(`${protocol}://${location.host}/ws`);

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
    btnConnect.textContent = 'Connect';
    btnConnect.disabled = false;
    btnMute.style.display = 'none';
    voiceSelect.disabled = false;
    currentAiBubble = null;
    pendingUserBubble = null;
  };

  ws.onerror = () => {
    setStatus('Connection error', 'error');
  };

  btnConnect.textContent = 'Disconnect';
  btnConnect.disabled = false;
  btnMute.style.display = 'inline-flex';
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
        pendingUserBubble.textContent = event.transcript || '';
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
        currentAiBubble.textContent += event.delta;
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

btnMute.addEventListener('click', () => {
  if (!micStream) return;
  isMuted = !isMuted;
  micStream.getAudioTracks().forEach(t => (t.enabled = !isMuted));
  btnMute.textContent = isMuted ? 'Unmute' : 'Mute';
  btnMute.classList.toggle('active', isMuted);
  setStatus(isMuted ? 'Muted' : 'Connected — speak now', isMuted ? 'muted' : 'connected');
});
