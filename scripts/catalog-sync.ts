// Importação do acervo pelas fontes externas, Open Library e BrasilAPI (RF-ACE-05).
//   npm run catalog:sync           só no Emulator Suite (padrão)
//   npm run catalog:sync -- --prod produção, com confirmação digitada
// Percorre os livros ativos com ISBN e chama o mesmo serviço da rota
// POST /librarian/books/:bookId/sync, com pausa entre as chamadas. O
// auditLog registra o ator "system".
import { env } from '../src/config/env.js'
import { SYSTEM_ACTOR } from '../src/modules/catalog/catalog.constants.js'
import * as booksRepository from '../src/modules/catalog/repositories/books.repository.js'
import { syncBookMetadata } from '../src/modules/catalog/services/book-metadata.service.js'
import { checkEnvironment, parseCliArgs } from './catalog-sync/cli.js'
import { runCatalogSync } from './catalog-sync/run.js'
import { confirmProduction, useProductionDatabase } from './lib/environment.js'

async function main(): Promise<number> {
  const options = parseCliArgs(process.argv.slice(2))

  const problems = checkEnvironment(options, process.env)
  if (problems.length) {
    for (const problem of problems) console.error(`Erro: ${problem}`)
    return 1
  }

  console.log('1. Ambiente')
  if (options.prod) {
    if (!(await confirmProduction(env.GOOGLE_CLOUD_PROJECT))) {
      console.error('Cancelado: a confirmação não confere. Nada foi gravado.')
      return 1
    }
    useProductionDatabase()
    console.log(`  PRODUÇÃO (projeto ${env.GOOGLE_CLOUD_PROJECT})`)
  } else {
    console.log(
      `  Emulator Suite (Firestore ${process.env.FIRESTORE_EMULATOR_HOST})`,
    )
  }

  console.log('2. Atualização pelas fontes externas')
  const summary = await runCatalogSync({
    listBooks: booksRepository.listActive,
    sync: async (bookId) => {
      const { book, changedFields } = await syncBookMetadata(
        bookId,
        SYSTEM_ACTOR,
      )
      return { found: book.externalMetadata?.found === true, changedFields }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(`  ${line}`),
  })

  console.log('3. Resumo')
  console.log(`  atualizados:                  ${summary.updated}`)
  console.log(`  não encontrados:              ${summary.notFound}`)
  console.log(`  com falha:                    ${summary.failed}`)
  console.log(`  sem ISBN (ignorados):         ${summary.withoutIsbn}`)
  return summary.failed > 0 ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    // Só o nome do erro, nunca a mensagem.
    console.error(
      'A importação falhou:',
      error instanceof Error ? error.name : 'erro inesperado',
    )
    process.exit(1)
  })
