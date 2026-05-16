# Gemini Live API — Tool Calling Notes

## Config Structure
```js
const tools = [{ function_declarations: [{ name: "navigate_to", description: "...", parameters: {...} }] }];
const config = { responseModalities: ["AUDIO"], tools, ... };
```

## Handling Tool Calls in onmessage
The `msg` object will have `msg.toolCall` (or `msg.tool_call`) with `functionCalls` array.
Each function call has: `id`, `name`, `args`.

## Responding to Tool Calls
```js
session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "ok" } }] });
```

## Key Points
- Function calling is synchronous by default (model pauses until response)
- Must handle tool responses manually (no auto-handling)
- Can use NON_BLOCKING behavior for async
- Tools are declared in session config alongside responseModalities, speechConfig, etc.
