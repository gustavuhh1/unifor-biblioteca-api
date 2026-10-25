import { SCHEDULER_SERVICE_ACCOUNT_NAME } from '../jobs.constants.js'

// E-mail da conta de serviço do Cloud Scheduler no projeto: é quem o token OIDC
// diz que é (RF-SIS-05). A API confere este e-mail, e o script que cria os jobs usa o
// mesmo, então os dois nunca discordam.
export function schedulerEmail(projectId: string): string {
  return `${SCHEDULER_SERVICE_ACCOUNT_NAME}@${projectId}.iam.gserviceaccount.com`
}
