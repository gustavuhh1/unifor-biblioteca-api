import { AppError, type FieldError } from '../../shared/errors.js'
import { MARK_UNAVAILABLE_SUGGESTION } from './catalog.constants.js'

// Erros do módulo do acervo. O code é estável e em inglês; a mensagem é mostrada
// ao usuário, em português.

const BOOK_METADATA_UNAVAILABLE_CODE = 'book_metadata_unavailable'

// 404: o livro não existe ou foi removido do acervo.
export function bookNotFound(): AppError {
  return new AppError(404, 'book_not_found', 'Livro não encontrado.')
}

// 502: nenhuma fonte externa achou o ISBN e alguma não respondeu (rede, tempo
// esgotado, 429 ou 5xx), então não dá para dizer que o ISBN não existe
// (RNF-CON-03).
export function bookMetadataUnavailable(): AppError {
  return new AppError(
    502,
    BOOK_METADATA_UNAVAILABLE_CODE,
    'As fontes de dados de livros não responderam agora. Tente novamente em instantes.',
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

// 422: atualizar pelas fontes externas exige o ISBN do livro (RF-GAC-04).
export function isbnRequired(): AppError {
  return new AppError(
    422,
    'isbn_required',
    'Este livro não tem ISBN. Informe o ISBN para atualizar os dados do livro.',
  )
}
