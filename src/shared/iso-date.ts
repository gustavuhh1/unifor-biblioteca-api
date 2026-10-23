import { z } from 'zod'

// Data em ISO 8601 (UTC) nas respostas da API. Todo schema de saída usa este.
export const isoDateSchema = z.iso.datetime()

// A data em ISO 8601, ou null quando o documento ainda não a tem.
export function isoOrNull(date: Date | undefined): string | null {
  return date ? date.toISOString() : null
}
