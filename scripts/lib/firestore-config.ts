import { TTL_COLLECTION_GROUPS } from '../../src/shared/firestore/collections.js'
import { runCommand } from './run-command.js'

// Só produção (usada pelo seed --prod e pelo deploy:firestore): publica os
// índices e as regras de segurança e ativa as políticas de TTL (seção 8, passo 8
// do modelo de dados). O emulador lê as regras do firebase.json, ignora
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
  if (!runCommand('npx', deploy)) failed.push(`npx ${deploy.join(' ')}`)

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
    if (!runCommand('gcloud', ttl)) failed.push(`gcloud ${ttl.join(' ')}`)
  }
  return failed
}
