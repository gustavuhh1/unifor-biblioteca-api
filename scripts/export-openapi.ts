// Grava o contrato da API (o mesmo documento do Swagger em /docs) num arquivo
// JSON, para o app ter as rotas e os schemas em docs/api-openapi.json.
//   npm run openapi:export -- ../ubapp/docs/api-openapi.json
// Sem caminho, grava em api-openapi.json na pasta atual. Não toca no banco.
import { writeFile } from 'node:fs/promises'
import { buildOpenApiDocument } from '../src/docs/openapi.js'

const target = process.argv[2] ?? 'api-openapi.json'
const document = buildOpenApiDocument('production')
await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
console.log(
  `Gravado ${target}: ${Object.keys(document.paths ?? {}).length} rotas.`,
)
