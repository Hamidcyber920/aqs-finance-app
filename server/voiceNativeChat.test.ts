/**
 * Native Voice Chat Tests — Verify the text-based voice chat flow
 * Tests the nativeChat function, tool permissions, greeting, and side effects
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./server/_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

describe("Native Voice Chat - Module Structure", () => {
  it("should export nativeChat and buildGreeting functions", async () => {
    // We can't fully import due to DB dependencies, but we can verify the file exists and has the right structure
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("export async function nativeChat(");
    expect(content).toContain("export async function buildGreeting(");
  });

  it("should define SYSTEM_PROMPT with Hibba's Islamic identity", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("SYSTEM_PROMPT");
    expect(content).toContain("Hibba");
    expect(content).toContain("Assalamu Alaikum");
    // Bismillah is used in the client component, not in the server system prompt
    expect(content).toContain("Alhamdulillah");
  });

  it("should have role-based tool permissions", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("TOOL_PERMISSIONS");
    expect(content).toContain("superadmin");
    expect(content).toContain("admin");
    expect(content).toContain("trustee");
    expect(content).toContain("manager");
    expect(content).toContain("staff");
    expect(content).toContain("reception");
    expect(content).toContain("donor");
    expect(content).toContain("auditor");
  });

  it("should have hasPermission function for role-based access control", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("function hasPermission(toolName: string, role: string): boolean");
  });
});

describe("Native Voice Chat - Tool Declarations", () => {
  it("should declare all essential tool categories", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    // Core tools
    expect(content).toContain("get_current_user");
    expect(content).toContain("get_current_time");
    
    // People tools
    expect(content).toContain("get_staff_directory");
    expect(content).toContain("get_trustees");
    expect(content).toContain("search_donors");
    
    // Finance tools
    expect(content).toContain("search_transactions");
    expect(content).toContain("get_income_summary");
    expect(content).toContain("get_expenses_summary");
    expect(content).toContain("get_fund_balance");
    
    // Action tools
    expect(content).toContain("create_donation");
    expect(content).toContain("send_email");
    expect(content).toContain("send_whatsapp");
    
    // Navigation & form
    expect(content).toContain("navigate_to");
    expect(content).toContain("fill_form");
    
    // Google services
    expect(content).toContain("list_drive_files");
    expect(content).toContain("fetch_new_emails");
    expect(content).toContain("get_daily_briefing");
    
    // Prayer times
    expect(content).toContain("get_prayer_times");
  });

  it("should use OpenAI-compatible tool format", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    // Should use { type: "function", function: { name, description, parameters } }
    expect(content).toContain('type: "function"');
    expect(content).toContain("function: { name:");
    expect(content).toContain("description:");
    expect(content).toContain("parameters:");
  });
});

describe("Native Voice Chat - Tool Routing", () => {
  it("should have routeToolCall function covering all tool categories", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("async function routeToolCall(");
    
    // Verify key tool cases exist in the switch
    expect(content).toContain('case "get_current_user"');
    expect(content).toContain('case "get_current_time"');
    expect(content).toContain('case "navigate_to"');
    expect(content).toContain('case "fill_form"');
    expect(content).toContain('case "send_whatsapp"');
    expect(content).toContain('case "send_email"');
    expect(content).toContain('case "get_prayer_times"');
  });

  it("should handle navigate_to with side effects", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    // navigate_to should push a side effect
    expect(content).toContain('type: "navigate"');
    expect(content).toContain("sideEffects.push");
  });

  it("should handle fill_form with side effects", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain('type: "fill_form"');
    expect(content).toContain("fill_and_confirm");
   expect(content).toContain("wa.me");
  });
});

describe("Native Voice Chat - nativeChat Function", () => {
  it("should ensure tool_calls have IDs and tool messages have name field", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    // Must generate IDs for tool_calls (Gemini doesn't always return them)
    expect(content).toContain('id: tc.id || `call_${Date.now()}_${idx}`');
    
    // Must include name on tool response messages (Gemini requires function_response.name)
    expect(content).toContain('name: toolName');
  });

  it("should have a tool-calling loop with max iterations", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("MAX_TOOL_ITERATIONS");
    expect(content).toContain("for (let i = 0; i < MAX_TOOL_ITERATIONS");
  });

  it("should invoke LLM with messages, tools, and toolChoice", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("invokeLLM({");
    expect(content).toContain("messages,");
    expect(content).toContain("tools: availableTools");
    expect(content).toContain('toolChoice: "auto"');
  });

  it("should save transcripts to database", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("voiceTranscripts");
    expect(content).toContain('role: "user"');
    expect(content).toContain('role: "assistant"');
  });

  it("should track cost in voiceCostTracking", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("voiceCostTracking");
    expect(content).toContain("tokenCount");
    expect(content).toContain("estimatedCostPence");
  });

  it("should return response, sideEffects, tokensUsed, and toolsExecuted", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("response: responseText");
    expect(content).toContain("sideEffects: ctx.sideEffects");
    expect(content).toContain("tokensUsed: totalTokens");
    expect(content).toContain("toolsExecuted");
  });

  it("should filter tools by user role", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("TOOLS.filter(t => hasPermission(t.function.name, user.role))");
  });
});

describe("Native Voice Chat - buildGreeting Function", () => {
  it("should include Islamic greeting", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    // The greeting should include Assalamu Alaikum
    expect(content).toContain("Assalamu Alaikum");
    expect(content).toContain("Alhamdulillah");
  });

  it("should include prayer times from Aladhan API", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("api.aladhan.com");
    expect(content).toContain("Liverpool");
    expect(content).toContain("Fajr");
    expect(content).toContain("Maghrib");
    expect(content).toContain("Isha");
  });

  it("should include time-of-day greeting", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("Good morning");
    expect(content).toContain("Good afternoon");
    expect(content).toContain("Good evening");
  });

  it("should include pending items count", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("pendingCount");
    expect(content).toContain("pending item");
  });
});

describe("Native Voice Chat - Screen Context", () => {
  it("should have screen descriptions for all major pages", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("buildScreenDescription");
    expect(content).toContain('"/dashboard"');
    expect(content).toContain('"/receipts"');
    expect(content).toContain('"/reports"');
    expect(content).toContain('"/fundraising"');
    expect(content).toContain('"/donors"');
    expect(content).toContain('"/payroll"');
    expect(content).toContain('"/compliance"');
    expect(content).toContain('"/meetings"');
    expect(content).toContain('"/comms-hub"');
    expect(content).toContain('"/bistro87"');
  });

  it("should include entity context in screen description", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain('entityContext');
    expect(content).toContain('" | Context: "');
  });
});

describe("Native Voice Chat - Side Effects System", () => {
  it("should support navigate, fill_form, open_url, and open_url_batch side effects", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain('"navigate"');
    expect(content).toContain('"fill_form"');
    expect(content).toContain('"open_url"');
    expect(content).toContain('"open_url_batch"');
  });

  it("should define ToolContext with sideEffects array", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/server/voiceNativeChat.ts", "utf-8");
    
    expect(content).toContain("sideEffects: SideEffect[]");
  });
});

describe("VoiceAgent Client Component", () => {
  it("should use Gemini Live WebSocket for real-time voice", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    // Should use WebSocket for voice
    expect(content).toContain("WebSocket");
    expect(content).toContain("VoiceConnection");
    
    // Should use AudioWorklet for PCM capture
    expect(content).toContain("AudioWorklet");
    expect(content).toContain("pcm");
    
    // Should use token-based auth
    expect(content).toContain("/api/voice/token");
  });

  it("should use WebSocket messages for voice communication", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    // Should handle WebSocket message types
    expect(content).toContain("audio_response");
    expect(content).toContain("gemini_ready");
    expect(content).toContain("turn_complete");
    expect(content).toContain("start_session");
  });

  it("should preserve the hibba:fill_form event dispatch", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    expect(content).toContain('hibba:fill_form');
    expect(content).toContain('hibba:confirm_form_fill');
    expect(content).toContain("CustomEvent");
  });

  it("should handle server-side effects via WebSocket messages", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    // Should handle navigation, form fill, and URL open messages
    expect(content).toContain("navigate");
    expect(content).toContain("fill_form");
    expect(content).toContain("open_url");
  });

  it("should have voice and text mode toggle", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    expect(content).toContain("isTextMode");
    expect(content).toContain("setIsTextMode");
    expect(content).toContain("Switch to voice mode");
    expect(content).toContain("Switch to text mode");
  });

  it("should have quick action chips per page", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    expect(content).toContain("QUICK_ACTIONS");
    expect(content).toContain('"/dashboard"');
    expect(content).toContain("Quick actions");
  });

  it("should accept screenContext and entityContext props", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    expect(content).toContain("screenContext");
    expect(content).toContain("entityContext");
    expect(content).toContain("VoiceAgentProps");
  });

  it("should support audio playback queue for smooth streaming", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    // Should have audio playback management
    expect(content).toContain("AudioPlaybackQueue");
    expect(content).toContain("audioContext");
  });

  it("should have flag response functionality", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/receipt-scanner/client/src/components/VoiceAgent.tsx", "utf-8");
    
    expect(content).toContain("flagResponse");
    expect(content).toContain("flagged");
    expect(content).toContain("Dr. Hamid");
  });
});
