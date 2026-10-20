import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const firebase = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUserDoc: vi.fn(),
}))

vi.mock('../config/firebase.js', () => ({
  getAdminAuth: () => ({ verifyIdToken: firebase.verifyIdToken }),
  getDb: () => ({
    collection: () => ({ doc: () => ({ get: firebase.getUserDoc }) }),
  }),
}))

const { authenticate } = await import('./auth.js')

function fakeRequest(authorization?: string) {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  } as unknown as Request
}

function userDoc(data?: Record<string, unknown>) {
  return { get: (field: string) => data?.[field] }
}

async function rejectionOf(promise: unknown): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return undefined
}

describe('autenticação por ID token do Firebase (authenticate)', () => {
  beforeEach(() => {
    firebase.verifyIdToken.mockReset()
    firebase.getUserDoc.mockReset()
  })

  it('responde 401 quando não há cabeçalho Authorization', async () => {
    const error = await rejectionOf(
      authenticate(fakeRequest(), {} as Response, vi.fn()),
    )

    expect(error).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(firebase.verifyIdToken).not.toHaveBeenCalled()
  })

  it('responde 401 quando o cabeçalho não é um Bearer token', async () => {
    const error = await rejectionOf(
      authenticate(fakeRequest('Basic abc'), {} as Response, vi.fn()),
    )

    expect(error).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(firebase.verifyIdToken).not.toHaveBeenCalled()
  })

  it('responde 401 quando o Firebase rejeita o token, conferindo a revogação', async () => {
    firebase.verifyIdToken.mockRejectedValue({ code: 'auth/id-token-revoked' })

    const error = await rejectionOf(
      authenticate(fakeRequest('Bearer token-123'), {} as Response, vi.fn()),
    )

    expect(error).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(firebase.verifyIdToken).toHaveBeenCalledWith('token-123', true)
  })

  it('não transforma falha de infraestrutura em 401', async () => {
    const failure = new Error('network down')
    firebase.verifyIdToken.mockRejectedValue(failure)

    const error = await rejectionOf(
      authenticate(fakeRequest('Bearer token-123'), {} as Response, vi.fn()),
    )

    expect(error).toBe(failure)
  })

  it('responde 403 quando users/{uid} não tem um perfil válido', async () => {
    firebase.verifyIdToken.mockResolvedValue({ uid: 'uid-1' })
    firebase.getUserDoc.mockResolvedValue(userDoc(undefined))

    const error = await rejectionOf(
      authenticate(fakeRequest('Bearer token-123'), {} as Response, vi.fn()),
    )

    expect(error).toMatchObject({ status: 403, code: 'profile_not_found' })
  })

  it.each(['pending_email', 'disabled', undefined])(
    'responde 403 account_disabled quando o status é %s',
    async (status) => {
      firebase.verifyIdToken.mockResolvedValue({ uid: 'uid-1' })
      firebase.getUserDoc.mockResolvedValue(
        userDoc({ role: 'student', status }),
      )
      const next = vi.fn()

      const error = await rejectionOf(
        authenticate(fakeRequest('Bearer token-123'), {} as Response, next),
      )

      expect(error).toMatchObject({ status: 403, code: 'account_disabled' })
      expect(next).not.toHaveBeenCalled()
    },
  )

  it('carrega uid e perfil na requisição', async () => {
    firebase.verifyIdToken.mockResolvedValue({ uid: 'uid-1' })
    firebase.getUserDoc.mockResolvedValue(
      userDoc({ role: 'librarian', status: 'active' }),
    )
    const req = fakeRequest('bearer token-123')
    const next = vi.fn()

    await authenticate(req, {} as Response, next)

    expect(req.user).toEqual({ uid: 'uid-1', role: 'librarian' })
    expect(next).toHaveBeenCalledOnce()
  })
})
