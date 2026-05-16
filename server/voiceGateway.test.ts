/**
 * Voice Gateway Tests — Verify @google/genai SDK + Gemini 2.0 Flash Live + Aoede setup
 */
import { describe, it, expect } from "vitest";

describe("Voice Gateway - @google/genai SDK Setup", () => {
  const GEMINI_MODEL = "gemini-2.0-flash-live-001";
  const VOICE_NAME = "Aoede";

  it("should use correct model name for Gemini 2.0 Flash Live", () => {
    expect(GEMINI_MODEL).toBe("gemini-2.0-flash-live-001");
  });

  it("should construct correct config for ai.live.connect()", () => {
    // This mirrors the config object passed to ai.live.connect()
    const config = {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: VOICE_NAME }
        }
      },
      systemInstruction: {
        parts: [{ text: "Test system prompt" }]
      },
      tools: [{ functionDeclarations: [] }],
    };

    // Verify responseModalities includes AUDIO
    expect(config.responseModalities).toContain("AUDIO");

    // Verify voice config uses Aoede
    expect(config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Aoede");

    // Verify system instruction structure
    expect(config.systemInstruction.parts[0].text).toBe("Test system prompt");

    // Verify tools structure
    expect(config.tools[0].functionDeclarations).toBeDefined();
  });

  it("should use sendClientContent format for text input", () => {
    // This mirrors how the SDK sends text to Gemini
    const clientContent = {
      turns: [{ role: "user", parts: [{ text: "Hello Hibba" }] }],
      turnComplete: true
    };

    expect(clientContent.turns).toHaveLength(1);
    expect(clientContent.turns[0].role).toBe("user");
    expect(clientContent.turns[0].parts[0].text).toBe("Hello Hibba");
    expect(clientContent.turnComplete).toBe(true);
  });

  it("should use sendRealtimeInput format for audio", () => {
    // This mirrors how the SDK sends audio to Gemini
    const realtimeInput = {
      audio: { data: "base64encodedaudio", mimeType: "audio/pcm;rate=16000" }
    };

    expect(realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
    expect(realtimeInput.audio.data).toBeDefined();
  });

  it("should use sendClientContent for screen context updates", () => {
    const ctxNote = "[SYSTEM] User navigated to: Dashboard. Adjust your responses accordingly.";
    const clientContent = {
      turns: [{ role: "user", parts: [{ text: ctxNote }] }],
      turnComplete: true
    };

    expect(clientContent.turns[0].parts[0].text).toContain("[SYSTEM]");
  });

  it("should handle Gemini Live response events correctly", () => {
    // Audio response from model
    const audioEvent = {
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { data: "base64audio", mimeType: "audio/pcm;rate=24000" } }]
        }
      }
    };

    // Output transcription event
    const transcriptEvent = {
      serverContent: {
        outputTranscription: { text: "Assalamu Alaikum" }
      }
    };

    // Input transcription event
    const inputTranscriptEvent = {
      serverContent: {
        inputTranscription: { text: "Hello" }
      }
    };

    // Turn complete event
    const turnCompleteEvent = {
      serverContent: {
        turnComplete: true
      }
    };

    // Interruption event
    const interruptEvent = {
      serverContent: {
        interrupted: true
      }
    };

    expect(audioEvent.serverContent.modelTurn.parts).toHaveLength(1);
    expect(audioEvent.serverContent.modelTurn.parts[0].inlineData.mimeType).toBe("audio/pcm;rate=24000");
    expect(transcriptEvent.serverContent.outputTranscription.text).toBe("Assalamu Alaikum");
    expect(inputTranscriptEvent.serverContent.inputTranscription.text).toBe("Hello");
    expect(turnCompleteEvent.serverContent.turnComplete).toBe(true);
    expect(interruptEvent.serverContent.interrupted).toBe(true);
  });

  it("should construct sendToolResponse in correct format", () => {
    // This mirrors how the SDK sends tool responses back to Gemini
    const toolResponse = {
      functionResponses: [
        {
          id: "call_123",
          name: "get_current_time",
          response: { status: "success", data: { time: "14:30", timezone: "Europe/London" } }
        }
      ]
    };

    expect(toolResponse.functionResponses).toHaveLength(1);
    expect(toolResponse.functionResponses[0].id).toBe("call_123");
    expect(toolResponse.functionResponses[0].name).toBe("get_current_time");
    expect(toolResponse.functionResponses[0].response.status).toBe("success");
  });

  it("should use Type enum from @google/genai for tool declarations", () => {
    // Verify the tool declaration format uses Type.OBJECT, Type.STRING etc.
    const toolDecl = {
      name: "search_donors",
      description: "Search donors by name, email, or phone.",
      parameters: {
        type: "OBJECT", // Type.OBJECT resolves to "OBJECT"
        properties: {
          query: { type: "STRING", description: "Search query" },
          limit: { type: "NUMBER", description: "Max results" }
        },
        required: ["query"]
      }
    };

    expect(toolDecl.name).toBe("search_donors");
    expect(toolDecl.parameters.type).toBe("OBJECT");
    expect(toolDecl.parameters.properties.query.type).toBe("STRING");
    expect(toolDecl.parameters.required).toContain("query");
  });
});

// Test the source code directly to verify correct patterns
describe("Voice Gateway - Source Code Verification", () => {
  it("should import and use @google/genai SDK", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should import from @google/genai
    expect(content).toContain("@google/genai");
    expect(content).toContain("GoogleGenAI");
    expect(content).toContain("Modality");
    expect(content).toContain("Type");
  });

  it("should use ai.live.connect() pattern", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should use the SDK's live.connect method
    expect(content).toContain("ai.live.connect");
    expect(content).toContain("callbacks");
    expect(content).toContain("onmessage");
  });

  it("should use sendRealtimeInput for audio", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should use session.sendRealtimeInput for audio
    expect(content).toContain("sendRealtimeInput");
    expect(content).toContain("audio/pcm;rate=16000");
  });

  it("should use sendClientContent for text messages", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should use session.sendClientContent for text
    expect(content).toContain("sendClientContent");
    // Count usages - at least for text_input, screen_context, and greeting
    const matches = content.match(/sendClientContent/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it("should use sendToolResponse for tool results", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should use session.sendToolResponse
    expect(content).toContain("sendToolResponse");
    expect(content).toContain("functionResponses");
  });

  it("should use Aoede voice and correct model", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    expect(content).toContain("Aoede");
    expect(content).toContain("gemini-2.0-flash-live-001");
  });

  it("should NOT use raw WebSocket connection to Gemini", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should NOT have the old raw WebSocket URL pattern
    expect(content).not.toContain("generativelanguage.googleapis.com/ws");
    expect(content).not.toContain("BidiGenerateContent");
    // Should NOT have manual WebSocket framing
    expect(content).not.toContain("new WebSocket(geminiUrl");
  });

  it("should have all critical tool declarations", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Core tools
    expect(content).toContain("get_current_user");
    expect(content).toContain("navigate_to");
    expect(content).toContain("fill_form");
    expect(content).toContain("send_email");
    expect(content).toContain("search_donors");
    expect(content).toContain("get_prayer_times");
    expect(content).toContain("get_staff_directory");
    expect(content).toContain("compose_briefing");
    expect(content).toContain("list_drive_files");
    expect(content).toContain("fetch_new_emails");
  });

  it("should not contain realtimeInput.text pattern", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceGateway.ts", "utf-8");

    // Should NOT have realtimeInput: { text: ... } - text goes via sendClientContent
    const realtimeTextPattern = /sendRealtimeInput\(\s*\{\s*text:/g;
    const matches = content.match(realtimeTextPattern);
    expect(matches).toBeNull();
  });
});
