import { spawnSync, type SpawnSyncOptions } from 'node:child_process'

// Com `shell: true` (Windows) o Node junta os argumentos num texto só, sem aspas, e o
// shell os parte em cada espaço: "--display-name=Unifor Biblioteca" viraria três
// argumentos, e "*/5 * * * *" seria lido como curingas. Por isso, no Windows, o
// argumento com espaço ou símbolo do shell vai entre aspas duplas.
export function quoteForShell(arg: string): string {
  return /[\s*&|<>^%()]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg
}

// No Windows o gcloud, o firebase e o npx são arquivos .cmd, por isso precisam do
// shell (e dos argumentos entre aspas, acima).
function spawn(
  command: string,
  args: string[],
  stdio: SpawnSyncOptions['stdio'],
): boolean {
  const shell = process.platform === 'win32'
  const result = spawnSync(command, shell ? args.map(quoteForShell) : args, {
    stdio,
    shell,
  })
  return !result.error && result.status === 0
}

// Roda um comando herdando o terminal e diz se ele terminou bem (código 0).
export function runCommand(command: string, args: string[]): boolean {
  return spawn(command, args, 'inherit')
}

// Igual a runCommand, mas sem mostrar nada no terminal: serve para perguntar "isto
// existe?" (um `describe` termina bem só se existir).
export function commandSucceeds(command: string, args: string[]): boolean {
  return spawn(command, args, 'ignore')
}
