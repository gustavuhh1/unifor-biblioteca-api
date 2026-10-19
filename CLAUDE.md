# Unifor Biblioteca — API (regras para o Claude Code)

Este repositório é a API REST do Unifor Biblioteca, um app de biblioteca universitária com dois perfis (aluno e bibliotecário). O dono é o Gustavo, estudante da Unifor. A API é o projeto de conclusão de duas cadeiras:

- **Técnicas de Integração de Sistemas:** entrega e apresentação em **29/10/2026** (tag `integration-delivery`). Nessa data **todo o escopo** precisa estar pronto, porque a API é demonstrada ao vivo pelo app.
- **Desenvolvimento Mobile:** entrega em **09/11/2026** (tag `mobile-delivery`). O app fica no repositório `unifor-biblioteca-app`.

Fale com o Gustavo em **português**, de forma direta, um passo por vez.

## Antes de qualquer tarefa

Leia os documentos de `docs/`. Eles são a fonte da verdade, e o escopo está **fechado**:

| Arquivo | Para quê |
|---|---|
| `docs/escopo.md` | O que entra e o que fica fora, regras de negócio, autenticação, rotas sugeridas, decisões e riscos |
| `docs/requisitos.md` | Os 85 RF e 28 RNF, com código, prioridade e entrega |
| `docs/modelo-de-dados-firestore.md` | As 24 coleções campo a campo, enums, operações, índices, TTL, regras, dados de demonstração e o script de carga (seção 8) |
| `docs/regras-e-decisoes.md` | Regras de negócio e decisões do design (inclui decisões do app, como as telas) |
| `docs/api-decisoes-tecnicas.md` | Stack, bibliotecas e estrutura de pastas da API |
| `docs/infra.md` | Contas, região, domínios e **nomes** das variáveis de ambiente (sem valores) |

Se dois documentos se contradizem, ou se uma tarefa exige algo que não está neles, **pare e pergunte ao Gustavo**. Não escolha sozinho.

## Escopo: o que não fazer

- Não implemente nada da lista **Fora** do escopo (ex.: pagamento pelo app, avaliações de livros, Assistente para o bibliotecário, filtros avançados na busca, sugestões do Assistente como aviso ou e-mail).
- Não crie funcionalidade, rota, coleção, campo ou regra que não esteja nos documentos. Melhorias ficam como sugestão para o Gustavo, nunca no código.
- Não troque bibliotecas da stack nem adicione dependências novas sem perguntar.
- Não mude regras de negócio para facilitar a implementação (prazos, limites, multa, fila). Se uma regra parecer errada, avise.
- O app nunca fala direto com o Firestore. Tudo passa pela API, e as regras do Firestore negam todo acesso de cliente (só o Admin SDK escreve).

## Stack (decidida)

- Node (LTS atual) + **TypeScript** (`strict`) + **Express**.
- **Zod** para validar body, params, query e as variáveis de ambiente.
- **Swagger** gerado dos schemas do Zod com `@asteasolutions/zod-to-openapi` e servido por `swagger-ui-express` em `/docs`.
- **firebase-admin** (Firestore e Firebase Authentication) e **Firebase Emulator Suite** para teste local.
- **@simplewebauthn/server** para o passkey (RP ID `uni-books.app`; não trocar, invalida os passkeys).
- **date-fns** + **@date-fns/tz**: datas sempre no fuso `America/Fortaleza` (`TZDate`). A regra de dia útil (fins de semana, feriados, recessos, sábado com balcão aberto, vencimento no fechamento) é função própria em `src/shared/`, com testes.
- **Vitest** só com **testes unitários** (regras de negócio, validações, datas). **Sem testes de ponta a ponta.**
- **tsx** para desenvolvimento; build de produção com `tsc`; deploy no **Cloud Run** (região `southamerica-east1`) com Dockerfile.
- **ESLint + Prettier**, Prettier com `"semi": false` (**sem ponto e vírgula**).
- Resend (e-mail), Gemini (Assistente), Google Books (API externa) e FeriadosAPI: os SDKs entram só quando o módulo correspondente for implementado.

## Convenções

- **Código** (nomes de variáveis, funções, arquivos, coleções e campos) em **inglês**, seguindo os nomes do modelo de dados.
- **Rotas** em inglês (decisão 14 do escopo). As rotas do escopo em português são nomes sugeridos: mantenha a mesma função e documente cada rota no Swagger.
- **Mensagens de erro para o usuário** em português (o app mostra), com um `code` em inglês estável. Sem sessão → 401; perfil errado → 403.
- **Commits em português**, curtos e no imperativo (ex.: `cria script de carga do banco`).
- Uma **branch curta por tarefa** (`feat/...`, `fix/...`, `chore/...`) com PR para a `main`. Nunca commitar direto na `main`. **Não faça push nem abra PR sem o Gustavo pedir.**
- Cite o código do requisito atendido no PR (ex.: `RF-EMP-01`).
- Dinheiro em **centavos** (inteiro). Datas gravadas em UTC; contas e textos em `America/Fortaleza`.
- Sessão: o app manda o **ID token do Firebase** no cabeçalho `Authorization: Bearer`; a API confere com o Admin SDK (incluindo revogação) e lê o `role` (`student` | `librarian`) em `users/{uid}`. Não há JWT próprio.
- Toda escrita que mexe em mais de um documento (empréstimo, fila, multa, cadastro) usa **transação** do Firestore, como descrito na seção 3 do modelo de dados.

## Segredos

- Nunca escreva chave, senha ou token no código, em testes, em logs ou em documentos. Nunca peça ao Gustavo para colar uma chave na conversa.
- Valores reais ficam no `.env` local (fora do Git) e no Secret Manager. O repositório tem só `.env.example` com os **nomes** das variáveis (lista em `docs/infra.md`).
- O repositório é **público**: confira o `git diff` antes de cada commit.

## Ambientes

- Por padrão, tudo roda contra o **Firebase Emulator Suite** (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`).
- Produção (projeto `estoque-pay`) só com ação explícita do Gustavo. Scripts que gravam em produção exigem a opção `--prod` e confirmação digitada.

## Ordem de trabalho combinada

1. Estrutura inicial do projeto (pastas, configurações, servidor com `/health` e `/docs`).
2. **Script de carga do banco (`scripts/seed.ts`)**, seção 8 de `docs/modelo-de-dados-firestore.md`. É obrigatório e vem antes das funcionalidades.
3. Módulos, um por vez, cada um com seus testes unitários.

## Comandos

- `npm run dev`: servidor em modo desenvolvimento (tsx, reinicia ao salvar)
- `npm run build` / `npm start`: compila com `tsc` e roda o resultado
- `npm test`: testes unitários (Vitest)
- `npm run lint` / `npm run format`: ESLint e Prettier
- `npm run emulators`: Firebase Emulator Suite (Firestore e Auth)
- `npm run seed`: carga do banco (emulador por padrão)
