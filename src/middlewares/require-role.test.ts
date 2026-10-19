import type { Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { UserRole } from '../shared/user-role.js'
import { requireRole } from './require-role.js'

function run(allowed: UserRole, userRole?: UserRole) {
  const req = {
    user: userRole ? { uid: 'uid-1', role: userRole } : undefined,
  } as Request
  const next = vi.fn()
  const call = () => requireRole(allowed)(req, {} as Response, next)
  return { call, next }
}

function thrownBy(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

describe('requireRole', () => {
  it('lets the route through for the allowed role', () => {
    const { call, next } = run('librarian', 'librarian')

    call()

    expect(next).toHaveBeenCalledOnce()
  })

  it('answers 403 when the role is not allowed', () => {
    const { call, next } = run('librarian', 'student')

    expect(thrownBy(call)).toMatchObject({ status: 403, code: 'forbidden' })
    expect(next).not.toHaveBeenCalled()
  })

  it('answers 401 when there is no authenticated user', () => {
    const { call, next } = run('student')

    expect(thrownBy(call)).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts more than one role', () => {
    const req = { user: { uid: 'uid-1', role: 'student' } } as Request
    const next = vi.fn()

    requireRole('student', 'librarian')(req, {} as Response, next)

    expect(next).toHaveBeenCalledOnce()
  })
})
