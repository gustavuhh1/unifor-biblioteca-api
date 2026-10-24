// Publica no Firestore de produção as regras de segurança, os índices e as
// políticas de TTL (docs/modelo-de-dados-firestore.md, seções 4 e 5).
//   npm run deploy:firestore
// Não grava nenhum documento; o seed --prod também faz este passo.
import { env } from '../src/config/env.js'
import { confirmProduction } from './lib/environment.js'
import { publishFirestoreConfig } from './lib/firestore-config.js'

async function main(): Promise<number> {
  const confirmed = await confirmProduction(
    env.GOOGLE_CLOUD_PROJECT,
    'publica regras, índices e TTL do Firestore',
  )
  if (!confirmed) {
    console.log('Cancelado.')
    return 1
  }

  const failed = publishFirestoreConfig(env.GOOGLE_CLOUD_PROJECT)
  if (failed.length > 0) {
    console.error('\nEstes comandos falharam; rode-os à mão:')
    for (const command of failed) console.error(`  ${command}`)
    return 1
  }
  console.log('\nRegras, índices e TTL publicados.')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
