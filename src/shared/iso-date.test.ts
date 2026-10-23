import { describe, expect, it } from 'vitest'
import { isoDateSchema, isoOrNull } from './iso-date.js'

describe('data em ISO 8601 das respostas (isoDateSchema)', () => {
  it('aceita um instante em UTC', () => {
    expect(isoDateSchema.safeParse('2026-10-15T15:00:00.000Z').success).toBe(
      true,
    )
  })

  it('recusa texto que não é data', () => {
    expect(isoDateSchema.safeParse('15/10/2026').success).toBe(false)
  })
})

describe('data ou null (isoOrNull)', () => {
  it('escreve a data em ISO 8601', () => {
    expect(isoOrNull(new Date('2026-10-15T15:00:00Z'))).toBe(
      '2026-10-15T15:00:00.000Z',
    )
  })

  it('devolve null quando o documento não tem a data', () => {
    expect(isoOrNull(undefined)).toBeNull()
  })
})
