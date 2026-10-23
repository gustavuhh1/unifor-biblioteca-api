import {
  PICKUP_CODE_DIGITS,
  PICKUP_CODE_PREFIX,
  QR_TOKEN_BYTES,
} from '../loans.constants.js'

// Código de retirada e segredo do QR (RF-EMP-01, RF-EMP-07). A fonte de acaso é
// recebida por parâmetro: a regra é pura e fácil de testar.

// Quantos códigos existem: "RET-0000" a "RET-9999".
const CODE_SPACE = 10 ** PICKUP_CODE_DIGITS

const formatCode = (number: number) =>
  `${PICKUP_CODE_PREFIX}${String(number).padStart(PICKUP_CODE_DIGITS, '0')}`

// Gera o código curto do pedido ("RET-4821"), único entre os pedidos aguardando
// retirada (`taken`). Sorteia um número; se já estiver em uso, segue para o próximo
// livre. `randomInt(max)` devolve um inteiro de 0 a max - 1. Lança erro só se os
// 10.000 códigos estiverem em uso.
export function generatePickupCode(
  taken: ReadonlySet<string>,
  randomInt: (max: number) => number,
): string {
  const start = randomInt(CODE_SPACE)
  for (let step = 0; step < CODE_SPACE; step++) {
    const code = formatCode((start + step) % CODE_SPACE)
    if (!taken.has(code)) return code
  }
  throw new Error('Todos os códigos de retirada estão em uso.')
}

// Gera o segredo do QR da retirada: bytes aleatórios em base64url (192 bits).
// `randomBytes(size)` devolve os bytes sorteados.
export function generateQrToken(
  randomBytes: (size: number) => Uint8Array,
): string {
  return Buffer.from(randomBytes(QR_TOKEN_BYTES)).toString('base64url')
}
