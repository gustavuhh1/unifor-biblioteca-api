import { createInterface } from 'node:readline/promises'

// Guarda de ambiente dos scripts que gravam no banco (seed, catalog:sync): por
// padrão só o Emulator Suite; produção só com --prod e confirmação digitada
// (RNF-SEG-08).

// Problemas de quem pretende rodar no emulador: cada host do emulador que falta
// no ambiente. Sem eles o Admin SDK cairia na produção, então o script para.
export function emulatorProblems(
  source: NodeJS.ProcessEnv,
  hostVariables: readonly string[],
): string[] {
  return hostVariables
    .filter((name) => !source[name])
    .map(
      (name) =>
        `${name} não está definida. Por padrão o script só roda no Emulator Suite: defina-a no .env e rode "npm run emulators". Para gravar em produção use --prod.`,
    )
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

// Confirma a gravação em produção: o usuário digita o ID do projeto. `details`
// completa o aviso com o que o script faz de mais grave (opcional).
export function confirmProduction(
  project: string,
  details?: string,
): Promise<boolean> {
  return confirmByTyping(
    `ATENÇÃO: isto grava em PRODUÇÃO (projeto ${project})${details ? `, ${details}` : ''}.\nDigite o ID do projeto para confirmar:`,
    project,
  )
}

// Aponta o Admin SDK para a produção. Ele lê estas variáveis no primeiro uso:
// sem elas, aponta para a produção. Chame antes de qualquer acesso ao banco, e só
// depois da confirmação.
export function useProductionDatabase(): void {
  delete process.env.FIRESTORE_EMULATOR_HOST
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST
}
