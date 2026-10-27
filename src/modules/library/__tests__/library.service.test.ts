import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import {
  DEFAULT_LIBRARY_CONTACT,
  DEFAULT_LOAN_RULES,
  DEFAULT_OFFICIAL_RULES_URL,
  DEFAULT_OPENING_HOURS,
} from '../../../shared/library.js'
import { DEFAULT_REQUEST_LIMITS } from '../../../shared/rules/request-eligibility.js'
import {
  COLLECTIONS,
  SETTINGS_DOC_ID,
} from '../../../shared/firestore/collections.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))
vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { getLibraryInfo } = await import('../services/library.service.js')
beforeEach(() => {
  h.db = new Fake()
})

describe('informações da biblioteca (RF-PER-02)', () => {
  it('lê os valores configurados uma vez e expõe apenas os campos públicos', async () => {
    const info = {
      openingHours: {
        ...DEFAULT_OPENING_HOURS,
        mon: null,
        sat: { open: '09:00', close: '12:00' },
      },
      contact: {
        place: 'Balcão central',
        biblioZap: '(85) 3000-1000',
        loanPhone: '(85) 3000-1001',
        loanEmail: 'biblioteca@example.com',
      },
      officialRulesUrl: 'https://example.com/regras',
      maxActiveLoans: 8,
      loanDays: 21,
      renewalDays: 7,
      maxRenewals: 2,
      fineCentsPerBusinessDay: 300,
      maxActiveQueues: 5,
      queueConfirmHours: 12,
      pickupBusinessDays: 3,
    }
    h.db.put(COLLECTIONS.settings, SETTINGS_DOC_ID, {
      ...info,
      simulatedNow: new Date(),
      emailTokenMaxAttempts: 99,
      dueSoonDays: 5,
    })
    const read = vi.spyOn(h.db, 'snapshot')
    expect(await getLibraryInfo()).toEqual(info)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('usa os padrões compartilhados quando o documento não existe', async () => {
    const rules = { ...DEFAULT_LOAN_RULES }
    const { dueSoonDays, ...publicRules } = rules
    expect(dueSoonDays).toBeDefined()
    expect(await getLibraryInfo()).toEqual({
      ...publicRules,
      ...DEFAULT_REQUEST_LIMITS,
      openingHours: DEFAULT_OPENING_HOURS,
      contact: DEFAULT_LIBRARY_CONTACT,
      officialRulesUrl: DEFAULT_OFFICIAL_RULES_URL,
    })
  })

  it('mantém os campos válidos do contato parcial e substitui os inválidos', async () => {
    h.db.put(COLLECTIONS.settings, SETTINGS_DOC_ID, {
      contact: { place: 'Novo balcão', biblioZap: 123, loanEmail: 'inválido' },
      officialRulesUrl: 'javascript:alert(1)',
      openingHours: {},
      maxActiveLoans: -1,
    })
    expect(await getLibraryInfo()).toMatchObject({
      contact: { ...DEFAULT_LIBRARY_CONTACT, place: 'Novo balcão' },
      officialRulesUrl: DEFAULT_OFFICIAL_RULES_URL,
      openingHours: DEFAULT_OPENING_HOURS,
      maxActiveLoans: DEFAULT_REQUEST_LIMITS.maxActiveLoans,
    })
  })
})
