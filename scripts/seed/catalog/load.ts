import { readFile } from 'node:fs/promises'
import type { CatalogBookSpec } from './rules.js'

// Onde fica o acervo gerado por `npm run seed:catalog`.
export const CATALOG_JSON_URL = new URL(
  '../../data/catalog.json',
  import.meta.url,
)

// O acervo gerado: os livros novos e as capas dos livros da seção 6.2.
export interface CatalogData {
  // Quando as fontes foram consultadas (vira o lastSyncedAt dos livros).
  generatedAt: string
  // Capa de cada livro da seção 6.2, pela chave do livro.
  demoCovers: Record<string, string>
  books: CatalogBookSpec[]
}

// Lê o acervo gerado. Sem o arquivo, o seed segue só com os livros da seção 6.2.
export async function loadCatalog(
  url: URL = CATALOG_JSON_URL,
): Promise<CatalogData | undefined> {
  const text = await readFile(url, 'utf8').catch(() => undefined)
  return text ? (JSON.parse(text) as CatalogData) : undefined
}
