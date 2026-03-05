// ── JSON Schema subset for tool parameter definitions ──

export type JsonSchema = {
  type: 'object'
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

export type JsonSchemaProperty = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: (string | number)[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  default?: unknown
}

// ── Tool handler types ──

export type ConvexHandler = {
  type: 'convex'
  functionPath: string
  /** Convex function type — avoids trial-and-error calls (default: 'query') */
  functionType?: 'query' | 'mutation' | 'action'
  /** Static args merged into tool input before calling Convex */
  staticArgs?: Record<string, unknown>
}

export type HttpHandler = {
  type: 'http'
  /** URL template with `{param}` placeholders substituted from input */
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Header key that receives the auth token */
  authHeader?: string
  /** Key in the auth record to use for this tool's auth */
  authKey?: string
  /** Static query params appended to URL */
  queryParams?: Record<string, string>
  /** Static headers merged into the request */
  headers?: Record<string, string>
  /** Send tool input as JSON body (default: true for POST/PUT/PATCH) */
  sendBody?: boolean
}

export type StaticHandler = {
  type: 'static'
  /** The value to return (will be JSON-stringified) */
  value: unknown
}

export type ToolHandler = ConvexHandler | HttpHandler | StaticHandler

// ── Tool definition (sent from browser in init message) ──

export type ToolDefinition = {
  name: string
  description: string
  parameters: JsonSchema
  handler: ToolHandler
}
