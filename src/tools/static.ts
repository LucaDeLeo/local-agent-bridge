import type { StaticHandler } from './types'

/**
 * Execute a static tool — simply returns the configured value.
 */
export function executeStatic(handler: StaticHandler): string {
  return typeof handler.value === 'string'
    ? handler.value
    : JSON.stringify(handler.value)
}
