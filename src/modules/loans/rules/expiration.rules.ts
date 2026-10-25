import { LOAN_STATUS, type LoanRecord } from '../../../shared/types/index.js'

// Quando um pedido não retirado expira (RF-EMP-06). Função pura.

// O pedido ainda aguarda a retirada e o prazo (fechamento do 2º dia útil) passou.
// No instante exato do prazo ainda dá tempo.
export function isPickupExpired(
  loan: Pick<LoanRecord, 'status' | 'pickupDeadline'>,
  at: Date,
): boolean {
  return (
    loan.status === LOAN_STATUS.awaitingPickup &&
    loan.pickupDeadline.getTime() < at.getTime()
  )
}
