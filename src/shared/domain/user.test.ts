import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFS,
  buildUserDocument,
  displayNameOf,
} from './user.js'

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

describe('preferências de aviso do usuário novo (buildUserDocument, RF-AVI-03)', () => {
  const input = {
    role: 'student',
    matricula: '2412858',
    email: 'lucas@exemplo.invalid',
    authEmail: '2412858@contas.exemplo.invalid',
    status: 'active',
    createdAt: new Date('2026-10-20T10:00:00Z'),
  } as const

  it('começa com tudo ligado', () => {
    expect(buildUserDocument(input).notificationPrefs).toEqual(
      DEFAULT_NOTIFICATION_PREFS,
    )
  })

  it('muda só as preferências pedidas e não altera o padrão', () => {
    const user = buildUserDocument({
      ...input,
      notificationPrefs: { channelEmail: false },
    })

    expect(user.notificationPrefs).toEqual({
      ...DEFAULT_NOTIFICATION_PREFS,
      channelEmail: false,
    })
    expect(DEFAULT_NOTIFICATION_PREFS.channelEmail).toBe(true)
  })
})
