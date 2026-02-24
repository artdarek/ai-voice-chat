/**
 * Manages realtime websocket session and microphone/audio pipeline.
 */
export function createSessionConnector(deps) {
  const {
    playback,
    onEvent,
    onOpen,
    onClose,
    onError,
    onMicDenied,
    onMuteChanged,
    onMuteReset,
  } = deps;

  let ws = null;
  let audioContext = null;
  let micStream = null;
  let workletNode = null;
  let isMuted = false;

  function isOpen() {
    return Boolean(ws && ws.readyState === WebSocket.OPEN);
  }

  function sendJson(payload) {
    if (!isOpen()) {
      return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
  }

  function cancelResponse() {
    if (isOpen()) {
      ws.send(JSON.stringify({ type: 'response.cancel' }));
    }
    playback.reset();
  }

  async function connect(context) {
    const {
      provider,
      target,
      userKey,
      voice,
      instructions,
      memoryContext,
    } = context;

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onMicDenied?.();
      return false;
    }

    audioContext = new AudioContext({ sampleRate: 24000 });
    playback.setAudioContext(audioContext);
    await audioContext.audioWorklet.addModule('js/audio-processor.js');

    const source = audioContext.createMediaStreamSource(micStream);
    workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

    workletNode.port.onmessage = ({ data }) => {
      if (data.type === 'audio' && isOpen()) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(data.data)));
        ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
      }
    };
    source.connect(workletNode);

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsParams = new URLSearchParams({ provider });
    if (provider === 'azure' && target.deployment) {
      wsParams.set('deployment', target.deployment);
    }
    if (provider === 'openai' && target.model) {
      wsParams.set('model', target.model);
    }
    if (userKey) {
      wsParams.set('api_key', userKey);
    }

    const wsUrl = `${protocol}://${location.host}/ws?${wsParams.toString()}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      onOpen?.({ provider, target });

      sendJson({
        type: 'session.update',
        session: {
          voice,
          instructions,
        },
      });

      if (memoryContext) {
        sendJson({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: memoryContext }],
          },
        });
      }
    };

    ws.onmessage = ({ data }) => {
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      onEvent?.(event);
    };

    ws.onclose = () => {
      onClose?.();
    };

    ws.onerror = () => {
      onError?.();
    };

    return true;
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
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }

    playback.reset();
    isMuted = false;
    onMuteReset?.();
  }

  function toggleMute() {
    if (!micStream) {
      return null;
    }

    isMuted = !isMuted;
    micStream.getAudioTracks().forEach((t) => {
      t.enabled = !isMuted;
    });

    onMuteChanged?.(isMuted);
    return isMuted;
  }

  return {
    connect,
    disconnect,
    isOpen,
    sendJson,
    cancelResponse,
    toggleMute,
  };
}
