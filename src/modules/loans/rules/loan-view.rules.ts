import { isoOrNull } from '../../../shared/iso-date.js'
import { isOverdue } from '../../../shared/time.js'
import {
  LOAN_STATUS,
  OPEN_LOAN_STATUSES,
  type LoanRecord,
} from '../../../shared/types/index.js'
import { LOAN_DISPLAY_STATE, LOAN_VIEW } from '../loans.constants.js'
import type {
  LoanDisplayState,
  LoanResponse,
  LoanView,
  RenewalDenialReason,
} from '../loans.types.js'

// Como Meus empréstimos mostra um pedido ou empréstimo (RF-EMP-08, RF-SIS-03). O
// estado e o progresso são calculados na hora, a partir de `at`; nenhum é gravado.

const DAY_MS = 24 * 60 * 60 * 1000

// Estado mostrado ao aluno. Pedido para retirar: Pronto para retirar. Empréstimo
// ativo: Atrasado (vencimento já passou), Vence em breve (faltam até `dueSoonDays`
// dias) ou Em andamento. Os demais repetem o status gravado.
export function displayStateOf(
  loan: Pick<LoanRecord, 'status' | 'dueAt'>,
  at: Date,
  dueSoonDays: number,
): LoanDisplayState {
  switch (loan.status) {
    case LOAN_STATUS.awaitingPickup:
      return LOAN_DISPLAY_STATE.readyForPickup
    case LOAN_STATUS.returned:
      return LOAN_DISPLAY_STATE.returned
    case LOAN_STATUS.expired:
      return LOAN_DISPLAY_STATE.expired
    case LOAN_STATUS.cancelled:
      return LOAN_DISPLAY_STATE.cancelled
    case LOAN_STATUS.active: {
      if (!loan.dueAt) return LOAN_DISPLAY_STATE.inProgress
      if (isOverdue(loan.dueAt, at)) return LOAN_DISPLAY_STATE.overdue
      return loan.dueAt.getTime() - at.getTime() <= dueSoonDays * DAY_MS
        ? LOAN_DISPLAY_STATE.dueSoon
        : LOAN_DISPLAY_STATE.inProgress
    }
  }
}

// Quanto do prazo já passou, de 0 a 1. Pedido para retirar: do pedido até o fim do
// prazo de retirada. Empréstimo ativo: da retirada até o vencimento. Itens do
// histórico não têm progresso (null).
export function progressOf(
  loan: Pick<
    LoanRecord,
    'status' | 'requestedAt' | 'pickupDeadline' | 'pickedUpAt' | 'dueAt'
  >,
  at: Date,
): number | null {
  let from: Date
  let to: Date
  if (loan.status === LOAN_STATUS.awaitingPickup) {
    from = loan.requestedAt
    to = loan.pickupDeadline
  } else if (loan.status === LOAN_STATUS.active && loan.dueAt) {
    from = loan.pickedUpAt ?? loan.requestedAt
    to = loan.dueAt
  } else {
    return null
  }
  const total = to.getTime() - from.getTime()
  if (total <= 0) return 1
  const done = (at.getTime() - from.getTime()) / total
  return Math.min(1, Math.max(0, done))
}

// Diz se o pedido aparece na aba pedida: `active` traz o que está em andamento
// (aguardando retirada e ativo); `history`, o resto (devolvido, expirado, cancelado).
export function belongsToView(
  loan: Pick<LoanRecord, 'status'>,
  view: LoanView,
): boolean {
  const inProgress = OPEN_LOAN_STATUSES.some((status) => status === loan.status)
  return view === LOAN_VIEW.active ? inProgress : !inProgress
}

// Monta o pedido ou empréstimo da resposta. `renewalDenial` é o motivo de a
// renovação ser negada, ou null se pode renovar (só faz sentido para empréstimo
// ativo; nos outros itens canRenew é sempre false). O código curto e o segredo do QR
// só saem enquanto o pedido espera a retirada.
export function toLoanResponse(
  loan: LoanRecord,
  context: {
    at: Date
    dueSoonDays: number
    renewalDenial: RenewalDenialReason | null
  },
): LoanResponse {
  const { at, dueSoonDays, renewalDenial } = context
  const waiting = loan.status === LOAN_STATUS.awaitingPickup
  const active = loan.status === LOAN_STATUS.active
  return {
    id: loan.id,
    bookId: loan.bookId,
    bookTitle: loan.bookTitle,
    bookShelf: loan.bookShelf,
    status: loan.status,
    state: displayStateOf(loan, at, dueSoonDays),
    requestedAt: loan.requestedAt.toISOString(),
    pickupDeadline: loan.pickupDeadline.toISOString(),
    pickupCode: waiting ? loan.pickupCode : null,
    qrToken: waiting ? loan.qrToken : null,
    pickedUpAt: isoOrNull(loan.pickedUpAt),
    dueAt: isoOrNull(loan.dueAt),
    originalDueAt: isoOrNull(loan.originalDueAt),
    renewalCount: loan.renewalCount,
    canRenew: active && renewalDenial === null,
    renewalDenialReason: active ? renewalDenial : null,
    progress: progressOf(loan, at),
    returnedAt: isoOrNull(loan.returnedAt),
    cancelledAt: isoOrNull(loan.cancelledAt),
    expiredAt: isoOrNull(loan.expiredAt),
  }
}
