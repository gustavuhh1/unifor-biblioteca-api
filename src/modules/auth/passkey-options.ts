import type {
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
} from '@simplewebauthn/server'
import { COSEALG } from '@simplewebauthn/server/helpers'

// What goes into the passkey options, kept apart from the library calls so the
// rules can be tested without running WebAuthn.

export const RP_NAME = 'Unifor Biblioteca'

// How long a challenge lives (docs/modelo-de-dados-firestore.md, 2.5).
export const CHALLENGE_TTL_MINUTES = 5

// Fixed instead of the library default, which also offers the experimental
// ML-DSA whenever the Node version supports it.
export const SUPPORTED_ALGORITHMS = [
  COSEALG.ES256,
  COSEALG.RS256,
  COSEALG.EdDSA,
]

export interface CredentialRef {
  id: string
  transports?: string[]
}

// The web origin of the RP ID plus the origins of the Android app
// (android:apk-key-hash:...), which is what the phone reports there.
export function buildExpectedOrigins(
  rpId: string,
  androidOrigins: readonly string[],
): string[] {
  return [`https://${rpId}`, ...androidOrigins]
}

// Passkeys are for the phone's biometrics or PIN, so user verification is
// required and the key must be discoverable (a real passkey).
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
    // Never the e-mail: the matrícula is what the phone shows.
    userName: input.matricula,
    userDisplayName: input.fullName ?? input.matricula,
    userID: new TextEncoder().encode(input.uid),
    attestationType: 'none',
    supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
    // A device that already has a passkey of the account refuses to make
    // another one (RF-AUT-10).
    excludeCredentials: input.existingCredentials.map(toDescriptor),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  }
}

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

function toDescriptor(credential: CredentialRef): CredentialRef {
  return credential.transports
    ? { id: credential.id, transports: credential.transports }
    : { id: credential.id }
}

// The challenge the phone signed is inside `clientDataJSON` (base64url JSON).
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
    // Not valid base64url or JSON: treated as no challenge.
  }
  return undefined
}
