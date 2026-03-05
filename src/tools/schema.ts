import { z } from 'zod'
import type { JsonSchema, JsonSchemaProperty } from './types'

/**
 * Convert a JSON Schema property to a Zod schema.
 */
function propertyToZod(prop: JsonSchemaProperty): z.ZodTypeAny {
  let schema: z.ZodTypeAny

  switch (prop.type) {
    case 'string':
      schema = prop.enum
        ? z.enum(prop.enum as [string, ...string[]])
        : z.string()
      break
    case 'number':
    case 'integer':
      schema = prop.enum ? z.enum(prop.enum.map(String) as [string, ...string[]]).transform(Number) : z.number()
      break
    case 'boolean':
      schema = z.boolean()
      break
    case 'array':
      schema = z.array(prop.items ? propertyToZod(prop.items) : z.unknown())
      break
    case 'object':
      schema = prop.properties
        ? z.object(objectToZodShape(prop.properties, prop.required))
        : z.record(z.unknown())
      break
    default:
      schema = z.unknown()
  }

  if (prop.description) {
    schema = schema.describe(prop.description)
  }

  return schema
}

function objectToZodShape(
  properties: Record<string, JsonSchemaProperty>,
  required?: string[],
): z.ZodRawShape {
  const shape: z.ZodRawShape = {}
  const requiredSet = new Set(required ?? [])

  for (const [key, prop] of Object.entries(properties)) {
    let field = propertyToZod(prop)
    if (!requiredSet.has(key)) {
      field = field.optional()
    }
    shape[key] = field
  }

  return shape
}

/**
 * Convert a JSON Schema object definition to a Zod shape for use with
 * the Agent SDK's `tool()` function.
 */
export function jsonSchemaToZodShape(schema: JsonSchema): z.ZodRawShape {
  return objectToZodShape(schema.properties ?? {}, schema.required)
}
