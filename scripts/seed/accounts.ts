import type { Auth } from 'firebase-admin/auth'
import { errorCodeOf } from '../../src/shared/error-property.js'

// Conta a criar no Firebase Authentication: uid, e-mail interno e senha de teste.
export interface Account {
  uid: string
  email: string
  password: string
}

// Código do erro do Firebase para usuário inexistente.
const USER_NOT_FOUND = 'auth/user-not-found'

// Cria (ou atualiza) a conta do Firebase Authentication de cada usuário, já
// ativa. O uid é fixo, então rodar o seed de novo chega ao mesmo estado.
export async function upsertAccounts(
  auth: Auth,
  accounts: Account[],
  emulator: boolean,
): Promise<void> {
  for (const { uid, email, password } of accounts) {
    try {
      await auth.updateUser(uid, { email, password, disabled: false })
      continue
    } catch (error) {
      if (errorCodeOf(error) !== USER_NOT_FOUND) throw error
    }

    // Outra conta já usa este e-mail (sobra de testes manuais).
    const holder = await auth.getUserByEmail(email).catch((error: unknown) => {
      if (errorCodeOf(error) === USER_NOT_FOUND) return undefined
      throw error
    })
    if (holder) {
      if (!emulator) {
        throw new Error(
          `The e-mail ${email} belongs to another account (${holder.uid}); remove it manually before seeding production.`,
        )
      }
      await auth.deleteUser(holder.uid)
    }
    await auth.createUser({ uid, email, password })
  }
}
