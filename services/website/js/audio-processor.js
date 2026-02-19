// AudioWorklet runs on the audio rendering thread.
// This processor converts microphone Float32 frames to PCM16 chunks and
// sends them to the main thread for WebSocket streaming to the Realtime API.
// It must stay in a standalone file loaded via audioContext.audioWorklet.addModule().
class AudioProcessor extends AudioWorkletProcessor {
  /**
   * Processes one audio frame and posts PCM16 chunk to main thread.
   */
  process(inputs) {
    const input = inputs[0];
    if (!input.length) return true;
    const float32 = input[0];
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage({ type: 'audio', data: int16.buffer }, [int16.buffer]);
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
