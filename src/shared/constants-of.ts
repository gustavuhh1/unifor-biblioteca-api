// Nome de constante (camelCase) de um valor em snake_case: on_loan -> onLoan.
type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S

// Monta o objeto de constantes de uma lista de valores: cada valor é escrito uma
// vez só (na lista) e ganha um nome em camelCase, ex.: USER_STATUS.pendingEmail.
// Serve para todo conjunto fixo de textos do sistema (enums, resultados etc.).
export function constantsOf<const T extends readonly string[]>(
  values: T,
): { readonly [V in T[number] as CamelCase<V>]: V } {
  return Object.fromEntries(
    values.map((value) => [
      value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  ) as { readonly [V in T[number] as CamelCase<V>]: V }
}
