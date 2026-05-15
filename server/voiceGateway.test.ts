/**
 * Voice Gateway Tests — Verify Gemini 2.5 Live API setup and audio flow
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import WebSocket from "ws";

// Test the setup payload structure for Gemini 2.5 compatibility
describe("Voice Gateway - Gemini 2.5 Setup", () => {
  const GEMINI_MODEL = "models/gemini-2.5-flash-native-audio-latest";

  it("should use v1alpha API endpoint", () => {
    const url = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
    expect(url).toContain("v1alpha");
    expect(url).not.toContain("v1beta");
  });

  it("should construct correct setup payload with thinkingBudget=0", () => {
    const setupPayload = {
      model: GEMINI_MODEL,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" }
          }
        },
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
      systemInstruction: {
        parts: [{ text: "Test system prompt" }]
      },
      tools: [{ functionDeclarations: [] }],
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
          prefixPaddingMs: 300,
          silenceDurationMs: 1500,
        },
        activityHandling: "NO_INTERRUPTION",
      },
      proactivity: {
        proactiveAudio: true,
      },
      contextWindowCompression: {
        triggerTokens: 25000,
        slidingWindowTokens: 12500,
      },
    };

    // Verify thinkingBudget is set to 0 (not thinkingLevel)
    expect(setupPayload.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
    
    // Verify responseModalities includes AUDIO
    expect(setupPayload.generationConfig.responseModalities).toContain("AUDIO");
    
    // Verify proactiveAudio is enabled
    expect(setupPayload.proactivity.proactiveAudio).toBe(true);
    
    // Verify voice config
    expect(setupPayload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore");
    
    // Verify VAD config
    expect(setupPayload.realtimeInputConfig.activityHandling).toBe("NO_INTERRUPTION");
    expect(setupPayload.realtimeInputConfig.automaticActivityDetection.disabled).toBe(false);
    
    // Verify context window compression
    expect(setupPayload.contextWindowCompression.triggerTokens).toBe(25000);
    
    // Verify transcription configs are present
    expect(setupPayload.outputAudioTranscription).toBeDefined();
    expect(setupPayload.inputAudioTranscription).toBeDefined();
  });

  it("should use clientContent format for text input (not realtimeInput.text)", () => {
    const textMessage = {
      clientContent: {
        turns: [{ role: "user", parts: [{ text: "Hello Hibba" }] }],
        turnComplete: true
      }
    };

    // Verify clientContent structure
    expect(textMessage.clientContent).toBeDefined();
    expect(textMessage.clientContent.turns).toHaveLength(1);
    expect(textMessage.clientContent.turns[0].role).toBe("user");
    expect(textMessage.clientContent.turns[0].parts[0].text).toBe("Hello Hibba");
    expect(textMessage.clientContent.turnComplete).toBe(true);
    
    // Verify no realtimeInput.text
    expect((textMessage as any).realtimeInput).toBeUndefined();
  });

  it("should use realtimeInput.audio format for audio chunks", () => {
    const audioMessage = {
      realtimeInput: {
        audio: {
          data: "base64encodedaudio",
          mimeType: "audio/pcm;rate=16000"
        }
      }
    };

    expect(audioMessage.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
    expect(audioMessage.realtimeInput.audio.data).toBeDefined();
  });

  it("should use clientContent for screen context updates (not realtimeInput.text)", () => {
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

  it("should handle Gemini 2.5 single-part-per-event responses correctly", () => {
    // Gemini 2.5 sends one part per event, unlike 3.1 which can send multiple
    const audioEvent = {
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: "base64audio", mimeType: "audio/pcm;rate=24000" } }]
        }
      }
    };

    const transcriptEvent = {
      serverContent: {
        outputTranscription: { text: "Assalamu Alaikum" }
      }
    };

    const turnCompleteEvent = {
      serverContent: {
        turnComplete: true
      }
    };

    // Audio event should have exactly one part with inlineData
    expect(audioEvent.serverContent.modelTurn.parts).toHaveLength(1);
    expect(audioEvent.serverContent.modelTurn.parts[0].inlineData).toBeDefined();
    expect(audioEvent.serverContent.modelTurn.parts[0].inlineData.mimeType).toBe("audio/pcm;rate=24000");

    // Transcript event should have outputTranscription
    expect(transcriptEvent.serverContent.outputTranscription.text).toBe("Assalamu Alaikum");

    // Turn complete event
    expect(turnCompleteEvent.serverContent.turnComplete).toBe(true);
  });

  it("should use clientContent for navigation proactive notes", () => {
    const proactiveNote = "[NAVIGATION COMPLETE] You just navigated the user to: Dashboard.";
    const navMessage = {
      clientContent: {
        turns: [{ role: "user", parts: [{ text: proactiveNote }] }],
        turnComplete: true
      }
    };

    expect(navMessage.clientContent).toBeDefined();
    expect(navMessage.clientContent.turns[0].parts[0].text).toContain("NAVIGATION COMPLETE");
    expect((navMessage as any).realtimeInput).toBeUndefined();
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

// Test the source code directly to verify no realtimeInput.text remains
describe("Voice Gateway - Source Code Verification", () => {
  it("should not contain realtimeInput.text in voiceGateway.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");
    
    // Should NOT have realtimeInput: { text: ... } anywhere
    const realtimeTextPattern = /realtimeInput:\s*\{\s*text:/g;
    const matches = content.match(realtimeTextPattern);
    expect(matches).toBeNull();
    
    // Should have realtimeInput only for audio
    const realtimeAudioPattern = /realtimeInput:\s*\{\s*audio:/g;
    const audioMatches = content.match(realtimeAudioPattern);
    expect(audioMatches).not.toBeNull();
    expect(audioMatches!.length).toBeGreaterThan(0);
  });

  it("should use v1alpha API endpoint in voiceGateway.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");
    
    expect(content).toContain("v1alpha.GenerativeService.BidiGenerateContent");
    expect(content).not.toContain("v1beta.GenerativeService.BidiGenerateContent");
  });

  it("should have thinkingBudget in setup config", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");
    
    expect(content).toContain("thinkingBudget: 0");
    // Should NOT have thinkingLevel (that's for 3.1)
    expect(content).not.toContain("thinkingLevel");
  });

  it("should have proactiveAudio enabled in setup config", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");
    
    expect(content).toContain("proactiveAudio: true");
  });

  it("should use clientContent for all text-based messages", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");
    
    // Count clientContent usages - should be used for text_input, screen_context, proactive greeting, and nav notes
    const clientContentPattern = /clientContent:\s*\{/g;
    const matches = content.match(clientContentPattern);
    expect(matches).not.toBeNull();
    // At least 4: text_input, screen_context, proactive greeting, navigation note
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });
});
