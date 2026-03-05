// React hook
export { useLocalAgent } from './useLocalAgent'

// React hook types
export type {
  UseLocalAgentConfig,
  UseLocalAgentReturn,
  ConnectionStatus,
} from './types'

// Protocol types (re-exported for convenience)
export type {
  ClientMessage,
  InitMessage,
  ChatMessage,
  RefreshAuthMessage,
  AbortMessage,
  BridgeEvent,
  ReadyEvent,
  TextEvent,
  ToolUseEvent,
  ToolResultEvent,
  DoneEvent,
  ErrorEvent,
  ErrorCode,
  ContentPart,
  AgentMessage,
  AgentModel,
  ThinkingLevel,
} from '../src/protocol'

// Tool types (re-exported for convenience)
export type {
  ToolDefinition,
  ToolHandler,
  ConvexHandler,
  HttpHandler,
  StaticHandler,
  JsonSchema,
  JsonSchemaProperty,
} from '../src/tools/types'
