// Endereço público da API (Firebase Hosting em frente ao Cloud Run, docs/infra.md).
// O Swagger o lista como servidor de produção e o Cloud Scheduler o usa como
// destino e como audiência do token que prova quem está chamando as rotinas.
export const PRODUCTION_API_URL = 'https://api.uni-books.app'
