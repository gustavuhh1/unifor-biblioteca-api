import { parseArgs } from 'node:util'
import { emulatorProblems } from '../lib/environment.js'

// Opções da linha de comando do catalog:sync.
export interface CliOptions {
  prod: boolean
}

// Lê os argumentos da linha de comando (--prod); argumento desconhecido é erro.
export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: { prod: { type: 'boolean' } },
    strict: true,
  })
  return { prod: values.prod ?? false }
}

// Problemas que param o script antes de ele tocar em qualquer coisa: falta a
// chave do Google Books, ou falta o host do emulador sem --prod (para nunca cair
// na produção sem querer).
export function checkEnvironment(
  options: CliOptions,
  source: NodeJS.ProcessEnv,
): string[] {
  const problems: string[] = []
  if (!source.GOOGLE_BOOKS_API_KEY) {
    problems.push(
      'GOOGLE_BOOKS_API_KEY não está definida. Coloque a chave no seu .env (veja .env.example).',
    )
  }
  if (!options.prod) {
    problems.push(...emulatorProblems(source, ['FIRESTORE_EMULATOR_HOST']))
  }
  return problems
}
