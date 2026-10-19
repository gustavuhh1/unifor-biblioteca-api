import { spawnSync } from 'node:child_process'
import { TTL_COLLECTION_GROUPS } from '../../src/shared/firestore/collections.js'

function run(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return !result.error && result.status === 0
}

// Seção 8, passo 8 (só produção): publica os índices e as regras de segurança e
// ativa as políticas de TTL. O emulador lê as regras do firebase.json, ignora
// índices e não tem TTL, então pula este passo. Devolve os comandos que
// falharam, para quem chamou poder mostrá-los.
export function publishFirestoreConfig(projectId: string): string[] {
  const failed: string[] = []

  const deploy = [
    'firebase',
    'deploy',
    '--only',
    'firestore',
    '--project',
    projectId,
  ]
  if (!run('npx', deploy)) failed.push(`npx ${deploy.join(' ')}`)

  for (const group of TTL_COLLECTION_GROUPS) {
    const ttl = [
      'firestore',
      'fields',
      'ttls',
      'update',
      'expiresAt',
      `--collection-group=${group}`,
      '--enable-ttl',
      `--project=${projectId}`,
    ]
    if (!run('gcloud', ttl)) failed.push(`gcloud ${ttl.join(' ')}`)
  }
  return failed
}
