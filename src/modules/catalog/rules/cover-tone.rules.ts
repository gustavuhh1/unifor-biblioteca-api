import { COVER_TONE_COUNT } from '../catalog.constants.js'

// Cor da capa gerada (books.coverTone, de 1 a 6), derivada do workId: o mesmo
// título tem sempre a mesma cor, em qualquer instância da API.
export function coverToneOf(workId: string): number {
  let hash = 0
  for (const char of workId) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }
  return (hash % COVER_TONE_COUNT) + 1
}
