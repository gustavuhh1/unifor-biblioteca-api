import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'

// Opções da linha de comando do seed.
export interface CliOptions {
  prod: boolean
  reset: boolean
  googleBooks: boolean
  // Nenhuma chamada externa: os feriados vêm do arquivo local.
  offline: boolean
}

// Lê os argumentos da linha de comando (--prod, --reset, --no-google-books e
// --offline); argumento desconhecido é erro.
export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      prod: { type: 'boolean' },
      reset: { type: 'boolean' },
      'no-google-books': { type: 'boolean' },
      offline: { type: 'boolean' },
    },
    strict: true,
  })
  const offline = values.offline ?? false
  return {
    prod: values.prod ?? false,
    reset: values.reset ?? false,
    googleBooks: !offline && !values['no-google-books'],
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
    for (const name of [
      'FIRESTORE_EMULATOR_HOST',
      'FIREBASE_AUTH_EMULATOR_HOST',
    ]) {
      if (!source[name]) {
        problems.push(
          `${name} não está definida. Por padrão o seed só roda no Emulator Suite: defina-a no .env e rode "npm run emulators". Para gravar em produção use --prod.`,
        )
      }
    }
  }
  return problems
}

// Pede ao usuário que digite `expected` exatamente; qualquer outra coisa cancela.
export async function confirmByTyping(
  question: string,
  expected: string,
): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  // Entrada fechada (sem terminal, Ctrl+D) conta como "não confirmado".
  const closed = new Promise<string>((resolve) =>
    readline.once('close', () => resolve('')),
  )
  try {
    const answer = await Promise.race([
      readline.question(`${question}\n> `),
      closed,
    ])
    return answer.trim() === expected
  } catch {
    return false
  } finally {
    readline.close()
  }
}
