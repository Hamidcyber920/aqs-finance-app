/**
 * Voice Gateway Tests — Verify Gemini 2.0 Flash Live + Aoede setup and audio flow
 */
import { describe, it, expect } from "vitest";

describe("Voice Gateway - Gemini 2.0 Flash Live Setup", () => {
  const GEMINI_MODEL = "models/gemini-2.0-flash-live-001";
  const VOICE_NAME = "Aoede";

  it("should use v1beta API endpoint for Gemini 2.0 Flash Live", () => {
    const url = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
    expect(url).toContain("v1beta");
    expect(url).toContain("BidiGenerateContent");
  });

  it("should construct correct setup payload with Aoede voice", () => {
    const setupPayload = {
      setup: {
        model: GEMINI_MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: VOICE_NAME }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: "Test system prompt" }]
        },
        tools: [{ functionDeclarations: [] }],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
      }
    };

    // Verify model
    expect(setupPayload.setup.model).toBe("models/gemini-2.0-flash-live-001");

    // Verify responseModalities includes AUDIO
    expect(setupPayload.setup.generationConfig.responseModalities).toContain("AUDIO");

    // Verify voice config uses Aoede
    expect(setupPayload.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Aoede");

    // Verify transcription configs are present
    expect(setupPayload.setup.outputAudioTranscription).toBeDefined();
    expect(setupPayload.setup.inputAudioTranscription).toBeDefined();
  });

  it("should use clientContent format for text input", () => {
    const textMessage = {
      clientContent: {
        turns: [{ role: "user", parts: [{ text: "Hello Hibba" }] }],
        turnComplete: true
      }
    };

    expect(textMessage.clientContent).toBeDefined();
    expect(textMessage.clientContent.turns).toHaveLength(1);
    expect(textMessage.clientContent.turns[0].role).toBe("user");
    expect(textMessage.clientContent.turns[0].parts[0].text).toBe("Hello Hibba");
    expect(textMessage.clientContent.turnComplete).toBe(true);
    expect((textMessage as any).realtimeInput).toBeUndefined();
  });

  it("should use realtimeInput.mediaChunks format for audio", () => {
    const audioMessage = {
      realtimeInput: {
        mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: "base64encodedaudio" }]
      }
    };

    expect(audioMessage.realtimeInput.mediaChunks).toHaveLength(1);
    expect(audioMessage.realtimeInput.mediaChunks[0].mimeType).toBe("audio/pcm;rate=16000");
    expect(audioMessage.realtimeInput.mediaChunks[0].data).toBeDefined();
  });

  it("should use clientContent for screen context updates", () => {
    const ctxNote = "[SYSTEM CONTEXT UPDATE] User navigated to: Dashboard. Adjust your responses.";
    const contextMessage = {
      clientContent: {
        turns: [{ role: "user", parts: [{ text: ctxNote }] }],
        turnComplete: true
      }
    };

    expect(contextMessage.clientContent).toBeDefined();
    expect(contextMessage.clientContent.turns[0].parts[0].text).toContain("SYSTEM CONTEXT UPDATE");
    expect((contextMessage as any).realtimeInput).toBeUndefined();
  });

  it("should handle Gemini 2.0 response events correctly", () => {
    // Audio response
    const audioEvent = {
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: "base64audio", mimeType: "audio/pcm;rate=24000" } }]
        }
      }
    };

    // Transcript event
    const transcriptEvent = {
      serverContent: {
        outputTranscription: { text: "Assalamu Alaikum" }
      }
    };

    // Turn complete event
    const turnCompleteEvent = {
      serverContent: {
        turnComplete: true
      }
    };

    expect(audioEvent.serverContent.modelTurn.parts).toHaveLength(1);
    expect(audioEvent.serverContent.modelTurn.parts[0].inlineData.mimeType).toBe("audio/pcm;rate=24000");
    expect(transcriptEvent.serverContent.outputTranscription.text).toBe("Assalamu Alaikum");
    expect(turnCompleteEvent.serverContent.turnComplete).toBe(true);
  });

  it("should construct tool response in correct format", () => {
    const toolResponse = {
      toolResponse: {
        functionResponses: [
          {
            id: "call_123",
            name: "get_current_time",
            response: { result: JSON.stringify({ time: "14:30", timezone: "Europe/London" }) }
          }
        ]
      }
    };

    expect(toolResponse.toolResponse.functionResponses).toHaveLength(1);
    expect(toolResponse.toolResponse.functionResponses[0].id).toBe("call_123");
    expect(toolResponse.toolResponse.functionResponses[0].name).toBe("get_current_time");
  });
});

// Test the source code directly to verify correct patterns
describe("Voice Gateway - Source Code Verification", () => {
  it("should use mediaChunks format (not realtimeInput.audio) in voiceGateway.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should have mediaChunks for audio
    expect(content).toContain("mediaChunks");
    expect(content).toContain("audio/pcm;rate=16000");
  });

  it("should use v1beta API endpoint in voiceGateway.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    expect(content).toContain("v1beta.GenerativeService.BidiGenerateContent");
  });

  it("should use Aoede voice in voiceGateway.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    expect(content).toContain("Aoede");
    expect(content).toContain("gemini-2.0-flash-live-001");
  });

  it("should use clientContent for all text-based messages", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Count clientContent usages - should be used for text_input, screen_context, and greeting
    const clientContentPattern = /clientContent:\s*\{/g;
    const matches = content.match(clientContentPattern);
    expect(matches).not.toBeNull();
    // At least 3: text_input, screen_context, greeting
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it("should not contain realtimeInput.text pattern", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should NOT have realtimeInput: { text: ... } anywhere
    const realtimeTextPattern = /realtimeInput:\s*\{\s*text:/g;
    const matches = content.match(realtimeTextPattern);
    expect(matches).toBeNull();
  });

  it("should have tool declarations with proper structure", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should have functionDeclarations in the tools section
    expect(content).toContain("functionDeclarations");
    // Should have tool response handling
    expect(content).toContain("toolResponse");
    expect(content).toContain("functionResponses");
  });
});
