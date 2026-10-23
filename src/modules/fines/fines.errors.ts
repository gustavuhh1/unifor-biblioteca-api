import { AppError } from '../../shared/errors.js'

// Erros do módulo de multas. O code é estável e em inglês; a mensagem é mostrada
// ao usuário, em português.

// 404: a multa não existe (RF-BAL-09).
export function fineNotFound(): AppError {
  return new AppError(404, 'fine_not_found', 'Multa não encontrada.')
}

// 409: a multa ainda está contando, porque o livro não foi devolvido, então não
// dá para registrar o pagamento (RF-BAL-09).
export function fineNotPayable(): AppError {
  return new AppError(
    409,
    'fine_not_payable',
    'Esta multa ainda está contando: o livro não foi devolvido.',
  )
}

// 409: a multa já foi paga (RF-BAL-09).
export function fineAlreadyPaid(): AppError {
  return new AppError(409, 'fine_already_paid', 'Esta multa já foi paga.')
}
