import { ConvexClient } from 'convex/browser'
import type { ConvexHandler } from './types'

/**
 * Execute a Convex tool — calls a Convex function by untyped string path.
 *
 * Uses ConvexClient with dynamic function references (bypasses typed `api.*`).
 */
export async function executeConvex(
  convex: ConvexClient,
  handler: ConvexHandler,
  input: Record<string, unknown>,
): Promise<string> {
  const args = { ...handler.staticArgs, ...input }

  // Use anyApi-style dynamic reference: convex.query/mutation/action accept
  // a FunctionReference which can be created from a string path at runtime.
  // ConvexClient doesn't expose a direct string-path API, so we create
  // a minimal FunctionReference-compatible object.
  const fnRef = {
    _type: 'function_reference' as const,
    _name: handler.functionPath,
  } as any

  // Try query first, fall back to mutation, then action
  // In practice, the function type should be known — but for a generic bridge,
  // we try all three. The ConvexClient will throw on wrong type.
  try {
    const result = await convex.query(fnRef, args)
    return typeof result === 'string' ? result : JSON.stringify(result)
  } catch {
    try {
      const result = await convex.mutation(fnRef, args)
      return typeof result === 'string' ? result : JSON.stringify(result)
    } catch {
      const result = await convex.action(fnRef, args)
      return typeof result === 'string' ? result : JSON.stringify(result)
    }
  }
}
