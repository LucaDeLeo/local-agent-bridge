import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type {
  BridgeEvent,
  AgentModel,
  ThinkingLevel,
} from './protocol'
import type { ToolDefinition } from './tools/types'
import { jsonSchemaToZodShape } from './tools/schema'
import { createExecutor, type ExecutorContext } from './tools/executor'
import { mapSdkMessage } from './sdk-mapper'

function thinkingToMaxTokens(level: ThinkingLevel): number | undefined {
  switch (level) {
    case 'off':
      return undefined
    case 'adaptive':
      return undefined
    case 'high':
      return 10000
    case 'max':
      return 32000
  }
}

export type BridgeAgent = ReturnType<typeof createBridgeAgent>

/**
 * Create a bridge agent from browser-provided tool definitions.
 *
 * Converts ToolDefinition[] to SDK tool() calls, creates an MCP server,
 * and returns a chat method that yields BridgeEvents.
 */
export function createBridgeAgent(
  toolDefs: ToolDefinition[],
  systemPrompt: string,
  executorCtx: ExecutorContext,
) {
  const executor = createExecutor(executorCtx)

  // Convert browser-defined tools to SDK tools
  // tool() signature: (name, description, inputSchema, handler)
  const sdkTools = toolDefs.map((def) => {
    const shape = jsonSchemaToZodShape(def.parameters)
    return tool(
      def.name,
      def.description,
      z.object(shape) as any,
      async (input: any) => {
        const text = await executor(def, input as Record<string, unknown>)
        return { content: [{ type: 'text' as const, text }] }
      },
    )
  })

  const serverName = 'local-agent-bridge'
  const mcpServer = createSdkMcpServer({
    name: serverName,
    version: '0.1.0',
    tools: sdkTools,
  })

  const allowedTools = sdkTools.map((t) => `mcp__${serverName}__${t.name}`)

  return {
    async *chat(
      message: string,
      model?: AgentModel,
      thinking?: ThinkingLevel,
      signal?: AbortSignal,
    ): AsyncGenerator<BridgeEvent> {
      const selectedModel = model ?? 'claude-sonnet-4-6'
      const maxThinkingTokens = thinkingToMaxTokens(thinking ?? 'adaptive')
      console.log(
        `[agent] model=${selectedModel} thinking=${thinking ?? 'adaptive'}`,
      )

      const abortController = signal
        ? new AbortController()
        : undefined

      // Forward external signal to our controller
      if (signal && abortController) {
        signal.addEventListener('abort', () => abortController.abort(), {
          once: true,
        })
      }

      const q = query({
        prompt: message,
        options: {
          systemPrompt,
          model: selectedModel,
          maxThinkingTokens,
          tools: [],
          mcpServers: { [serverName]: mcpServer },
          allowedTools,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          includePartialMessages: true,
          maxTurns: 10,
          persistSession: false,
          env: { ...process.env, CLAUDECODE: undefined },
          stderr: (data: string) => console.error('[sdk stderr]', data),
          abortController,
        },
      })

      for await (const msg of q) {
        if (signal?.aborted) break
        const result = mapSdkMessage(msg)
        if (result) {
          if (Array.isArray(result)) {
            for (const event of result) {
              yield event
            }
          } else {
            yield result
          }
        }
      }
    },
  }
}
