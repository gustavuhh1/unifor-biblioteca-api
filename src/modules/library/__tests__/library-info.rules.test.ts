import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIBRARY_CONTACT,
  DEFAULT_OFFICIAL_RULES_URL,
  DEFAULT_OPENING_HOURS,
} from '../../../shared/library.js'
import type { LibraryInfoSettings } from '../../../shared/firestore/settings.js'
import { toLibraryInfo } from '../rules/library-info.rules.js'

const settings: LibraryInfoSettings = {
  maxActiveLoans: 10,
  maxActiveQueues: 7,
  loanDays: 14,
  renewalDays: 14,
  maxRenewals: 1,
  pickupBusinessDays: 2,
  dueSoonDays: 2,
  queueConfirmHours: 24,
  fineCentsPerBusinessDay: 200,
  openingHours: DEFAULT_OPENING_HOURS,
  simulatedNow: new Date('2026-10-15T12:00:00Z'),
  contact: DEFAULT_LIBRARY_CONTACT,
  officialRulesUrl: DEFAULT_OFFICIAL_RULES_URL,
}

describe('Regras da biblioteca (toLibraryInfo, RF-PER-02)', () => {
  it('reúne horário, contato, link oficial e os números das regras', () => {
    expect(toLibraryInfo(settings)).toEqual({
      openingHours: DEFAULT_OPENING_HOURS,
      contact: DEFAULT_LIBRARY_CONTACT,
      officialRulesUrl: DEFAULT_OFFICIAL_RULES_URL,
      rules: {
        maxActiveLoans: 10,
        maxActiveQueues: 7,
        loanDays: 14,
        renewalDays: 14,
        maxRenewals: 1,
        pickupBusinessDays: 2,
        queueConfirmHours: 24,
        fineCentsPerBusinessDay: 200,
      },
    })
  })

  it('não expõe a data simulada de teste nem o "vence em breve"', () => {
    const info = toLibraryInfo(settings)

    expect(JSON.stringify(info)).not.toContain('simulatedNow')
    expect(info.rules).not.toHaveProperty('dueSoonDays')
  })
})
