import type {
  AgentMessage,
  AgentModel,
  ContentPart,
  ThinkingLevel,
} from '../src/protocol'
import type { ToolDefinition } from '../src/tools/types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export type UseLocalAgentConfig = {
  /** Port the bridge server is running on (default: 3002) */
  port?: number

  /** Tool definitions to send in the init message */
  tools: ToolDefinition[]

  /** System prompt for the agent */
  systemPrompt: string

  /**
   * Callback to get auth tokens. Called on init and every 45s for refresh.
   * Return a record of auth key-value pairs (e.g. { convexToken, convexUrl }).
   */
  getAuth?: () => Promise<Record<string, string>>

  /**
   * Load persisted messages on mount.
   * Return saved messages or empty array.
   */
  loadMessages?: () => Promise<AgentMessage[]> | AgentMessage[]

  /**
   * Persist messages after each assistant response.
   * Called with the full message history.
   */
  persistMessages?: (messages: AgentMessage[]) => void
}

export type UseLocalAgentReturn = {
  /** Current connection status */
  status: ConnectionStatus

  /** Accumulated message history */
  messages: AgentMessage[]

  /** Parts being streamed for the current assistant response */
  streamParts: ContentPart[]

  /** Send a chat message to the agent */
  sendMessage: (
    text: string,
    model?: AgentModel,
    thinking?: ThinkingLevel,
  ) => void

  /** Whether the agent is currently streaming a response */
  isStreaming: boolean

  /** Abort the current streaming response */
  abort: () => void

  /** Clear message history (local + persisted) */
  clearHistory: () => void
}
