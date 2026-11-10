// Gera scripts/data/catalog.json: o acervo de uma biblioteca universitária para
// o seed, com dados reais de edições em português (Open Library e BrasilAPI).
//   npm run seed:catalog
// Só lê as fontes externas e grava o JSON; não toca no banco. Rodar de novo
// troca o arquivo inteiro (confira o git diff antes do commit).
import { writeFile } from 'node:fs/promises'
import { fetchSource } from '../../../src/modules/catalog/book-metadata/fetch-source.js'
import {
  BOOK_METADATA_USER_AGENT,
  LOOKUP_STATUS,
  OPEN_LIBRARY_BASE_URL,
} from '../../../src/modules/catalog/catalog.constants.js'
import { lookupBookMetadata } from '../../../src/modules/catalog/services/book-metadata.service.js'
import { SYNC_PAUSE_MS } from '../../catalog-sync/run.js'
import { BOOKS } from '../data.js'
import { CATALOG_AREAS, type CatalogArea } from './areas.js'
import { CATALOG_JSON_URL, loadCatalog } from './load.js'
import {
  FIRST_CATALOG_REGISTRATION,
  isSameBook,
  isUsableCoverSource,
  MIN_COVER_BYTES,
  pickBrazilianIsbn,
  toCatalogBook,
  type CatalogBookSpec,
} from './rules.js'

const SOURCE = 'Open Library (busca)'
// Páginas de 100 resultados lidas por busca, no máximo.
const MAX_PAGES = 5

interface SearchDoc {
  title?: string
  isbn?: string[]
  cover_i?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Uma página da busca da Open Library, só com edições em português.
async function searchPage(query: string, page: number): Promise<SearchDoc[]> {
  const q = encodeURIComponent(`${query} language:por`)
  const outcome = await fetchSource(
    SOURCE,
    `${OPEN_LIBRARY_BASE_URL}/search.json?q=${q}&fields=title,isbn,cover_i&limit=100&page=${page}`,
    { timeoutMs: 30000 },
  )
  if (outcome.kind !== 'ok') return []
  const docs = (outcome.body as { docs?: SearchDoc[] }).docs
  return Array.isArray(docs) ? docs : []
}

// ISBNs brasileiros com capa que as buscas da área encontram, sem repetir.
async function discoverIsbns(area: CatalogArea): Promise<string[]> {
  const found = new Set<string>()
  for (const query of area.queries) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const docs = await searchPage(query, page)
      await sleep(SYNC_PAUSE_MS)
      for (const doc of docs) {
        if (!doc.cover_i) continue
        const isbn = pickBrazilianIsbn(doc.isbn ?? [])
        if (isbn) found.add(isbn)
      }
      if (docs.length < 100 || found.size >= area.target * 5) break
    }
    if (found.size >= area.target * 5) break
  }
  return [...found]
}

// A capa é uma capa de verdade. Pelos metadados da Open Library, recusa a página
// de título escaneada e a miniatura pequena (isUsableCoverSource); pelo arquivo
// M, recusa a imagem em branco e a folha de rosto lisa (abaixo de MIN_COVER_BYTES).
async function isRealCover(coverUrl: string): Promise<boolean> {
  const fetchOptions = {
    headers: { 'user-agent': BOOK_METADATA_USER_AGENT },
    signal: AbortSignal.timeout(30000),
  }
  try {
    const id = /\/b\/id\/(\d+)-[SML]\.jpg$/.exec(coverUrl)?.[1]
    if (id) {
      const meta = await fetch(
        `https://covers.openlibrary.org/b/id/${id}.json`,
        fetchOptions,
      )
      if (
        !meta.ok ||
        !isUsableCoverSource(
          (await meta.json()) as { width?: number; source_url?: string },
        )
      )
        return false
    }
    const image = await fetch(coverUrl.replace(/-L\.jpg$/, '-M.jpg'), {
      ...fetchOptions,
      signal: AbortSignal.timeout(30000),
    })
    if (!image.ok) return false
    return (await image.arrayBuffer()).byteLength >= MIN_COVER_BYTES
  } catch {
    return false
  }
}

// Capa da Open Library pelo título e autor (para os livros da seção 6.2 sem ISBN).
// Usa os campos title e author da busca (o título vai como está, com vírgulas e
// "Vol."), prefere a edição em português e aceita outra língua se não houver. Só
// aceita o resultado que for o mesmo livro (isSameBook) e tiver capa de verdade.
async function coverByTitle(
  title: string,
  author?: string,
): Promise<string | null> {
  const fields = 'title,author_name,cover_i,language'
  const params = new URLSearchParams({ title, fields, limit: '20' })
  // "Gamma et al." e sobrenomes soltos atrapalham: vai só a última palavra útil.
  const surname = author
    ?.replace(/et al\.?/i, '')
    .trim()
    .split(/\s+/)
    .pop()
  if (surname) params.set('author', surname)
  // Segunda tentativa: busca livre com título e sobrenome (acha edições cujo
  // título na fonte está escrito diferente, como "Cálculo - Volume 1").
  const loose = new URLSearchParams({
    q: `${title.replace(/[,.]/g, ' ')} ${surname ?? ''}`.trim(),
    fields,
    limit: '20',
  })
  for (const query of [params, loose]) {
    const outcome = await fetchSource(
      SOURCE,
      `${OPEN_LIBRARY_BASE_URL}/search.json?${query.toString()}`,
      { timeoutMs: 30000 },
    )
    if (outcome.kind !== 'ok') continue
    const docs = (
      (
        outcome.body as {
          docs?: (SearchDoc & { language?: string[]; author_name?: string[] })[]
        }
      ).docs ?? []
    ).filter(
      (doc) =>
        doc.cover_i &&
        isSameBook(
          { title, author },
          { title: doc.title, authors: doc.author_name },
        ),
    )
    // Português primeiro; depois as outras línguas, até achar uma capa real.
    const ordered = [
      ...docs.filter((doc) => doc.language?.includes('por')),
      ...docs.filter((doc) => !doc.language?.includes('por')),
    ]
    for (const doc of ordered) {
      const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      if (await isRealCover(url)) return url
    }
    await sleep(SYNC_PAUSE_MS)
  }
  return null
}

// Capas dos livros da seção 6.2: pelo ISBN quando há, senão pelo título.
async function findDemoCovers(): Promise<Record<string, string>> {
  const demoCovers: Record<string, string> = {}
  for (const book of BOOKS) {
    let cover: string | null = null
    if (book.isbn) {
      const lookup = await lookupBookMetadata(book.isbn)
      const url =
        lookup.status === LOOKUP_STATUS.found ? lookup.data.coverUrl : undefined
      if (url && (await isRealCover(url))) cover = url
    }
    if (!cover) {
      await sleep(SYNC_PAUSE_MS)
      cover = await coverByTitle(book.title, book.authors[0])
    }
    await sleep(SYNC_PAUSE_MS)
    if (cover) demoCovers[book.key] = cover
    console.log(`Capa de "${book.title}": ${cover ? 'achada' : 'não achada'}`)
  }
  return demoCovers
}

// --only-demo-covers: refaz só as capas da seção 6.2 no JSON que já existe.
async function refreshDemoCovers() {
  const catalog = await loadCatalog()
  if (!catalog) throw new Error('Rode antes npm run seed:catalog sem opção.')
  catalog.demoCovers = await findDemoCovers()
  await writeFile(
    CATALOG_JSON_URL,
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  )
  console.log(
    `Gravado: ${Object.keys(catalog.demoCovers).length} capas da seção 6.2.`,
  )
}

async function main() {
  const seenIsbns = new Set(BOOKS.map((book) => book.isbn).filter(Boolean))
  const seenWorks = new Set(BOOKS.map((book) => book.workId))
  const books: CatalogBookSpec[] = []
  let registration = FIRST_CATALOG_REGISTRATION

  for (const area of CATALOG_AREAS) {
    const isbns = await discoverIsbns(area)
    let added = 0
    for (const isbn of isbns) {
      if (added >= area.target) break
      if (seenIsbns.has(isbn)) continue
      seenIsbns.add(isbn)

      const lookup = await lookupBookMetadata(isbn)
      await sleep(SYNC_PAUSE_MS)
      if (lookup.status !== LOOKUP_STATUS.found) continue

      const book = toCatalogBook({
        area,
        isbn,
        metadata: lookup.data,
        sources: lookup.sources,
        ...(lookup.openLibraryKey
          ? { openLibraryKey: lookup.openLibraryKey }
          : {}),
        index: books.length,
        firstRegistration: registration,
      })
      if (!book || seenWorks.has(book.workId)) continue
      if (!(await isRealCover(book.coverUrl))) continue
      seenWorks.add(book.workId)
      books.push(book)
      registration += book.copies.length
      added++
    }
    console.log(
      `${area.label}: ${added} de ${area.target} títulos (${isbns.length} ISBNs achados)`,
    )
  }

  const demoCovers = await findDemoCovers()

  const copies = books.reduce((total, book) => total + book.copies.length, 0)
  const json = {
    generatedAt: new Date().toISOString(),
    source: 'Open Library e BrasilAPI (npm run seed:catalog)',
    demoCovers,
    books,
  }
  await writeFile(
    CATALOG_JSON_URL,
    `${JSON.stringify(json, null, 2)}\n`,
    'utf8',
  )
  console.log(
    `Gravado: ${books.length} títulos, ${copies} exemplares, ${Object.keys(demoCovers).length} capas da seção 6.2.`,
  )
}

await (process.argv.includes('--only-demo-covers')
  ? refreshDemoCovers()
  : main())
