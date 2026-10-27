# API — decisões técnicas (rascunho, 18/10/2026)

Anotação temporária. Ainda sem código: vira o README e a estrutura do `unifor-biblioteca-api` quando o desenvolvimento começar.

## Stack (decidido pelo Gustavo em 18/10)

- **Node + TypeScript** (versão LTS atual do Node, conferir no dia).
- **Express** como framework web.
- **Zod** para validar os schemas de entrada (body, params, query) e as variáveis de ambiente.
- **Swagger** (OpenAPI) para documentar as rotas, gerado a partir dos schemas do Zod com **@asteasolutions/zod-to-openapi** e servido por **swagger-ui-express** (ex.: `/docs`). Conferir no dia a compatibilidade com a versão do Zod instalada.
- **date-fns** (v4) com **@date-fns/tz** para datas: somar dias e horas, comparar prazos e formatar em pt-BR, sempre no fuso `America/Fortaleza` (`TZDate`). A regra de dia útil (fins de semana, feriados, recessos, sábado com balcão aberto, vencimento no fechamento) é uma função nossa em `src/shared/`, feita com as peças do date-fns e coberta por testes unitários. O `addBusinessDays` do date-fns não serve sozinho: ele não conhece feriados nem recessos.
- **@google/genai** (SDK oficial do Google) para o Gemini do Assistente, com nova tentativa no modelo reserva quando o Gemini responde 503 ou 429 (decidido em 27/10).
- **@simplewebauthn/server** para o passkey no lado da API: gera as opções e o desafio de cadastro e de login e confere a resposta do celular (RP ID `uni-books.app`).
- **Ferramentas de desenvolvimento:** **tsx** para rodar o TypeScript sem compilar e reiniciar ao salvar (`npm run dev`); **ESLint + Prettier** para padronizar o código, com Prettier **sem ponto e vírgula** (`"semi": false`). O build de produção continua com `tsc`.
- **morgan** (middleware da equipe do Express) para o log de requisições: formato `dev` no desenvolvimento e `short` em produção; nunca registra corpo nem cabeçalhos; `/health` fica fora do log.
- **Vitest** só para **testes unitários** (regras de negócio e validações). Sem teste de ponta a ponta, por causa do prazo curto.
- Já definido antes: Firestore pelo Firebase Admin, Firebase Emulator Suite para teste, deploy no Cloud Run, variáveis em `infra-contas-e-chaves.md`, seed em `scripts/seed.ts` (seção 8 de `modelo-de-dados-firestore.md`).

## Estrutura de pastas proposta (por módulo)

```
unifor-biblioteca-api/
├── src/
│   ├── app.ts              # monta o Express, middlewares e rotas
│   ├── server.ts           # sobe o servidor (porta do Cloud Run)
│   ├── config/             # env validado com Zod, Firebase Admin
│   ├── middlewares/        # auth (ID token), perfil (aluno/bibliotecário), erros, validação
│   ├── modules/            # um por área: routes, controller, service, schemas, testes
│   │   ├── auth/           # cadastro, token de e-mail, senha, passkeys
│   │   ├── catalog/        # acervo, Open Library e BrasilAPI
│   │   ├── loans/          # empréstimos, renovação, retirada
│   │   ├── queues/         # filas
│   │   ├── fines/          # multas
│   │   ├── desk/           # balcão do bibliotecário
│   │   ├── saved/          # salvos e pastas
│   │   ├── notifications/  # avisos, push e e-mail
│   │   ├── assistant/      # Assistente (Gemini)
│   │   └── jobs/           # rotinas do Cloud Scheduler
│   ├── shared/             # dias úteis, feriados, datas (America/Fortaleza), erros
│   └── docs/               # Swagger
├── scripts/seed.ts         # primeira tarefa
├── firestore.rules
├── firestore.indexes.json
├── firebase.json           # emuladores
├── Dockerfile
├── .env.example            # só nomes das variáveis, sem valores
└── README.md
```

Testes unitários ficam junto do código (`*.test.ts`).
