// Constantes do módulo de avisos (RF-AVI-01 a RF-AVI-04).

// Quantos avisos a lista devolve (os mais novos primeiro).
export const NOTIFICATION_LIST_LIMIT = 100

// Quantos aparelhos de um aluno entram no envio do push.
export const DEVICE_LIST_LIMIT = 20

// Limites dos dados do aparelho (seção 2.15).
export const DEVICE_NAME_MAX_LENGTH = 100
export const APP_VERSION_MAX_LENGTH = 30

// Forma do token que o app recebe do Expo: ExponentPushToken[...] ou
// ExpoPushToken[...].
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]\s]+\]$/
