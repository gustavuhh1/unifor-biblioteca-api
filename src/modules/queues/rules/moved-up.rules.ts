import type { QueueEntryRecord } from '../../../shared/types/index.js'

// Quem sobe na fila quando alguém à frente sai (RF-AVI-01, tipo `queue_moved_up`).
// Função pura: a posição nunca é gravada, é a ordem da fila ativa.

// Um lugar que subiu e a posição que ele passou a ter.
export interface MovedUp {
  entry: QueueEntryRecord
  position: number
}

// Quem fica atrás do lugar que saiu. `queue` é a fila ativa da edição em ordem,
// com o lugar que saiu ainda nela; a posição nova de cada um é uma a menos do que
// era. `skip` tira da lista quem já recebe outro aviso por causa da mesma saída
// (quem ganhou a vez recebe "É a sua vez", não "Você subiu").
export function movedUpAfterExit(
  queue: readonly QueueEntryRecord[],
  exitedId: string,
  skip: ReadonlySet<string> = new Set(),
): MovedUp[] {
  const exitedIndex = queue.findIndex((entry) => entry.id === exitedId)
  if (exitedIndex === -1) return []
  return queue
    .slice(exitedIndex + 1)
    .map((entry, index) => ({ entry, position: exitedIndex + 1 + index }))
    .filter(({ entry }) => !skip.has(entry.id))
}
