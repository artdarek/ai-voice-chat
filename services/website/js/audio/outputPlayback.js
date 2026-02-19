/**
 * Creates audio playback helpers for scheduling PCM output without gaps.
 */
export function createOutputPlayback() {
  let audioContext = null;
  let nextPlayTime = 0;

  /**
   * Sets/updates active AudioContext used for playback.
   */
  function setAudioContext(ctx) {
    audioContext = ctx;
    nextPlayTime = 0;
  }

  /**
   * Resets playback clock used for chunk scheduling.
   */
  function reset() {
    nextPlayTime = 0;
  }

  /**
   * Decodes one base64 PCM16 chunk and schedules it for playback.
   */
  function playAudioChunk(base64) {
    if (!audioContext) {
      return;
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buf = audioContext.createBuffer(1, float32.length, 24000);
    buf.getChannelData(0).set(float32);
    const src = audioContext.createBufferSource();
    src.buffer = buf;
    src.connect(audioContext.destination);
    const start = Math.max(nextPlayTime, audioContext.currentTime);
    src.start(start);
    nextPlayTime = start + buf.duration;
  }

  return {
    setAudioContext,
    playAudioChunk,
    reset,
  };
}
