import type { DocumentSnapshot } from 'firebase-admin/firestore'
import { getAdminAuth, getDb } from '../../config/firebase.js'
import { AppError } from '../../shared/errors.js'
import { initialsOf, normalizeText } from '../../shared/text.js'
import { USERS, optionalDate } from './accounts.js'
import type { MeResponse } from './auth.schemas.js'

const orNull = <T>(value: T | undefined): T | null => value ?? null

function toMe(uid: string, user: DocumentSnapshot): MeResponse {
  return {
    uid,
    role: user.get('role') as MeResponse['role'],
    status: user.get('status') as MeResponse['status'],
    matricula: user.get('matricula') as string,
    email: user.get('email') as string,
    // Without a name the screens show the matrícula (decided on 19/10).
    fullName: orNull(user.get('fullName') as string | undefined),
    initials: orNull(user.get('initials') as string | undefined),
    course: orNull(user.get('course') as string | undefined),
    entryYear: orNull(user.get('entryYear') as number | undefined),
    deskLabel: orNull(user.get('deskLabel') as string | undefined),
    activeLoanCount: user.get('activeLoanCount') as number,
    activeQueueCount: user.get('activeQueueCount') as number,
    openFineTotalCents: user.get('openFineTotalCents') as number,
    booksReadByYear: user.get('booksReadByYear') as Record<string, number>,
    notificationPrefs: user.get('notificationPrefs') as Record<string, boolean>,
    onboardingSeenAt:
      optionalDate(user.get('onboardingSeenAt'))?.toISOString() ?? null,
  }
}

// GET /me
export async function getMe(uid: string): Promise<MeResponse> {
  const user = await getDb().collection(USERS).doc(uid).get()
  if (!user.exists) {
    throw new AppError(404, 'profile_not_found', 'Perfil não encontrado.')
  }
  return toMe(uid, user)
}

// PATCH /me: the student tells the full name after signing up (decided on
// 19/10). The normalized name and the initials are derived from it.
export async function updateFullName(
  uid: string,
  fullName: string,
): Promise<MeResponse> {
  const ref = getDb().collection(USERS).doc(uid)
  await ref.update({
    fullName,
    fullNameNormalized: normalizeText(fullName),
    initials: initialsOf(fullName),
    updatedAt: new Date(),
  })
  return toMe(uid, await ref.get())
}

// POST /auth/logout: `authenticate` checks revocation, so the ID tokens already
// issued stop working on the API right away.
export async function logout(uid: string): Promise<void> {
  await getAdminAuth().revokeRefreshTokens(uid)
}
