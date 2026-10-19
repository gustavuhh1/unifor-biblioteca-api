import { spawnSync } from 'node:child_process'
import { TTL_COLLECTION_GROUPS } from '../../src/shared/firestore/collections.js'

function run(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return !result.error && result.status === 0
}

// Section 8, step 8 (production only): publishes the indexes and the security
// rules and enables the TTL policies. The emulator reads the rules from
// firebase.json, ignores indexes and has no TTL, so it skips this step.
// Returns the commands that failed, so the caller can print them.
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
