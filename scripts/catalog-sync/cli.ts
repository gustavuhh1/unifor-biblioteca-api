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

// Problemas que param o script antes de ele tocar em qualquer coisa: falta o host
// do emulador sem --prod (para nunca cair na produção sem querer).
export function checkEnvironment(
  options: CliOptions,
  source: NodeJS.ProcessEnv,
): string[] {
  const problems: string[] = []
  if (!options.prod) {
    problems.push(...emulatorProblems(source, ['FIRESTORE_EMULATOR_HOST']))
  }
  return problems
}
