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

describe('authenticate', () => {
  beforeEach(() => {
    firebase.verifyIdToken.mockReset()
    firebase.getUserDoc.mockReset()
  })

  it('answers 401 when there is no Authorization header', async () => {
    const error = await rejectionOf(
      authenticate(fakeRequest(), {} as Response, vi.fn()),
    )

    expect(error).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(firebase.verifyIdToken).not.toHaveBeenCalled()
  })

  it('answers 401 when the header is not a Bearer token', async () => {
    const error = await rejectionOf(
      authenticate(fakeRequest('Basic abc'), {} as Response, vi.fn()),
    )

    expect(error).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(firebase.verifyIdToken).not.toHaveBeenCalled()
  })

  it('answers 401 when Firebase rejects the token, checking revocation', async () => {
    firebase.verifyIdToken.mockRejectedValue({ code: 'auth/id-token-revoked' })

    const error = await rejectionOf(
      authenticate(fakeRequest('Bearer token-123'), {} as Response, vi.fn()),
    )

    expect(error).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(firebase.verifyIdToken).toHaveBeenCalledWith('token-123', true)
  })

  it('does not turn an infrastructure failure into a 401', async () => {
    const failure = new Error('network down')
    firebase.verifyIdToken.mockRejectedValue(failure)

    const error = await rejectionOf(
      authenticate(fakeRequest('Bearer token-123'), {} as Response, vi.fn()),
    )

    expect(error).toBe(failure)
  })

  it('answers 403 when users/{uid} has no valid role', async () => {
    firebase.verifyIdToken.mockResolvedValue({ uid: 'uid-1' })
    firebase.getUserDoc.mockResolvedValue(userDoc(undefined))

    const error = await rejectionOf(
      authenticate(fakeRequest('Bearer token-123'), {} as Response, vi.fn()),
    )

    expect(error).toMatchObject({ status: 403, code: 'profile_not_found' })
  })

  it('loads uid and role into the request', async () => {
    firebase.verifyIdToken.mockResolvedValue({ uid: 'uid-1' })
    firebase.getUserDoc.mockResolvedValue(userDoc({ role: 'librarian' }))
    const req = fakeRequest('bearer token-123')
    const next = vi.fn()

    await authenticate(req, {} as Response, next)

    expect(req.user).toEqual({ uid: 'uid-1', role: 'librarian' })
    expect(next).toHaveBeenCalledOnce()
  })
})
