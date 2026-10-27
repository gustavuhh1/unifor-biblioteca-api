import {
  readLibrarySettings,
  readLoanSettings,
  readLibraryContactSettings,
} from '../../../shared/firestore/settings.js'
import { libraryInfoSchema } from '../schemas/response.schemas.js'
import type { LibraryInfo } from '../library.types.js'

// Informações da biblioteca em uma leitura; só os campos públicos (RF-PER-02).
export async function getLibraryInfo(): Promise<LibraryInfo> {
  const snapshot = await readLibrarySettings()
  const [rules, contact] = await Promise.all([
    readLoanSettings(snapshot),
    readLibraryContactSettings(snapshot),
  ])
  return libraryInfoSchema.parse({ ...rules, ...contact })
}
