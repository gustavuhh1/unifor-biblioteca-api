import { getDb } from '../../../config/firebase.js'
import { DEVICE_PLATFORM, type Device } from '../../../shared/types/index.js'
import * as devicesRepository from '../repositories/devices.repository.js'
import { toDeviceResponse } from '../rules/notice-view.rules.js'
import type { DeviceBody, DeviceResponse } from '../notifications.types.js'

// Aparelhos do aluno para o push (RF-AVI-02).

// Registra o aparelho ou atualiza `lastSeenAt` e os dados. Só o Android guarda o
// token do Expo; no iPhone ele é ignorado. Se o token mudou, o push do aparelho
// volta a valer (o Expo tinha recusado o antigo).
export async function registerDevice(
  uid: string,
  deviceId: string,
  body: DeviceBody,
): Promise<DeviceResponse> {
  return getDb().runTransaction(async (tx) => {
    const current = await devicesRepository.findById(uid, deviceId, tx)
    const at = new Date()
    const token =
      body.platform === DEVICE_PLATFORM.android ? body.expoPushToken : undefined
    const sameToken = current?.expoPushToken === token

    const device: Device = {
      platform: body.platform,
      expoPushToken: token,
      deviceName: body.deviceName,
      appVersion: body.appVersion,
      lastSeenAt: at,
      pushDisabledAt: sameToken ? current?.pushDisabledAt : undefined,
      createdAt: current?.createdAt ?? at,
      updatedAt: at,
    }
    devicesRepository.save(tx, uid, deviceId, device)
    return toDeviceResponse({ id: deviceId, ...device })
  })
}

// Tira o aparelho: o aluno saiu da conta e para de receber push nele.
export async function removeDevice(
  uid: string,
  deviceId: string,
): Promise<void> {
  await getDb().runTransaction(async (tx) => {
    devicesRepository.remove(tx, uid, deviceId)
  })
}
