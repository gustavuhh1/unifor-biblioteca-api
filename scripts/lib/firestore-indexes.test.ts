import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TTL_COLLECTION_GROUPS } from '../../src/shared/firestore/collections.js'

// O firestore.indexes.json é a fonte dos TTLs: se uma política ficar de fora, o
// `firebase deploy --only firestore` pergunta se deve apagá-la do projeto.
const indexesFile = JSON.parse(
  readFileSync(
    new URL('../../firestore.indexes.json', import.meta.url),
    'utf8',
  ),
) as {
  fieldOverrides: {
    collectionGroup: string
    fieldPath: string
    ttl?: boolean
  }[]
}

describe('firestore.indexes.json (seção 4.3)', () => {
  it('declara o TTL de expiresAt em cada grupo de coleção com política de TTL', () => {
    const withTtl = indexesFile.fieldOverrides
      .filter((override) => override.ttl && override.fieldPath === 'expiresAt')
      .map((override) => override.collectionGroup)

    expect(withTtl.sort()).toEqual([...TTL_COLLECTION_GROUPS].sort())
  })
})
