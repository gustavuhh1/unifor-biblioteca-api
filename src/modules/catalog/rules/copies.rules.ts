import type { FieldError } from '../../../shared/errors.js'
import type { CopyInput } from '../catalog.types.js'

// Campos com o registro repetido, para o app marcar na tela (RF-GAC-02). Um
// registro está em conflito se já existe no banco (`taken`) ou se já apareceu
// antes na própria lista. O campo é "copies.<posição>.registration".
export function registrationConflicts(
  copies: readonly Pick<CopyInput, 'registration'>[],
  taken: ReadonlySet<string>,
): FieldError[] {
  const seen = new Set<string>()
  const conflicts: FieldError[] = []
  copies.forEach(({ registration }, index) => {
    const field = `copies.${index}.registration`
    if (taken.has(registration)) {
      conflicts.push({
        field,
        message: `O registro ${registration} já existe no acervo.`,
      })
    } else if (seen.has(registration)) {
      conflicts.push({
        field,
        message: `O registro ${registration} está repetido.`,
      })
    }
    seen.add(registration)
  })
  return conflicts
}
