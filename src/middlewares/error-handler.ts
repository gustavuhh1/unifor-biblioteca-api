import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../shared/errors.js'

interface ErrorBody {
  code: string
  message: string
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    code: 'not_found',
    message: 'Recurso não encontrado.',
  } satisfies ErrorBody)
}

// Errors raised by express.json() carry a `type` (see body-parser).
function bodyParserErrorType(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'type' in error
    ? error.type
    : undefined
}

function toErrorResponse(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { code: error.code, message: error.message },
    }
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: { code: 'validation_error', message: 'Dados inválidos.' },
    }
  }

  const type = bodyParserErrorType(error)
  if (type === 'entity.parse.failed') {
    return {
      status: 400,
      body: {
        code: 'invalid_json',
        message: 'O corpo da requisição não é um JSON válido.',
      },
    }
  }
  if (type === 'entity.too.large') {
    return {
      status: 413,
      body: {
        code: 'payload_too_large',
        message: 'O corpo da requisição é grande demais.',
      },
    }
  }

  console.error('Unhandled error:', error)
  return {
    status: 500,
    body: {
      code: 'internal_error',
      message: 'Erro interno. Tente novamente em instantes.',
    },
  }
}

// Express recognizes an error handler by its four parameters.
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  const { status, body } = toErrorResponse(error)
  res.status(status).json(body)
}
