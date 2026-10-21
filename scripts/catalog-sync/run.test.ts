import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../src/shared/errors.js'
import { checkEnvironment, parseCliArgs } from './cli.js'
import { runCatalogSync, SYNC_PAUSE_MS, type SyncDeps } from './run.js'

const books = [
  { id: 'b1', title: 'Código Limpo', isbn: '9788576082675' },
  { id: 'b2', title: 'Refatoração', isbn: '9788575227244' },
  { id: 'b3', title: 'Arquitetura Limpa' },
  { id: 'b4', title: 'Algoritmos', isbn: '9788535236996' },
  { id: 'b5', title: 'Code Complete', isbn: '9780735619678' },
]

function makeDeps(sync: SyncDeps['sync']) {
  const log = vi.fn<(line: string) => void>()
  const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue()
  const deps: SyncDeps = {
    listBooks: () => Promise.resolve(books),
    sync,
    sleep,
    log,
  }
  return { deps, log, sleep }
}

describe('importação do acervo (runCatalogSync)', () => {
  it('atualiza cada livro com ISBN e ignora o que não tem', async () => {
    const sync = vi
      .fn<SyncDeps['sync']>()
      .mockResolvedValue({ found: true, changedFields: ['synopsis'] })
    const { deps } = makeDeps(sync)

    const summary = await runCatalogSync(deps)

    expect(sync.mock.calls.map(([id]) => id)).toEqual(['b1', 'b2', 'b4', 'b5'])
    expect(summary).toEqual({
      updated: 4,
      notFound: 0,
      failed: 0,
      withoutIsbn: 1,
    })
  })

  it('conta os ISBN que o Google não encontrou', async () => {
    const sync = vi
      .fn<SyncDeps['sync']>()
      .mockResolvedValueOnce({ found: true, changedFields: [] })
      .mockResolvedValueOnce({ found: false, changedFields: [] })
      .mockResolvedValue({ found: true, changedFields: [] })
    const { deps, log } = makeDeps(sync)

    const summary = await runCatalogSync(deps)

    expect(summary).toMatchObject({ updated: 3, notFound: 1 })
    expect(log).toHaveBeenCalledWith(
      '[2/4] Refatoração (9788575227244): ISBN não encontrado no Google Books',
    )
  })

  it('uma falha não para os outros livros e vai para o resumo', async () => {
    const sync = vi
      .fn<SyncDeps['sync']>()
      .mockResolvedValueOnce({ found: true, changedFields: [] })
      .mockRejectedValueOnce(
        new AppError(502, 'google_books_unavailable', 'indisponível'),
      )
      .mockRejectedValueOnce(new Error('https://x.test/?key=segredo'))
      .mockResolvedValue({ found: true, changedFields: [] })
    const { deps, log } = makeDeps(sync)

    const summary = await runCatalogSync(deps)

    expect(summary).toEqual({
      updated: 2,
      notFound: 0,
      failed: 2,
      withoutIsbn: 1,
    })
    expect(sync).toHaveBeenCalledTimes(4)
    expect(log).toHaveBeenCalledWith(
      '[2/4] Refatoração (9788575227244): falhou (google_books_unavailable)',
    )
  })

  it('nunca escreve a mensagem do erro inesperado no log', async () => {
    const sync = vi
      .fn<SyncDeps['sync']>()
      .mockRejectedValue(new Error('https://x.test/?key=segredo'))
    const { deps, log } = makeDeps(sync)

    await runCatalogSync(deps)

    expect(JSON.stringify(log.mock.calls)).not.toContain('segredo')
  })

  it('faz uma pausa entre as chamadas, mas não antes da primeira nem depois da última', async () => {
    const sync = vi
      .fn<SyncDeps['sync']>()
      .mockResolvedValue({ found: true, changedFields: [] })
    const { deps, sleep } = makeDeps(sync)

    await runCatalogSync(deps)

    expect(sleep).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledWith(SYNC_PAUSE_MS)
  })

  it('usa a pausa informada em vez da padrão', async () => {
    const sync = vi
      .fn<SyncDeps['sync']>()
      .mockResolvedValue({ found: true, changedFields: [] })
    const { deps, sleep } = makeDeps(sync)

    await runCatalogSync({ ...deps, pauseMs: 250 })

    expect(sleep).toHaveBeenCalledWith(250)
  })

  it('não chama o Google quando o acervo não tem livro com ISBN', async () => {
    const sync = vi.fn<SyncDeps['sync']>()
    const { deps } = makeDeps(sync)

    const summary = await runCatalogSync({
      ...deps,
      listBooks: () => Promise.resolve([{ id: 'b3', title: 'Sem ISBN' }]),
    })

    expect(sync).not.toHaveBeenCalled()
    expect(summary).toEqual({
      updated: 0,
      notFound: 0,
      failed: 0,
      withoutIsbn: 1,
    })
  })
})

describe('argumentos do catalog:sync (parseCliArgs)', () => {
  it('por padrão usa o emulador', () => {
    expect(parseCliArgs([])).toEqual({ prod: false })
  })

  it('lê --prod e recusa uma opção desconhecida', () => {
    expect(parseCliArgs(['--prod'])).toEqual({ prod: true })
    expect(() => parseCliArgs(['--production'])).toThrow()
  })
})

describe('conferência do ambiente do catalog:sync (checkEnvironment)', () => {
  const emulatorEnv = {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
    GOOGLE_BOOKS_API_KEY: 'chave-falsa',
  }

  it('aceita o emulador com a chave definida', () => {
    expect(checkEnvironment({ prod: false }, emulatorEnv)).toEqual([])
  })

  it('para quando falta a chave do Google Books, sem mostrar valor algum', () => {
    const problems = checkEnvironment(
      { prod: false },
      {
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
      },
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/GOOGLE_BOOKS_API_KEY não está definida/)
  })

  it('nunca cai na produção quando falta o host do emulador', () => {
    const problems = checkEnvironment(
      { prod: false },
      { GOOGLE_BOOKS_API_KEY: 'chave-falsa' },
    )

    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/FIRESTORE_EMULATOR_HOST/)
  })

  it('não precisa do host do emulador com --prod', () => {
    expect(
      checkEnvironment({ prod: true }, { GOOGLE_BOOKS_API_KEY: 'chave-falsa' }),
    ).toEqual([])
  })
})
