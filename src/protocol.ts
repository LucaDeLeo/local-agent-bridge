// ── Model + thinking settings ──

export type AgentModel =
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001'

export type ThinkingLevel = 'off' | 'adaptive' | 'high' | 'max'

// ── Browser -> Bridge (client messages) ──

export type ClientMessage =
  | InitMessage
  | ChatMessage
  | RefreshAuthMessage
  | AbortMessage

export type InitMessage = {
  type: 'init'
  tools: import('./tools/types').ToolDefinition[]
  systemPrompt: string
  auth?: Record<string, string>
}

export type ChatMessage = {
  type: 'chat'
  text: string
  model?: AgentModel
  thinking?: ThinkingLevel
}

export type RefreshAuthMessage = {
  type: 'refresh_auth'
  auth: Record<string, string>
}

export type AbortMessage = {
  type: 'abort'
}

// ── Bridge -> Browser (streamed events) ──

export type BridgeEvent =
  | ReadyEvent
  | TextEvent
  | ToolUseEvent
  | ToolResultEvent
  | DoneEvent
  | ErrorEvent

export type ReadyEvent = { type: 'ready' }
export type TextEvent = { type: 'text'; content: string }
export type ToolUseEvent = { type: 'tool_use'; name: string; input: unknown }
export type ToolResultEvent = {
  type: 'tool_result'
  name: string
  output: string
}
export type DoneEvent = { type: 'done' }
export type ErrorEvent = { type: 'error'; code: ErrorCode; message: string }

export type ErrorCode =
  | 'auth_failed'
  | 'init_required'
  | 'invalid_message'
  | 'agent_error'
  | 'tool_error'

// ── Accumulated content (shared with React hook) ──

export type ContentPart =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; input: unknown; output?: string }

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; parts: ContentPart[] }
