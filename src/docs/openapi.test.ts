import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from './openapi.js'

describe('buildOpenApiDocument', () => {
  const document = buildOpenApiDocument()

  it('documents GET /health', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.paths?.['/health']?.get?.summary).toBeTruthy()
  })

  it('builds the health response from the Zod schema', () => {
    expect(document.components?.schemas?.HealthResponse).toMatchObject({
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok'] } },
    })
  })
})
