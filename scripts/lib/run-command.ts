import { spawnSync } from 'node:child_process'

// Roda um comando herdando o terminal e diz se ele terminou bem (código 0). No
// Windows o gcloud, o firebase e o npx são arquivos .cmd, por isso precisam do
// shell.
export function runCommand(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return !result.error && result.status === 0
}
