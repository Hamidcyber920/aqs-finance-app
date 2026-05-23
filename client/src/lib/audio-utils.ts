/**
 * Audio utilities for Hibba Voice Assistant
 * Handles PCM audio capture (16kHz) and playback (24kHz)
 *
 * iOS Safari compatibility:
 *  - AudioWorklet is NOT supported on iOS Safari (as of iOS 17)
 *  - Falls back to ScriptProcessorNode (deprecated but universally supported)
 *  - AudioContext sample rate is forced to 16kHz where supported; on iOS
 *    the actual rate may differ, so we resample manually.
 */

// ─── Audio Capture (Microphone → 16kHz PCM → Base64) ─────────────────────────

const TARGET_SAMPLE_RATE = 16000;

export interface AudioCaptureHandle {
  stop: () => void;
}

/** Simple linear resampler: converts Float32Array from srcRate → dstRate */
function resample(input: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return input;
  const ratio = srcRate / dstRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIdx - lo;
    output[i] = input[lo] * (1 - frac) + input[hi] * frac;
  }
  return output;
}

/** Convert Float32 PCM to Int16 PCM */
function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Encode Int16Array to base64 string */
function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Check if AudioWorklet is supported (not available on iOS Safari) */
function isAudioWorkletSupported(): boolean {
  try {
    return typeof AudioWorkletNode !== "undefined" && typeof AudioContext !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Start capturing microphone audio as 16kHz PCM base64 chunks.
 * Automatically falls back to ScriptProcessorNode on iOS Safari.
 */
export async function startAudioCapture(
  onChunk: (base64Pcm: string) => void
): Promise<AudioCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // iOS Safari ignores sampleRate in AudioContext constructor — use default
  // and resample manually. Other browsers honour the 16kHz request.
  let audioCtx: AudioContext;
  try {
    audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    audioCtx = new AudioContext();
  }

  // Resume context (required after user gesture on iOS)
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  const source = audioCtx.createMediaStreamSource(stream);
  const actualRate = audioCtx.sampleRate;

  // Buffer for accumulating samples before sending
  let sampleBuffer: Float32Array[] = [];
  let bufferLength = 0;
  const CHUNK_SAMPLES = TARGET_SAMPLE_RATE / 10; // 100ms worth at 16kHz

  function processChunk(samples: Float32Array) {
    // Resample from actual rate to 16kHz if needed
    const resampled = resample(samples, actualRate, TARGET_SAMPLE_RATE);
    sampleBuffer.push(resampled);
    bufferLength += resampled.length;

    while (bufferLength >= CHUNK_SAMPLES) {
      // Merge buffer
      const merged = new Float32Array(bufferLength);
      let offset = 0;
      for (const chunk of sampleBuffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      sampleBuffer = [];
      bufferLength = 0;

      // Take exactly CHUNK_SAMPLES, keep remainder
      const toSend = merged.slice(0, CHUNK_SAMPLES);
      const remainder = merged.slice(CHUNK_SAMPLES);
      if (remainder.length > 0) {
        sampleBuffer.push(remainder);
        bufferLength = remainder.length;
      }

      const int16 = float32ToInt16(toSend);
      onChunk(int16ToBase64(int16));
    }
  }

  let workletNode: AudioWorkletNode | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scriptNode: any = null;

  if (isAudioWorkletSupported()) {
    try {
      const code = `
        class PCMProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input && input[0] && input[0].length > 0) {
              this.port.postMessage(new Float32Array(input[0]));
            }
            return true;
          }
        }
        registerProcessor('pcm-processor', PCMProcessor);
      `;
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await audioCtx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
      workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
        processChunk(e.data);
      };
      source.connect(workletNode);
      workletNode.connect(audioCtx.destination);
    } catch (err) {
      console.warn("[Hibba] AudioWorklet failed, falling back to ScriptProcessor:", err);
      workletNode = null;
    }
  }

  // Fallback: ScriptProcessorNode (works on iOS Safari)
  if (!workletNode) {
    const bufferSize = 4096;
    scriptNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const inputData = e.inputBuffer.getChannelData(0);
      processChunk(new Float32Array(inputData));
    };
    source.connect(scriptNode);
    scriptNode.connect(audioCtx.destination);
  }

  return {
    stop: () => {
      if (workletNode) {
        workletNode.disconnect();
      }
      if (scriptNode) {
        scriptNode.disconnect();
        scriptNode.onaudioprocess = null;
      }
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
 */
export class AudioPlayer {
  private audioCtx: AudioContext;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private gainNode: GainNode;

  constructor() {
    try {
      this.audioCtx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    } catch {
      this.audioCtx = new AudioContext();
    }
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
  }

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

  interrupt(): void {
    this.nextStartTime = 0;
    this.isPlaying = false;
    this.gainNode.disconnect();
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
  }

  destroy(): void {
    this.audioCtx.close();
  }
}
