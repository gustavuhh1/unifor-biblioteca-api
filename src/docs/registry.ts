import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

// Adds `.openapi()` to Zod schemas. Import this file before building schemas that use it.
extendZodWithOpenApi(z)

// Every route is documented here, from the same Zod schemas that validate it.
export const registry = new OpenAPIRegistry()
