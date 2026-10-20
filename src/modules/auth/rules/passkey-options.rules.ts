import type {
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
} from '@simplewebauthn/server'
import { RP_NAME, SUPPORTED_ALGORITHMS } from '../auth.constants.js'
import type { CredentialRef } from '../auth.types.js'

// O que entra nas opções do passkey, separado das chamadas da biblioteca para as
// regras poderem ser testadas sem rodar o WebAuthn. Funções puras.

// Monta as origens aceitas: a origem web do RP ID mais as do app Android
// (android:apk-key-hash:...), que é o que o celular informa nesse caso.
export function buildExpectedOrigins(
  rpId: string,
  androidOrigins: readonly string[],
): string[] {
  return [`https://${rpId}`, ...androidOrigins]
}

// Passkey é biometria ou PIN do celular, então a verificação do usuário é
// obrigatória e a chave tem de ser descobrível (RF-AUT-04, RNF-SEG-03).
// Monta as opções de criação do passkey, sem usar o e-mail do aluno.
export function buildRegistrationOptionsInput(input: {
  rpId: string
  uid: string
  matricula: string
  fullName?: string
  existingCredentials: readonly CredentialRef[]
}): GenerateRegistrationOptionsOpts {
  return {
    rpName: RP_NAME,
    rpID: input.rpId,
    // Nunca o e-mail: o celular mostra a matrícula.
    userName: input.matricula,
    userDisplayName: input.fullName ?? input.matricula,
    userID: new TextEncoder().encode(input.uid),
    attestationType: 'none',
    supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
    // O aparelho que já tem um passkey da conta se recusa a criar outro
    // (RF-AUT-10).
    excludeCredentials: input.existingCredentials.map(toDescriptor),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  }
}

// Monta as opções do login com passkey (RF-AUT-05): lista os passkeys da
// matrícula e exige a verificação do usuário.
export function buildAuthenticationOptionsInput(input: {
  rpId: string
  credentials: readonly CredentialRef[]
}): GenerateAuthenticationOptionsOpts {
  return {
    rpID: input.rpId,
    allowCredentials: input.credentials.map(toDescriptor),
    userVerification: 'required',
  }
}

// Copia só os campos que existem, porque o Firestore e a biblioteca recusam
// undefined.
function toDescriptor(credential: CredentialRef): CredentialRef {
  return credential.transports
    ? { id: credential.id, transports: credential.transports }
    : { id: credential.id }
}

// Lê o desafio que o celular assinou, que vai dentro do clientDataJSON (JSON em
// base64url). Devolve undefined se o dado não for um clientDataJSON.
export function challengeFromClientData(
  clientDataJSON: string,
): string | undefined {
  try {
    const clientData: unknown = JSON.parse(
      Buffer.from(clientDataJSON, 'base64url').toString('utf8'),
    )
    if (
      typeof clientData === 'object' &&
      clientData !== null &&
      'challenge' in clientData &&
      typeof clientData.challenge === 'string' &&
      clientData.challenge.length > 0
    ) {
      return clientData.challenge
    }
  } catch {
    // Não é base64url nem JSON válido: vale como "sem desafio".
  }
  return undefined
}
