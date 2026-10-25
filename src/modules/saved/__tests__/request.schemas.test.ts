import { describe, expect, it } from 'vitest'
import {
  folderBodySchema,
  savedListQuerySchema,
} from '../schemas/request.schemas.js'

describe('nome da pasta (folderBodySchema, RF-SAL-02)', () => {
  it('aceita de 1 a 30 caracteres e ignora os espaços das pontas', () => {
    expect(folderBodySchema.parse({ name: '  Amei!!!  ' }).name).toBe('Amei!!!')
    expect(folderBodySchema.parse({ name: 'a'.repeat(30) }).name).toHaveLength(
      30,
    )
  })

  it('recusa nome vazio ou só com espaços, com mensagem em português', () => {
    const result = folderBodySchema.safeParse({ name: '   ' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Informe o nome da pasta.')
  })

  it('recusa nome com mais de 30 caracteres', () => {
    const result = folderBodySchema.safeParse({ name: 'a'.repeat(31) })

    expect(result.error?.issues[0]?.message).toBe(
      'O nome da pasta deve ter no máximo 30 caracteres.',
    )
  })

  it('recusa corpo sem o nome', () => {
    expect(folderBodySchema.safeParse({}).success).toBe(false)
  })
})

describe('query de Salvos (savedListQuerySchema)', () => {
  it('a pasta é opcional', () => {
    expect(savedListQuerySchema.parse({})).toEqual({})
    expect(savedListQuerySchema.parse({ folderId: 'f1' })).toEqual({
      folderId: 'f1',
    })
  })
})
