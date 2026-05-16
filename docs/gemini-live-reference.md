# Gemini Live API Reference Implementation (Node.js)

Source: https://github.com/google-gemini/gemini-live-api-examples/blob/main/command-line/node/main.mts

## Key Findings

1. **Model**: `gemini-3.1-flash-live-preview` (NOT `gemini-2.0-flash-live-001` which is deprecated)
2. **Config features**: `outputAudioTranscription: {}` and `inputAudioTranscription: {}` for transcription
3. **Audio format**: PCM 16-bit, 16000Hz mono for input, 24000Hz for output
4. **Connection**: `ai.live.connect()` with callbacks: `onopen`, `onmessage`, `onerror`, `onclose`
5. **Sending audio**: `session.sendRealtimeInput({ audio: { data: base64, mimeType: "audio/pcm;rate=16000" } })`
6. **Message structure**: `message.serverContent.modelTurn.parts[].inlineData.data` for audio output
7. **Transcription**: `message.serverContent.outputTranscription.text` and `message.serverContent.inputTranscription.text`
8. **Interruption**: `message.serverContent.interrupted` flag

## Full Code

```typescript
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';

const ai = new GoogleGenAI({});

const model = 'gemini-3.1-flash-live-preview';
const config = {
  responseModalities: [Modality.AUDIO],
  systemInstruction: "You are a helpful and friendly AI assistant.",
  outputAudioTranscription: {},
  inputAudioTranscription: {},
};

async function live() {
  const responseQueue: LiveServerMessage[] = [];

  const session = await ai.live.connect({
    model: model,
    config: config,
    callbacks: {
      onopen: () => console.log('Connected to Gemini Live API'),
      onmessage: (message: LiveServerMessage) => responseQueue.push(message),
      onerror: (e: ErrorEvent) => console.error('Error:', e.message),
      onclose: (e: CloseEvent) => console.log('Closed:', e.reason),
    },
  });

  // Send audio:
  session.sendRealtimeInput({
    audio: {
      data: base64AudioData,
      mimeType: "audio/pcm;rate=16000"
    }
  });
}
```

## Important Notes for Server-Side Proxy

- The reference uses `gemini-3.1-flash-live-preview` which is the LATEST model
- The `onopen` callback is available (we weren't using it)
- `onerror` receives `ErrorEvent` with `.message`
- `onclose` receives `CloseEvent` with `.reason`
- The connection is a WebSocket under the hood (SDK manages it)
- For our SSE proxy: server connects to Gemini via SDK WebSocket, relays to client via SSE
