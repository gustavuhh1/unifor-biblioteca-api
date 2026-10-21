import { AppError, type FieldError } from '../../shared/errors.js'
import { MARK_UNAVAILABLE_SUGGESTION } from './catalog.constants.js'

// Erros do módulo do acervo. O code é estável e em inglês; a mensagem é mostrada
// ao usuário, em português.

const GOOGLE_BOOKS_UNAVAILABLE_CODE = 'google_books_unavailable'

// 404: o livro não existe ou foi removido do acervo.
export function bookNotFound(): AppError {
  return new AppError(404, 'book_not_found', 'Livro não encontrado.')
}

// 502: o Google Books não respondeu (rede, tempo esgotado, 4xx ou 5xx). Nunca
// leva a URL da consulta, que tem a chave da API (RNF-CON-03).
export function googleBooksUnavailable(): AppError {
  return new AppError(
    502,
    GOOGLE_BOOKS_UNAVAILABLE_CODE,
    'O Google Books não respondeu agora. Tente novamente em instantes.',
  )
}

// Diz se o erro é o google_books_unavailable.
export function isGoogleBooksUnavailable(error: unknown): boolean {
  return (
    error instanceof AppError && error.code === GOOGLE_BOOKS_UNAVAILABLE_CODE
  )
}

// 409: algum registro de exemplar já existe ou está repetido no cadastro.
export function registrationTaken(fields: FieldError[]): AppError {
  return new AppError(
    409,
    'registration_taken',
    fields.length === 1
      ? fields[0]!.message
      : 'Alguns registros de exemplar já existem ou estão repetidos.',
    { fields },
  )
}

// 409: o livro tem exemplar reservado ou emprestado, ou fila (RF-GAC-05). Sugere
// marcar como indisponível para novos pedidos.
export function bookInCirculation(): AppError {
  return new AppError(
    409,
    'book_in_circulation',
    'Este livro tem exemplar reservado ou emprestado, ou fila de espera. Marque-o como indisponível para novos pedidos.',
    { suggestion: MARK_UNAVAILABLE_SUGGESTION },
  )
}

// 422: atualizar pelo Google Books exige o ISBN do livro (RF-GAC-04).
export function isbnRequired(): AppError {
  return new AppError(
    422,
    'isbn_required',
    'Este livro não tem ISBN. Informe o ISBN para atualizar pelo Google Books.',
  )
}
