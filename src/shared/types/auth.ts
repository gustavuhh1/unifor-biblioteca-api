import type {
  ChallengePurpose,
  EmailTokenPurpose,
  Timestamps,
} from './enums.js'

// Documentos de acesso (docs/modelo-de-dados-firestore.md, seções 2.3 a 2.5).

// emailTokens/{tokenId}: token de 6 dígitos (confirmação e recuperação), 20
// minutos, uso único. O código nunca é gravado em texto, só o hash.
export interface EmailToken extends Timestamps {
  uid: string
  purpose: EmailTokenPurpose
  // SHA-256 do salt com os 6 dígitos.
  codeHash: string
  salt: string
  // E-mail real para onde o token foi enviado.
  sentTo: string
  // createdAt + 20 minutos. Também é o campo da política de TTL.
  expiresAt: Date
  usedAt?: Date
  // Preenchido quando um novo token do mesmo purpose é pedido.
  invalidatedAt?: Date
  // Tentativas erradas; com 5 o token fica inválido.
  attempts: number
}

// passkeys/{credentialId}: só a chave pública de cada passkey (só aluno, só
// Android). O id do documento é o credentialId em base64url.
export interface Passkey extends Timestamps {
  uid: string
  // Chave pública COSE em base64url.
  publicKey: string
  signCount: number
  transports?: string[]
  // Nome do aparelho, ex.: "Galaxy A54" (Meus passkeys).
  deviceName: string
  aaguid?: string
  lastUsedAt?: Date
  revokedAt?: Date
}

// passkeyChallenges/{challengeId}: desafio de uso único do passkey.
export interface PasskeyChallenge extends Timestamps {
  // 32 bytes aleatórios em base64url, novos a cada tentativa.
  challenge: string
  purpose: ChallengePurpose
  // Registro: o aluno logado. Login: o dono da matrícula digitada.
  uid?: string
  // createdAt + 5 minutos. Campo de TTL.
  expiresAt: Date
  usedAt?: Date
}
