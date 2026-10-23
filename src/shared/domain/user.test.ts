import { describe, expect, it } from 'vitest'
import { displayNameOf } from './user.js'

describe('nome do usuário nas listas e avisos (displayNameOf)', () => {
  it('usa o nome do Perfil quando existe', () => {
    expect(
      displayNameOf({ fullName: 'Lucas Almeida', matricula: '2412858' }),
    ).toBe('Lucas Almeida')
  })

  it('sem nome, usa a matrícula', () => {
    expect(displayNameOf({ matricula: '2412858' })).toBe('2412858')
  })
})
