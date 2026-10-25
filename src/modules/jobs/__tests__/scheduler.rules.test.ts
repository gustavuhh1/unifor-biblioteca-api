import { describe, expect, it } from 'vitest'
import { schedulerEmail } from '../rules/scheduler.rules.js'

describe('conta de serviço do Cloud Scheduler (schedulerEmail, RF-SIS-05)', () => {
  it('monta o e-mail a partir do projeto', () => {
    expect(schedulerEmail('estoque-pay')).toBe(
      'unibooks-scheduler@estoque-pay.iam.gserviceaccount.com',
    )
  })
})
