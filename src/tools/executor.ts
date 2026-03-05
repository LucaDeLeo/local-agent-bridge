import type { ConvexClient } from 'convex/browser'
import type { ToolDefinition } from './types'
import { executeStatic } from './static'
import { executeHttp } from './http'
import { executeConvex } from './convex'

export type ExecutorContext = {
  convex: ConvexClient | null
  auth: Record<string, string>
}

/**
 * Create a unified tool executor that dispatches to the correct handler
 * based on the tool definition's handler type.
 */
export function createExecutor(ctx: ExecutorContext) {
  return async (
    tool: ToolDefinition,
    input: Record<string, unknown>,
  ): Promise<string> => {
    const { handler } = tool

    switch (handler.type) {
      case 'static':
        return executeStatic(handler)

      case 'http':
        return executeHttp(handler, input, ctx.auth)

      case 'convex': {
        if (!ctx.convex) {
          throw new Error(
            `Convex tool "${tool.name}" requires a Convex URL in auth.convexUrl`,
          )
        }
        return executeConvex(ctx.convex, handler, input)
      }

      default:
        throw new Error(
          `Unknown handler type: ${(handler as any).type}`,
        )
    }
  }
}
