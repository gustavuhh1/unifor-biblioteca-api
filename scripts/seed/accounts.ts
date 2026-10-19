import type { Auth } from 'firebase-admin/auth'

export interface Account {
  uid: string
  email: string
  password: string
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

// Creates (or updates) the Firebase Authentication account of each user, already
// active. The uid is fixed, so running the seed again reaches the same state.
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
      if (errorCode(error) !== 'auth/user-not-found') throw error
    }

    // Another account already owns this e-mail (left over from manual tests).
    const holder = await auth.getUserByEmail(email).catch((error: unknown) => {
      if (errorCode(error) === 'auth/user-not-found') return undefined
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
