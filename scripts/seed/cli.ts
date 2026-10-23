import { parseArgs } from 'node:util'
import { emulatorProblems } from '../lib/environment.js'

// Opções da linha de comando do seed.
export interface CliOptions {
  prod: boolean
  reset: boolean
  // Completa capa, sinopse e editora pelas fontes externas (Open Library e
  // BrasilAPI). Desligado por padrão: o seed é determinístico e funciona offline.
  externalMetadata: boolean
  // Nenhuma chamada externa: os feriados vêm do arquivo local.
  offline: boolean
}

// Lê os argumentos da linha de comando (--prod, --reset, --with-external-metadata
// e --offline); argumento desconhecido é erro, e --offline com
// --with-external-metadata também (um pede rede, o outro proíbe).
export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      prod: { type: 'boolean' },
      reset: { type: 'boolean' },
      'with-external-metadata': { type: 'boolean' },
      offline: { type: 'boolean' },
    },
    strict: true,
  })
  const offline = values.offline ?? false
  const externalMetadata = values['with-external-metadata'] ?? false
  if (offline && externalMetadata) {
    throw new Error(
      '--offline e --with-external-metadata não podem ser usados juntos.',
    )
  }
  return {
    prod: values.prod ?? false,
    reset: values.reset ?? false,
    externalMetadata,
    offline,
  }
}

// O Firebase Authentication recusa senhas menores que isto.
const MIN_PASSWORD_LENGTH = 6

// Problemas que param o seed antes de ele tocar em qualquer coisa.
export function checkEnvironment(
  options: CliOptions,
  source: NodeJS.ProcessEnv,
): string[] {
  const problems: string[] = []

  const password = source.SEED_TEST_PASSWORD
  if (!password) {
    problems.push(
      'SEED_TEST_PASSWORD não está definida. Coloque a senha das contas de teste no seu .env (veja .env.example); ela nunca vai no código.',
    )
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(
      `SEED_TEST_PASSWORD precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres (regra do Firebase Authentication).`,
    )
  }

  if (!options.prod) {
    problems.push(
      ...emulatorProblems(source, [
        'FIRESTORE_EMULATOR_HOST',
        'FIREBASE_AUTH_EMULATOR_HOST',
      ]),
    )
  }
  return problems
}
