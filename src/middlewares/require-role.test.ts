import type { Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { UserRole } from '../shared/types/index.js'
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

describe('exigência de perfil (requireRole)', () => {
  it('libera a rota para o perfil permitido', () => {
    const { call, next } = run('librarian', 'librarian')

    call()

    expect(next).toHaveBeenCalledOnce()
  })

  it('responde 403 quando o perfil não é permitido', () => {
    const { call, next } = run('librarian', 'student')

    expect(thrownBy(call)).toMatchObject({ status: 403, code: 'forbidden' })
    expect(next).not.toHaveBeenCalled()
  })

  it('responde 401 quando não há usuário autenticado', () => {
    const { call, next } = run('student')

    expect(thrownBy(call)).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('aceita mais de um perfil', () => {
    const req = { user: { uid: 'uid-1', role: 'student' } } as Request
    const next = vi.fn()

    requireRole('student', 'librarian')(req, {} as Response, next)

    expect(next).toHaveBeenCalledOnce()
  })
})
