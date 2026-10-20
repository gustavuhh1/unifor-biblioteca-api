import { describe, expect, it } from 'vitest'
import { requestLogFormat, shouldSkipRequestLog } from './request-logger.js'

describe('formato do log de requisições (requestLogFormat)', () => {
  it('usa o formato dev no desenvolvimento', () => {
    expect(requestLogFormat('development')).toBe('dev')
  })

  it('usa o formato dev nos testes', () => {
    expect(requestLogFormat('test')).toBe('dev')
  })

  it('usa o formato short em produção', () => {
    expect(requestLogFormat('production')).toBe('short')
  })
})

describe('requisições fora do log (shouldSkipRequestLog)', () => {
  it('pula o GET /health', () => {
    expect(shouldSkipRequestLog({ method: 'GET', url: '/health' })).toBe(true)
  })

  it('pula o GET /health com query string', () => {
    expect(shouldSkipRequestLog({ method: 'GET', url: '/health?a=1' })).toBe(
      true,
    )
  })

  it('não pula outras rotas', () => {
    expect(shouldSkipRequestLog({ method: 'GET', url: '/me' })).toBe(false)
    expect(shouldSkipRequestLog({ method: 'GET', url: '/health/x' })).toBe(
      false,
    )
  })

  it('não pula o /health quando o método não é GET', () => {
    expect(shouldSkipRequestLog({ method: 'POST', url: '/health' })).toBe(false)
  })
})
