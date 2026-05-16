/**
 * Audio utilities for Hibba Voice Assistant
 * Handles PCM audio capture (16kHz) and playback (24kHz)
 * Ported from the reference Hibba standalone app.
 */

// ─── Audio Capture (Microphone → 16kHz PCM → Base64) ─────────────────────────

const CAPTURE_SAMPLE_RATE = 16000;

/**
 * AudioWorklet processor code as a blob URL.
 * Captures raw PCM float32 samples and posts them to the main thread.
 */
function createWorkletBlobUrl(): string {
  const code = `
    class PCMProcessor extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0];
        if (input && input[0] && input[0].length > 0) {
          const samples = new Float32Array(input[0]);
          this.port.postMessage(samples);
        }
        return true;
      }
    }
    registerProcessor('pcm-processor', PCMProcessor);
  `;
  const blob = new Blob([code], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

export interface AudioCaptureHandle {
  stop: () => void;
}

/**
 * Start capturing microphone audio as 16kHz PCM base64 chunks.
 * Calls onChunk with base64-encoded PCM data every ~100ms.
 */
export async function startAudioCapture(
  onChunk: (base64Pcm: string) => void
): Promise<AudioCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: CAPTURE_SAMPLE_RATE,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioCtx = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
  const source = audioCtx.createMediaStreamSource(stream);

  const workletUrl = createWorkletBlobUrl();
  await audioCtx.audioWorklet.addModule(workletUrl);
  URL.revokeObjectURL(workletUrl);

  const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");

  // Buffer samples and send every ~100ms
  let buffer: Float32Array[] = [];
  let bufferLength = 0;
  const CHUNK_SIZE = CAPTURE_SAMPLE_RATE / 10; // 1600 samples = 100ms

  workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
    buffer.push(event.data);
    bufferLength += event.data.length;

    if (bufferLength >= CHUNK_SIZE) {
      // Merge buffers
      const merged = new Float32Array(bufferLength);
      let offset = 0;
      for (const chunk of buffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      buffer = [];
      bufferLength = 0;

      // Convert float32 to int16 PCM
      const int16 = new Int16Array(merged.length);
      for (let i = 0; i < merged.length; i++) {
        const s = Math.max(-1, Math.min(1, merged[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Base64 encode
      const bytes = new Uint8Array(int16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      onChunk(base64);
    }
  };

  source.connect(workletNode);
  workletNode.connect(audioCtx.destination); // Required for worklet to process

  return {
    stop: () => {
      workletNode.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
    },
  };
}

// ─── Audio Playback (Base64 PCM 24kHz → Speaker) ─────────────────────────────

const PLAYBACK_SAMPLE_RATE = 24000;

/**
 * AudioPlayer class for gapless playback of PCM audio chunks.
 * Schedules buffers sequentially to avoid gaps.
 */
export class AudioPlayer {
  private audioCtx: AudioContext;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private gainNode: GainNode;

  constructor() {
    this.audioCtx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
  }

  /**
   * Queue a base64 PCM chunk for playback.
   */
  play(base64Pcm: string): void {
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }

    const bytes = atob(base64Pcm);
    const arrayBuffer = new ArrayBuffer(bytes.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.length; i++) {
      view[i] = bytes.charCodeAt(i);
    }

    // Convert int16 PCM to float32
    const int16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    const currentTime = this.audioCtx.currentTime;
    const startTime = Math.max(currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    this.isPlaying = true;
  }

  /**
   * Interrupt playback (e.g., on barge-in).
   */
  interrupt(): void {
    this.nextStartTime = 0;
    this.isPlaying = false;
    // Recreate gain node to stop all scheduled sources
    this.gainNode.disconnect();
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.audioCtx.close();
  }
}
