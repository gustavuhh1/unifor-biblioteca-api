import { AppError } from '../../shared/errors.js'

export const deskStudentNotFound = () =>
  new AppError(404, 'student_not_found', 'Aluno não encontrado.')

export const deskLoanNotFound = () =>
  new AppError(404, 'loan_not_found', 'Empréstimo não encontrado.')

export const pickupNotAllowed = () =>
  new AppError(
    409,
    'pickup_not_allowed',
    'Este pedido não está aguardando retirada.',
  )

export const pickupExpired = () =>
  new AppError(
    409,
    'pickup_expired',
    'O prazo de retirada deste pedido já terminou.',
  )

export const pickupBlockedByOverdue = () =>
  new AppError(
    409,
    'overdue',
    'O aluno possui um empréstimo em atraso e não pode retirar outro livro.',
  )

export const returnNotAllowed = () =>
  new AppError(
    409,
    'return_not_allowed',
    'Somente um empréstimo ativo pode ser devolvido.',
  )

export const circulationInconsistent = () =>
  new AppError(
    409,
    'circulation_inconsistent',
    'Os dados do empréstimo, do exemplar ou do aluno estão inconsistentes.',
  )
