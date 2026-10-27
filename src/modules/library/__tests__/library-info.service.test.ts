import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { getLibraryInfo } = await import('../services/library-info.service.js')
const {
  DEFAULT_LIBRARY_CONTACT,
  DEFAULT_OFFICIAL_RULES_URL,
  DEFAULT_OPENING_HOURS,
} = await import('../../../shared/library.js')

beforeEach(() => {
  h.db = new Fake()
})

describe('Regras da biblioteca (getLibraryInfo, RF-PER-02)', () => {
  it('sem settings/library, devolve os padrões do projeto', async () => {
    const info = await getLibraryInfo()

    expect(info.openingHours).toEqual(DEFAULT_OPENING_HOURS)
    expect(info.contact).toEqual(DEFAULT_LIBRARY_CONTACT)
    expect(info.officialRulesUrl).toBe(DEFAULT_OFFICIAL_RULES_URL)
    expect(info.rules).toMatchObject({
      maxActiveLoans: 10,
      maxActiveQueues: 7,
      loanDays: 14,
      fineCentsPerBusinessDay: 200,
    })
  })

  it('mudar um valor em settings/library muda a resposta, sem novo build', async () => {
    h.db.put('settings', 'library', {
      maxActiveLoans: 8,
      fineCentsPerBusinessDay: 300,
      contact: {
        place: 'Biblioteca (Praça Central)',
        biblioZap: '(85) 0000-0000',
        loanPhone: '(85) 3477-3162',
        loanEmail: 'bibemprestimo@unifor.br',
      },
      officialRulesUrl: 'https://exemplo.unifor.br/regras',
    })

    const info = await getLibraryInfo()

    expect(info.rules.maxActiveLoans).toBe(8)
    expect(info.rules.fineCentsPerBusinessDay).toBe(300)
    expect(info.contact.biblioZap).toBe('(85) 0000-0000')
    expect(info.officialRulesUrl).toBe('https://exemplo.unifor.br/regras')
  })

  it('campo em branco, ausente ou inválido cai no padrão, campo a campo', async () => {
    h.db.put('settings', 'library', {
      maxActiveQueues: -3,
      contact: { biblioZap: '   ', loanEmail: 'balcao@unifor.br' },
      officialRulesUrl: '',
    })

    const info = await getLibraryInfo()

    expect(info.rules.maxActiveQueues).toBe(7)
    expect(info.contact).toEqual({
      ...DEFAULT_LIBRARY_CONTACT,
      loanEmail: 'balcao@unifor.br',
    })
    expect(info.officialRulesUrl).toBe(DEFAULT_OFFICIAL_RULES_URL)
  })
})
