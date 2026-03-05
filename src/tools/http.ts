import type { HttpHandler } from './types'

/**
 * Execute an HTTP tool — calls fetch with URL template substitution,
 * optional query params, auth headers, and JSON body.
 */
export async function executeHttp(
  handler: HttpHandler,
  input: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<string> {
  const method = handler.method ?? 'GET'

  // Substitute {param} placeholders in URL template
  let url = handler.url.replace(/\{(\w+)\}/g, (_, key) => {
    const val = input[key]
    return val != null ? encodeURIComponent(String(val)) : ''
  })

  // Append static query params
  if (handler.queryParams) {
    const params = new URLSearchParams(handler.queryParams)
    const separator = url.includes('?') ? '&' : '?'
    url += separator + params.toString()
  }

  // Build body for methods that support it
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method)
  const sendBody = handler.sendBody ?? hasBody
  const body = sendBody ? JSON.stringify(input) : undefined

  // Build headers — only set Content-Type when sending a body
  const headers: Record<string, string> = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...handler.headers,
  }

  // Auth header from the auth record
  if (handler.authHeader && handler.authKey) {
    const token = auth[handler.authKey]
    if (token) {
      headers[handler.authHeader] = token
    }
  }

  const response = await fetch(url, { method, headers, body })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`)
  }

  return text
}
