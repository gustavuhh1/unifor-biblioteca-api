import { describe, expect, it } from 'vitest'
import {
  deskLookupBodySchema,
  pickupsQuerySchema,
  returnLoanBodySchema,
} from '../schemas/request.schemas.js'

describe('corpo da ficha (deskLookupBodySchema)', () => {
  it('aceita exatamente um dos três jeitos de achar o aluno', () => {
    expect(deskLookupBodySchema.parse({ qrToken: 'abc' })).toEqual({
      qrToken: 'abc',
    })
    expect(deskLookupBodySchema.parse({ pickupCode: 'RET-4821' })).toEqual({
      pickupCode: 'RET-4821',
    })
    expect(deskLookupBodySchema.parse({ matricula: '2412858' })).toEqual({
      matricula: '2412858',
    })
  })

  it('aceita o código do pedido em minúsculas e com espaços nas pontas', () => {
    expect(
      deskLookupBodySchema.parse({ pickupCode: ' ret-4821 ' }).pickupCode,
    ).toBe('ret-4821')
  })

  it('recusa corpo vazio e mais de um jeito ao mesmo tempo', () => {
    expect(deskLookupBodySchema.safeParse({}).success).toBe(false)
    expect(
      deskLookupBodySchema.safeParse({
        qrToken: 'abc',
        matricula: '2412858',
      }).success,
    ).toBe(false)
  })

  it.each([
    { pickupCode: 'RET-48' },
    { pickupCode: '4821' },
    { pickupCode: 'RET-48211' },
    { matricula: '241285' },
    { qrToken: '' },
    { qrToken: 'x'.repeat(201) },
  ])('recusa %j', (body) => {
    expect(deskLookupBodySchema.safeParse(body).success).toBe(false)
  })
})

describe('corpo da devolução (returnLoanBodySchema)', () => {
  it('"Multa paga agora" vem desligada por padrão', () => {
    expect(returnLoanBodySchema.parse({})).toEqual({ finePaidNow: false })
  })

  it('aceita ligar a chave e recusa o que não é verdadeiro ou falso', () => {
    expect(returnLoanBodySchema.parse({ finePaidNow: true })).toEqual({
      finePaidNow: true,
    })
    expect(returnLoanBodySchema.safeParse({ finePaidNow: 'sim' }).success).toBe(
      false,
    )
  })
})

describe('busca da lista Retiradas (pickupsQuerySchema)', () => {
  it('aceita de 1 a 7 dígitos da matrícula, ou nada', () => {
    expect(pickupsQuerySchema.parse({})).toEqual({})
    expect(pickupsQuerySchema.parse({ matricula: '24' })).toEqual({
      matricula: '24',
    })
    expect(pickupsQuerySchema.parse({ matricula: ' 2412858 ' })).toEqual({
      matricula: '2412858',
    })
  })

  it.each(['24128588', 'abc', '24a'])('recusa %j', (matricula) => {
    expect(pickupsQuerySchema.safeParse({ matricula }).success).toBe(false)
  })
})
