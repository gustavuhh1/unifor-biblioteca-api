import type { Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AppError } from '../shared/errors.js'
import { errorHandler, notFoundHandler } from './error-handler.js'

function fakeResponse() {
  return {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }
}

function handle(error: unknown) {
  const res = fakeResponse()
  errorHandler(error, {} as Request, res as unknown as Response, vi.fn())
  return res
}

describe('tratamento de erros (errorHandler)', () => {
  it('responde um AppError com o seu status, code e message', () => {
    const res = handle(
      new AppError(409, 'duplicate', 'Matrícula já cadastrada.'),
    )

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      code: 'duplicate',
      message: 'Matrícula já cadastrada.',
    })
  })

  it('acrescenta ao corpo os campos extras de um AppError', () => {
    const res = handle(
      new AppError(409, 'signup_conflict', 'Já cadastrado.', {
        fields: [{ field: 'matricula', message: 'Matrícula já cadastrada.' }],
      }),
    )

    expect(res.json).toHaveBeenCalledWith({
      code: 'signup_conflict',
      message: 'Já cadastrado.',
      fields: [{ field: 'matricula', message: 'Matrícula já cadastrada.' }],
    })
  })

  it('envia Retry-After quando o erro diz quando tentar de novo', () => {
    const res = handle(
      new AppError(429, 'token_resend_too_soon', 'Aguarde.', {
        retryAfterSeconds: 42,
      }),
    )

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.set).toHaveBeenCalledWith('Retry-After', '42')
    expect(res.json).toHaveBeenCalledWith({
      code: 'token_resend_too_soon',
      message: 'Aguarde.',
      retryAfterSeconds: 42,
    })
  })

  it('transforma erros de validação do Zod em 400 com os campos errados', () => {
    const parsed = z
      .object({
        matricula: z.string().length(7, 'A matrícula tem 7 dígitos.'),
      })
      .safeParse({ matricula: '12' })
    const res = handle(parsed.error)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      code: 'validation_error',
      message: 'Dados inválidos.',
      fields: [{ field: 'matricula', message: 'A matrícula tem 7 dígitos.' }],
    })
  })

  it('transforma um corpo JSON malformado em 400', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed',
    })
    const res = handle(error)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      code: 'invalid_json',
      message: 'O corpo da requisição não é um JSON válido.',
    })
  })

  it('esconde os detalhes de um erro inesperado atrás de um 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = handle(new Error('connection string with details'))

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      code: 'internal_error',
      message: 'Erro interno. Tente novamente em instantes.',
    })
  })
})

describe('rota inexistente (notFoundHandler)', () => {
  it('responde 404 em JSON', () => {
    const res = fakeResponse()

    notFoundHandler({} as Request, res as unknown as Response, vi.fn())

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      code: 'not_found',
      message: 'Recurso não encontrado.',
    })
  })
})
