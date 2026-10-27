import { readLibraryInfoSettings } from '../../../shared/firestore/settings.js'
import type { LibraryInfoResponse } from '../library.types.js'
import { toLibraryInfo } from '../rules/library-info.rules.js'

// Regras da biblioteca (RF-PER-02): horários, contatos, link oficial e os números
// das regras, lidos de settings/library a cada chamada. Mudar um valor lá muda a
// tela sem novo build do app.
export async function getLibraryInfo(): Promise<LibraryInfoResponse> {
  return toLibraryInfo(await readLibraryInfoSettings())
}
