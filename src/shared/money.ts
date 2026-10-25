// Dinheiro em centavos (inteiro) escrito como o aluno lê: "R$ 6,00".
export function formatMoney(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}
