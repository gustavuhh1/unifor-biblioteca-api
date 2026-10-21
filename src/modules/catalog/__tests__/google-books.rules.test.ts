import { describe, expect, it } from 'vitest'
import {
  applyGoogleLookup,
  mapVolumeInfo,
  stripHtml,
} from '../rules/google-books.rules.js'
import { AT, makeBook } from './book.fixtures.js'

const LATER = new Date('2026-10-22T10:00:00Z')

describe('sinopse sem HTML (stripHtml)', () => {
  it('tira as tags e mantém o texto', () => {
    expect(stripHtml('<p>Um <b>ótimo</b> livro.</p>')).toBe('Um ótimo livro.')
  })

  it('transforma <br> e fim de parágrafo em quebra de linha', () => {
    expect(stripHtml('<p>Primeiro.</p><p>Segundo.<br>Terceiro.</p>')).toBe(
      'Primeiro.\nSegundo.\nTerceiro.',
    )
  })

  it('troca as entidades HTML mais comuns', () => {
    expect(
      stripHtml('Tom &amp; Jerry &quot;juntos&quot; &#39;sempre&#39;'),
    ).toBe('Tom & Jerry "juntos" \'sempre\'')
  })
})

describe('mapeamento do Google Books (mapVolumeInfo)', () => {
  const volumeInfo = {
    title: 'Código Limpo',
    subtitle: 'habilidades práticas do agile software',
    authors: ['Robert C. Martin'],
    publisher: 'Alta Books',
    publishedDate: '2011-03-01',
    description: '<p>Mostra como escrever <b>código</b> limpo.</p>',
    categories: ['Computers', 'Software'],
    language: 'pt',
    imageLinks: { thumbnail: 'http://books.google.com/capa.jpg' },
  }

  it('mapeia todos os campos do livro', () => {
    expect(mapVolumeInfo(volumeInfo)).toEqual({
      title: 'Código Limpo',
      subtitle: 'habilidades práticas do agile software',
      authors: ['Robert C. Martin'],
      publisher: 'Alta Books',
      year: 2011,
      synopsis: 'Mostra como escrever código limpo.',
      subjects: ['Computers', 'Software'],
      language: 'Português',
      coverUrl: 'https://books.google.com/capa.jpg',
    })
  })

  it('pega o ano pelos 4 primeiros dígitos, em qualquer formato da data', () => {
    expect(mapVolumeInfo({ publishedDate: '2020' }).year).toBe(2020)
    expect(mapVolumeInfo({ publishedDate: '2012-05' }).year).toBe(2012)
    expect(mapVolumeInfo({ publishedDate: 'sem data' }).year).toBeUndefined()
  })

  it('devolve a capa sempre em https e usa a miniatura pequena se faltar a outra', () => {
    expect(
      mapVolumeInfo({ imageLinks: { smallThumbnail: 'http://x.com/p.jpg' } })
        .coverUrl,
    ).toBe('https://x.com/p.jpg')
    expect(
      mapVolumeInfo({ imageLinks: { thumbnail: 'https://x.com/g.jpg' } })
        .coverUrl,
    ).toBe('https://x.com/g.jpg')
  })

  it('converte o código do idioma, mesmo com região (pt-BR)', () => {
    expect(mapVolumeInfo({ language: 'pt-BR' }).language).toBe('Português')
    expect(mapVolumeInfo({ language: 'en' }).language).toBe('Inglês')
    expect(mapVolumeInfo({ language: 'es' }).language).toBe('Espanhol')
  })

  it('não troca o idioma quando o código é desconhecido', () => {
    expect(mapVolumeInfo({ language: 'fr' })).not.toHaveProperty('language')
  })

  it('só traz o que o Google mandou, sem campos vazios', () => {
    expect(
      mapVolumeInfo({ title: 'Só o título', authors: [], categories: [] }),
    ).toEqual({ title: 'Só o título' })
    expect(mapVolumeInfo({})).toEqual({})
  })

  it('tira espaços e repetições dos textos e das listas', () => {
    expect(
      mapVolumeInfo({
        title: '  Código Limpo ',
        authors: [' Robert C. Martin ', 'Robert C. Martin', ''],
      }),
    ).toEqual({ title: 'Código Limpo', authors: ['Robert C. Martin'] })
  })
})

describe('combinação do salvo com o Google Books (applyGoogleLookup)', () => {
  const saved = makeBook()

  const found = (data: Parameters<typeof mapVolumeInfo>[0]) => ({
    found: true as const,
    volumeId: 'vol999',
    data: mapVolumeInfo(data),
  })

  it('troca só os campos permitidos e grava o googleBooks com a hora real', () => {
    const { update, changedFields } = applyGoogleLookup(
      saved,
      found({
        title: 'Código Limpo 2',
        authors: ['Robert Martin'],
        publisher: 'Outra Editora',
        publishedDate: '2024',
        description: 'Nova sinopse',
        categories: ['Software'],
        language: 'en',
        imageLinks: { thumbnail: 'https://x.com/c.jpg' },
      }),
      LATER,
    )

    expect(update).toMatchObject({
      title: 'Código Limpo 2',
      authors: ['Robert Martin'],
      publisher: 'Outra Editora',
      year: 2024,
      synopsis: 'Nova sinopse',
      subjects: ['Software'],
      language: 'Inglês',
      coverUrl: 'https://x.com/c.jpg',
      googleBooks: { volumeId: 'vol999', lastSyncedAt: LATER, found: true },
      updatedAt: LATER,
    })
    expect(changedFields).toEqual([
      'title',
      'authors',
      'publisher',
      'year',
      'synopsis',
      'coverUrl',
      'subjects',
      'language',
    ])
  })

  it('nunca toca cdu, cutter, shelf, location, exemplares, contadores, workId nem status', () => {
    const { update } = applyGoogleLookup(
      saved,
      found({ title: 'Outro título', authors: ['Outro Autor'] }),
      LATER,
    )

    for (const field of [
      'cdu',
      'cutter',
      'shelf',
      'location',
      'workId',
      'status',
      'copiesTotal',
      'copiesAvailable',
      'queueLength',
      'nextReturnAt',
      'unavailableForNewRequests',
      'isbn',
      'coverTone',
      'createdAt',
      'createdBy',
    ]) {
      expect(update).not.toHaveProperty(field)
    }
    expect({ ...saved, ...update }).toMatchObject({
      cdu: '005.1',
      cutter: 'M386c',
      shelf: 'Estante 005.1',
      workId: 'codigo-limpo--martin',
      copiesTotal: 3,
    })
  })

  it('campo ausente na resposta do Google não apaga o valor salvo', () => {
    const { update, changedFields } = applyGoogleLookup(
      saved,
      found({ title: 'Código Limpo', description: 'Sinopse nova' }),
      LATER,
    )

    expect(changedFields).toEqual(['synopsis'])
    expect(update).not.toHaveProperty('publisher')
    expect(update).not.toHaveProperty('authors')
    expect(update).not.toHaveProperty('year')
    expect(update).not.toHaveProperty('subjects')
    expect(update).not.toHaveProperty('coverUrl')
  })

  it('não lista como mudado o campo que o Google mandou igual ao salvo', () => {
    const { changedFields } = applyGoogleLookup(
      saved,
      found({
        title: saved.title,
        authors: saved.authors,
        publisher: saved.publisher,
      }),
      LATER,
    )

    expect(changedFields).toEqual([])
  })

  it('refaz o texto de busca com os dados novos', () => {
    const { update } = applyGoogleLookup(
      saved,
      found({ title: 'Clean Code', categories: ['Programming'] }),
      LATER,
    )

    expect(update.searchText).toBe(
      'clean code habilidades praticas do agile software robert c. martin programming 9788576082675',
    )
  })

  it('dataSource vira google_books se o Google trouxe título, autores, editora e sinopse', () => {
    const complete = applyGoogleLookup(
      saved,
      found({
        title: 'A',
        authors: ['B'],
        publisher: 'C',
        description: 'D',
      }),
      LATER,
    )
    const partial = applyGoogleLookup(
      saved,
      found({ title: 'A', authors: ['B'], publisher: 'C' }),
      LATER,
    )

    expect(complete.update.dataSource).toBe('google_books')
    expect(partial.update.dataSource).toBe('mixed')
  })

  it('ISBN não encontrado só atualiza o googleBooks e não altera mais nada', () => {
    const { update, changedFields } = applyGoogleLookup(
      saved,
      { found: false },
      LATER,
    )

    expect(update).toEqual({
      googleBooks: { volumeId: 'vol123', lastSyncedAt: LATER, found: false },
      updatedAt: LATER,
    })
    expect(changedFields).toEqual([])
  })

  it('ISBN não encontrado num livro que nunca foi consultado deixa o volumeId nulo', () => {
    const { update } = applyGoogleLookup(
      makeBook({ googleBooks: undefined }),
      { found: false },
      AT,
    )

    expect(update.googleBooks).toEqual({
      volumeId: null,
      lastSyncedAt: AT,
      found: false,
    })
  })
})
