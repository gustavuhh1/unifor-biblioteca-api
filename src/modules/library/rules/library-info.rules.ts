import type { LibraryInfoSettings } from '../../../shared/firestore/settings.js'
import type { LibraryInfoResponse } from '../library.types.js'

// Monta a resposta das Regras da biblioteca (RF-PER-02) a partir de
// settings/library. Fica de fora o que não é da tela, como a data simulada de
// teste (RF-SIS-04).
export function toLibraryInfo(
  settings: LibraryInfoSettings,
): LibraryInfoResponse {
  return {
    openingHours: settings.openingHours,
    contact: settings.contact,
    officialRulesUrl: settings.officialRulesUrl,
    rules: {
      maxActiveLoans: settings.maxActiveLoans,
      maxActiveQueues: settings.maxActiveQueues,
      loanDays: settings.loanDays,
      renewalDays: settings.renewalDays,
      maxRenewals: settings.maxRenewals,
      pickupBusinessDays: settings.pickupBusinessDays,
      queueConfirmHours: settings.queueConfirmHours,
      fineCentsPerBusinessDay: settings.fineCentsPerBusinessDay,
    },
  }
}
