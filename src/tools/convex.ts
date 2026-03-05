import { ConvexClient } from 'convex/browser'
import type { ConvexHandler } from './types'

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * Execute a Convex tool — calls a Convex function by untyped string path.
 */
export async function executeConvex(
  convex: ConvexClient,
  handler: ConvexHandler,
  input: Record<string, unknown>,
): Promise<string> {
  const args = { ...handler.staticArgs, ...input }

  const fnRef = {
    _type: 'function_reference' as const,
    _name: handler.functionPath,
  } as any

  const fnType = handler.functionType ?? 'query'
  const result = await (convex as any)[fnType](fnRef, args)
  return stringify(result)
}
