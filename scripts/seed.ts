// Carga do banco: docs/modelo-de-dados-firestore.md, seção 8.
//   npm run seed                      só no Emulator Suite (padrão)
//   npm run seed -- --prod            produção, com confirmação digitada
//   npm run seed -- --prod --reset    produção, apagando as coleções antes
//   npm run seed -- --with-external-metadata completa capa, sinopse e editora pela
//                                     Open Library e BrasilAPI (padrão: desligado)
//   npm run seed -- --offline         nenhuma chamada externa (feriados do arquivo local)
import { getAdminAuth, getDb } from '../src/config/firebase.js'
import { env } from '../src/config/env.js'
import {
  confirmByTyping,
  confirmProduction,
  useProductionDatabase,
} from './lib/environment.js'
import { daysBetween, localDate } from '../src/shared/calendar/dates.js'
import {
  fetchHolidays,
  type HolidaysDocument,
} from '../src/shared/calendar/holidays-api.js'
import { upsertAccounts } from './seed/accounts.js'
import { buildSeed, toWrites, uidOf } from './seed/build.js'
import { checkEnvironment, parseCliArgs, type CliOptions } from './seed/cli.js'
import { AUTH_EMAIL_DOMAIN, BASE_DATE, USERS } from './seed/data.js'
import { publishFirestoreConfig } from './seed/deploy.js'
import { clearDatabase, writeAll } from './seed/firestore.js'
import { enrichFromExternalSources } from './seed/external-metadata.js'
import { loadHolidaysFile } from './seed/holidays.js'
import { countDocuments, runChecks } from './seed/verify.js'

async function loadHolidays(
  options: CliOptions,
  year: number,
): Promise<HolidaysDocument> {
  const apiKey = process.env.FERIADOS_API_KEY
  if (!options.offline && apiKey) {
    try {
      const document = await fetchHolidays(year, apiKey)
      console.log(
        `  holidays/${year}: ${document.items.length} feriados da FeriadosAPI`,
      )
      return document
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'erro desconhecido'
      console.warn(`  FeriadosAPI falhou (${reason}); usando o arquivo local.`)
    }
  }
  const document = await loadHolidaysFile(year).catch(() => {
    throw new Error(
      `Não há arquivo local de feriados de ${year}. Rode sem --offline e com FERIADOS_API_KEY no .env.`,
    )
  })
  console.log(
    `  holidays/${year}: ${document.items.length} feriados do arquivo local`,
  )
  return document
}

// Confirmações de quem grava em produção: o ID do projeto e, com --reset, a
// frase que autoriza apagar as coleções.
async function confirmProductionRun(options: CliOptions): Promise<boolean> {
  const confirmed = await confirmProduction(
    env.GOOGLE_CLOUD_PROJECT,
    'inclusive as contas de teste no Firebase Authentication, com a senha de SEED_TEST_PASSWORD',
  )
  if (!confirmed || !options.reset) return confirmed

  return confirmByTyping(
    '--reset vai APAGAR todas as coleções do banco de produção antes de gravar.\nDigite "apagar tudo" para confirmar:',
    'apagar tudo',
  )
}

async function main(): Promise<number> {
  const options = parseCliArgs(process.argv.slice(2))

  const problems = checkEnvironment(options, process.env)
  if (problems.length) {
    for (const problem of problems) console.error(`Erro: ${problem}`)
    return 1
  }
  const password = process.env.SEED_TEST_PASSWORD!

  // "Hoje" é o dia em que o seed roda: todas as datas dos dados seguem esse dia.
  const today = localDate(new Date())
  const year = Number(today.slice(0, 4))

  console.log('1. Ambiente')
  if (options.prod) {
    if (!(await confirmProductionRun(options))) {
      console.error('Cancelado: a confirmação não confere. Nada foi gravado.')
      return 1
    }
    useProductionDatabase()
    console.log(`  PRODUÇÃO (projeto ${env.GOOGLE_CLOUD_PROJECT})`)
  } else {
    console.log(
      `  Emulator Suite (Firestore ${process.env.FIRESTORE_EMULATOR_HOST}, Auth ${process.env.FIREBASE_AUTH_EMULATOR_HOST})`,
    )
  }

  const db = getDb()

  console.log('2. Limpeza das coleções')
  if (!options.prod || options.reset) {
    await clearDatabase(db)
    console.log('  coleções apagadas')
  } else {
    console.log('  pulada em produção (use --reset para apagar)')
  }

  console.log('3. Configurações e feriados')
  console.log(
    `  hoje (America/Fortaleza): ${today}; datas deslocadas ${daysBetween(BASE_DATE, today)} dia(s) em relação ao exemplo de ${BASE_DATE}`,
  )
  const holidays = await loadHolidays(options, year)

  console.log('4. Contas do Firebase Authentication')
  await upsertAccounts(
    getAdminAuth(),
    USERS.map((user) => ({
      uid: uidOf(user.key),
      email: `${user.matricula}@${AUTH_EMAIL_DOMAIN}`,
      password,
    })),
    !options.prod,
  )
  console.log(`  ${USERS.length} contas prontas`)

  console.log('5. a 7. Dados')
  const data = buildSeed({ holidays, tokenSecret: password, today })
  if (options.externalMetadata) {
    const result = await enrichFromExternalSources(data.books)
    console.log(
      `  Fontes externas: ${result.enriched} completados, ${result.notFound} sem resultado, ${result.failed} sem resposta`,
    )
  } else {
    console.log('  Fontes externas: puladas (use --with-external-metadata)')
  }
  const writes = toWrites(data)
  await writeAll(db, writes)
  console.log(`  ${writes.length} documentos gravados`)

  console.log('8. Índices, regras e TTL')
  let failedCommands: string[] = []
  if (options.prod) {
    failedCommands = publishFirestoreConfig(env.GOOGLE_CLOUD_PROJECT)
  } else {
    console.log(
      '  pulado no emulador (as regras vêm do firebase.json; índices e TTL só existem em produção)',
    )
  }

  console.log('9. Conferência')
  for (const line of await countDocuments(db)) console.log(`  ${line}`)
  const checks = await runChecks(db, holidays, today)
  for (const check of checks) {
    console.log(
      `  ${check.ok ? 'OK    ' : 'FALHOU'} ${check.label} (${check.detail})`,
    )
  }

  if (failedCommands.length) {
    console.error('\nEstes comandos falharam; rode-os à mão:')
    for (const command of failedCommands) console.error(`  ${command}`)
  }
  return checks.every((check) => check.ok) && !failedCommands.length ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(
      'O seed falhou:',
      error instanceof Error ? error.message : error,
    )
    process.exit(1)
  })
