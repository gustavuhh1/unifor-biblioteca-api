import { AsyncLocalStorage } from 'node:async_hooks'

// Os avisos que a requisição em andamento gravou e que ainda precisam sair por
// push e por e-mail. Quem grava um aviso (`notificationsRepository.create`) o
// anota aqui; o middleware `deliverNotices` entrega a lista antes de responder. O
// AsyncLocalStorage dá a cada requisição a sua lista, sem passar nada pelos
// serviços, e fora de uma requisição (testes, scripts) não faz nada.

export interface PendingNotice {
  uid: string
  id: string
}

const storage = new AsyncLocalStorage<PendingNotice[]>()

// Roda `run` com a lista de avisos pendentes da requisição.
export function runWithDeliveryBatch<T>(
  batch: PendingNotice[],
  run: () => T,
): T {
  return storage.run(batch, run)
}

// Anota um aviso recém-gravado para entrega. Se a transação for desfeita, o aviso
// não existe e a entrega o descarta.
export function enqueueDelivery(notice: PendingNotice): void {
  storage.getStore()?.push(notice)
}
