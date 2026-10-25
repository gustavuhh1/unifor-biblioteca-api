import { describe, expect, it } from 'vitest'
import {
  folderIdsWith,
  folderIdsWithout,
} from '../rules/folder-membership.rules.js'

describe('pastas de um livro salvo (RF-SAL-03)', () => {
  it('acrescenta a pasta sem alterar a lista original', () => {
    const original = ['f1']

    expect(folderIdsWith(original, 'f2')).toEqual(['f1', 'f2'])
    expect(original).toEqual(['f1'])
  })

  it('não repete a pasta que já estava na lista', () => {
    expect(folderIdsWith(['f1', 'f2'], 'f2')).toEqual(['f1', 'f2'])
  })

  it('tira só a pasta pedida', () => {
    expect(folderIdsWithout(['f1', 'f2'], 'f1')).toEqual(['f2'])
  })

  it('devolve a lista igual quando a pasta não estava nela', () => {
    expect(folderIdsWithout(['f1'], 'f9')).toEqual(['f1'])
  })
})
