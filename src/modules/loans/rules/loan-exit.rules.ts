// Pedidos cancelados/expirados e empréstimos devolvidos liberam vagas do limite
// do aluno. Nunca deixa o agregado negativo, mesmo se um dado antigo estiver
// inconsistente.
export function activeLoanCountAfter(
  current: number,
  freed: number = 1,
): number {
  return Math.max(0, current - freed)
}
