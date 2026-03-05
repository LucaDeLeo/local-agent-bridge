import type {
  SDKMessage,
  SDKPartialAssistantMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { BridgeEvent } from './protocol'

/**
 * Map an SDK stream message to BridgeEvent(s) for the browser.
 * Returns null for messages we don't need to forward.
 *
 * Note: The SDK emits message types at runtime (e.g. tool_use_summary, user)
 * that aren't all represented in the TypeScript union. We use `any` casts
 * where necessary to handle these.
 */
export function mapSdkMessage(
  msg: SDKMessage,
): BridgeEvent | BridgeEvent[] | null {
  const msgType = (msg as any).type as string

  switch (msgType) {
    case 'stream_event':
      return mapStreamEvent(msg as SDKPartialAssistantMessage)
    case 'tool_use_summary':
      return mapToolUseSummary(msg as any)
    case 'user':
      return mapUserMessage(msg as any)
    case 'result': {
      const result = msg as any
      if (result.subtype !== 'success') {
        const errors = result.errors as string[] | undefined
        return {
          type: 'error',
          code: 'agent_error',
          message: errors?.join('; ') ?? `Query ended: ${result.subtype}`,
        }
      }
      return null
    }
    default:
      return null
  }
}

function mapStreamEvent(
  msg: SDKPartialAssistantMessage,
): BridgeEvent | null {
  const event = msg.event

  switch (event.type) {
    case 'content_block_delta': {
      const delta = event.delta
      if (delta.type === 'text_delta') {
        return { type: 'text', content: delta.text }
      }
      return null
    }
    case 'content_block_start': {
      const block = event.content_block
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          name: block.name,
          input: {},
        }
      }
      return null
    }
    default:
      return null
  }
}

function mapToolUseSummary(
  msg: { toolName?: string; summary: string },
): BridgeEvent | null {
  return {
    type: 'tool_result',
    name: msg.toolName ?? 'tool',
    output: msg.summary,
  }
}

function mapUserMessage(
  msg: { message?: { content?: any[] } },
): BridgeEvent[] | null {
  const message = msg.message
  if (!message?.content || !Array.isArray(message.content)) return null

  const events: BridgeEvent[] = []
  for (const block of message.content) {
    if (block.type === 'tool_result') {
      let output = ''
      if (typeof block.content === 'string') {
        output = block.content
      } else if (Array.isArray(block.content)) {
        output = block.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n')
      }
      // tool_use_id is an opaque SDK ID (e.g. "toolu_01ABC..."), not the
      // tool name. Use 'tool' as placeholder — the primary tool_result path
      // is mapToolUseSummary which provides the actual tool name.
      events.push({
        type: 'tool_result',
        name: 'tool',
        output,
      })
    }
  }

  return events.length > 0 ? events : null
}
