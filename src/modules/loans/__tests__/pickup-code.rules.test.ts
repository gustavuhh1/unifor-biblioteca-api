import { describe, expect, it } from 'vitest'
import {
  generatePickupCode,
  generateQrToken,
} from '../rules/pickup-code.rules.js'

describe('código de retirada (generatePickupCode)', () => {
  it('é "RET-" mais 4 dígitos, com zeros à esquerda', () => {
    expect(generatePickupCode(new Set(), () => 4821)).toBe('RET-4821')
    expect(generatePickupCode(new Set(), () => 7)).toBe('RET-0007')
    expect(generatePickupCode(new Set(), () => 0)).toBe('RET-0000')
  })

  it('sorteia entre 0 e 9999', () => {
    let received = 0
    generatePickupCode(new Set(), (max) => {
      received = max
      return 0
    })

    expect(received).toBe(10000)
  })

  it('pula para o próximo código livre quando o sorteado já está em uso', () => {
    const taken = new Set(['RET-4821', 'RET-4822'])

    expect(generatePickupCode(taken, () => 4821)).toBe('RET-4823')
  })

  it('volta ao início depois do 9999', () => {
    const taken = new Set(['RET-9999'])

    expect(generatePickupCode(taken, () => 9999)).toBe('RET-0000')
  })

  it('só falha quando os 10.000 códigos estão em uso', () => {
    const all = new Set(
      Array.from(
        { length: 10000 },
        (_, i) => `RET-${String(i).padStart(4, '0')}`,
      ),
    )

    expect(() => generatePickupCode(all, () => 0)).toThrow(/em uso/)
    all.delete('RET-5000')
    expect(generatePickupCode(all, () => 0)).toBe('RET-5000')
  })
})

describe('segredo do QR (generateQrToken)', () => {
  it('tem 192 bits, em base64url', () => {
    const token = generateQrToken((size) => new Uint8Array(size).fill(255))

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    // 24 bytes = 192 bits = 32 caracteres base64url (acima dos 128 bits pedidos).
    expect(token).toHaveLength(32)
  })

  it('pede 24 bytes ao gerador', () => {
    let asked = 0
    generateQrToken((size) => {
      asked = size
      return new Uint8Array(size)
    })

    expect(asked).toBe(24)
  })

  it('dois sorteios diferentes dão segredos diferentes', () => {
    const a = generateQrToken((size) => new Uint8Array(size).fill(1))
    const b = generateQrToken((size) => new Uint8Array(size).fill(2))

    expect(a).not.toBe(b)
  })
})
