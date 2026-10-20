import { getAdminAuth } from '../../../config/firebase.js'
import { initialsOf, normalizeText } from '../../../shared/text.js'
import type { User } from '../../../shared/types/index.js'
import type { MeResponse } from '../auth.types.js'
import * as usersRepository from '../repositories/users.repository.js'

// Campo ausente vira null na resposta.
const orNull = <T>(value: T | undefined): T | null => value ?? null

// Monta a resposta de /me a partir do documento do usuário. Sem nome, as telas
// mostram a matrícula (decidido em 19/10); o authEmail nunca sai.
function toMe(uid: string, user: User): MeResponse {
  return {
    uid,
    role: user.role,
    status: user.status,
    matricula: user.matricula,
    email: user.email,
    fullName: orNull(user.fullName),
    initials: orNull(user.initials),
    course: orNull(user.course),
    entryYear: orNull(user.entryYear),
    deskLabel: orNull(user.deskLabel),
    activeLoanCount: user.activeLoanCount,
    activeQueueCount: user.activeQueueCount,
    openFineTotalCents: user.openFineTotalCents,
    booksReadByYear: user.booksReadByYear,
    notificationPrefs: { ...user.notificationPrefs },
    onboardingSeenAt: user.onboardingSeenAt?.toISOString() ?? null,
  }
}

// Devolve os dados de quem está logado (GET /me). O authenticate já respondeu
// 403 para conta sem perfil, então o documento existe aqui.
export async function getMe(uid: string): Promise<MeResponse> {
  const user = await usersRepository.findById(uid)
  return toMe(uid, user as User)
}

// O aluno informa o nome completo depois do cadastro (PATCH /me, decidido em
// 19/10). O nome normalizado e as iniciais saem dele.
export async function updateFullName(
  uid: string,
  fullName: string,
): Promise<MeResponse> {
  await usersRepository.updateFullName(
    uid,
    {
      fullName,
      fullNameNormalized: normalizeText(fullName),
      initials: initialsOf(fullName),
    },
    new Date(),
  )
  return getMe(uid)
}

// Encerra a sessão (RF-AUT-11): revoga os refresh tokens. O authenticate confere
// a revogação, então os ID tokens já emitidos param de valer na hora na API.
export async function logout(uid: string): Promise<void> {
  await getAdminAuth().revokeRefreshTokens(uid)
}
