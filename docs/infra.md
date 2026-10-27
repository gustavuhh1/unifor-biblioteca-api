# Unifor Biblioteca — infraestrutura, contas e chaves

Atualizado em 17/10/2026 (repositórios e app único: 18/10; deploy: 24/10; conferência dos itens de 18 e 19/10: 27/10). **Este documento não contém nenhum valor secreto.** Ele registra só o nome de cada variável, onde ela fica guardada e como testar. As chaves de verdade ficam no Secret Manager do projeto `estoque-pay` (produção) e no arquivo `.env` local, que está no `.gitignore` e nunca vai para o Git.

Legenda de status: ✅ feito · ⏳ aguardando (DNS, verificação ou teste) · ⬜ pendente.
Responsáveis: **Gustavo** (contas, cartão, DNS, chaves) e **Claude** (pesquisa, configuração, scripts, código).

## Visão geral

| Item | Valor |
|---|---|
| Projeto do Google Cloud e do Firebase (produção) | ID `estoque-pay`, nome de exibição "Unifor-biblioteca", conta Google com os créditos grátis |
| Projeto sem faturamento (chaves grátis) | Projeto criado pelo AI Studio. Guarda a chave do Gemini. **Nunca ligar faturamento nele.** |
| Região | `southamerica-east1` (São Paulo) para Firestore e Cloud Run |
| Domínio | `uni-books.app` (Name.com, GitHub Student Pack, vence em 16/10/2027, renovação automática desligada) |
| API | `api.uni-books.app` → Firebase Hosting → Cloud Run |
| Autenticação | Firebase Authentication (e-mail e senha): senha e sessão ficam no Firebase. O passkey é o login principal do aluno nas duas entregas (app único desde 18/10); a API o confere e troca por um custom token do Firebase. |
| Código | Dois repositórios, só com a branch `main`: [unifor-biblioteca-api](https://github.com/gustavuhh1/unifor-biblioteca-api) e [unifor-biblioteca-app](https://github.com/gustavuhh1/unifor-biblioteca-app). Entregas por tag (`integration-delivery`, `mobile-delivery`). |
| E-mail | Resend, enviando de `email.uni-books.app` |
| Teste | Firebase Emulator Suite (local, sem custo, sem chaves de produção) |

## Variáveis de ambiente

| Variável | Segredo? | Onde fica | Serviço |
|---|---|---|---|
| `RESEND_API_KEY` | sim | Secret Manager `resend-api-key` e `.env` | Resend |
| `EMAIL_FROM` | não | variável do Cloud Run e `.env` (`Unifor Biblioteca <nao-responda@email.uni-books.app>`) | Resend |
| `FERIADOS_API_KEY` | sim | Secret Manager `feriados-api-key` e `.env` | FeriadosAPI |
| `GEMINI_API_KEY` | sim | Secret Manager `gemini-api-key` e `.env` | Gemini |
| `GEMINI_MODEL` | não | variável do Cloud Run e `.env` (`gemini-3.8-flash`; reserva `gemini-3.1-flash-lite`) | Gemini |
| `GOOGLE_CLOUD_PROJECT` | não | `estoque-pay` | Firestore, Firebase Admin e Secret Manager |
| `PASSKEY_RP_ID` | não | `uni-books.app` (não trocar: invalida os passkeys) | Passkey |
| `PASSKEY_ANDROID_ORIGINS` | não | variável do Cloud Run e `.env` | Origens aceitas no passkey do app Android, no formato `android:apk-key-hash:<SHA-256 do certificado de assinatura, em base64url>`, separadas por vírgula (uma para o build de desenvolvimento). Vem do certificado do app, não é segredo |
| `SEED_TEST_PASSWORD` | sim | só no `.env` de quem roda o seed | Senha das contas de teste criadas pelo script de carga (seção 8 do modelo de dados). Nunca no código |
| `AUTH_EMAIL_DOMAIN` | não | `contas.uni-books.app` (e-mail interno das contas no Firebase: `<matrícula>@contas.uni-books.app`; não recebe mensagens) | Firebase Authentication |
| `EXPO_PUBLIC_FIREBASE_*` | não | configuração web do Firebase no app (apiKey, authDomain, projectId, appId). É pública por natureza; a proteção vem das regras e da API | App (SDK JavaScript do Firebase) |

`PASSKEY_RP_ID` e `AUTH_EMAIL_DOMAIN` são obrigatórias com `NODE_ENV=production`: a API não sobe sem elas (no desenvolvimento são opcionais).

Não há `JWT_SECRET`: desde 17/10 a sessão é o ID token do Firebase, e a API o confere com o Firebase Admin. A API no Cloud Run usa a própria conta de serviço para o Firebase Admin, sem arquivo de chave.

O Secret Manager dá 6 versões de segredo ativas por mês de graça, somando todos os projetos da conta. Com os 4 segredos acima, cabe. Ao trocar uma chave, **destruir a versão antiga**.

## 1. Google Cloud e Firebase (projeto `estoque-pay`)

| Item | Status | Responsável | Data | Como testar |
|---|---|---|---|---|
| Faturamento ligado ao projeto | ✅ | Gustavo | 17/10 | `gcloud billing projects describe estoque-pay` → `billingEnabled: true` |
| Alerta `alerta-zero` (R$ 1/mês: 50% e 100% real, 100% previsto, nível grátis descontado) | ✅ conferido pelo Gustavo | Gustavo | 23/10 | `gcloud billing budgets list --billing-account=<ID>` mostra `alerta-zero` |
| Teto de R$ 10/mês no Cloud Run (pausa o serviço) | ✅ conferido pelo Gustavo | Gustavo | 23/10 | Console → Faturamento → Orçamentos → "Spend cap status: Configured" |
| APIs ativadas: Cloud Run, Artifact Registry, Cloud Build, Secret Manager, Cloud Scheduler, Firebase, Firestore, Identity Toolkit, IAM Credentials | ⏳ conferir | Gustavo | 18/10 | `gcloud services list --enabled --project=estoque-pay` |
| Firestore `(default)` em `southamerica-east1` | ✅ | Gustavo | 17/10 | `gcloud firestore databases list --project=estoque-pay` |
| Firebase Authentication com o provedor **E-mail/senha** ativado (login com senha e recuperação) | ✅ | Gustavo | 18/10 | Console do Firebase → Authentication → Método de login → E-mail/senha "Ativado". Conferido em 27/10: o login com matrícula e senha funciona em produção |
| App da Web registrado no Firebase (gera a configuração pública do SDK JavaScript) | ✅ | Gustavo | 19/10 | Configurações do projeto → Seus apps mostra o app da Web. Conferido em 27/10: `firebase apps:list --project estoque-pay` lista "Unifor Biblioteca App" (WEB) |
| Conta de serviço do Cloud Run com o papel **Service Account Token Creator** sobre ela mesma (para o custom token do passkey) | ✅ | Claude | 24/10 | `gcloud iam service-accounts get-iam-policy <conta>` mostra `roles/iam.serviceAccountTokenCreator` |
| Firebase Hosting: `uni-books.app` (TXT de posse, TXT `_acme-challenge`, A `199.36.158.100`) | ✅ verificado | Gustavo | 17/10 | Status "Conectado" no Firebase; `curl -I https://uni-books.app` responde |
| Firebase Hosting: `api.uni-books.app` | ✅ verificado | Gustavo | 17/10 | Status "Conectado" no Firebase |
| Apagar o projeto `unifor-biblioteca` da outra conta Google | ⬜ | Gustavo | 18/10 | `gcloud projects list` na outra conta não mostra o projeto |
| Repositório do Artifact Registry (`unibooks`) com regra de manter só 2 imagens (0,5 GiB grátis) | ✅ | Claude | 24/10 | `gcloud artifacts repositories list-cleanup-policies unibooks --location=southamerica-east1 --project=estoque-pay` mostra `keepCount: 2` |
| API publicada no Cloud Run (`unibooks-api`) e `api.uni-books.app` encaminhando para ela (seção 6) | ✅ | Claude e Gustavo | 24/10 | `curl https://api.uni-books.app/health` → `{"status":"ok"}` |

Custos: Cloud Run (180 mil vCPU-s, 360 mil GiB-s e 2 milhões de requisições por mês), Firestore (1 GiB, 50 mil leituras e 20 mil gravações por dia, um banco grátis por projeto), Cloud Build (2.500 min/mês) e Artifact Registry (0,5 GiB) dentro da cota grátis. O Hosting corta requisições em 60 s. A cota grátis do Firebase Authentication com e-mail e senha ainda não foi conferida na documentação oficial; para as poucas contas do projeto não deve haver custo, mas conferir antes do deploy.

## 2. Resend (e-mail do token de 20 minutos)

| Item | Status | Responsável | Data | Como testar |
|---|---|---|---|---|
| Conta criada | ✅ | Gustavo | 17/10 | — |
| Domínio `email.uni-books.app` na região `sa-east-1`, com DKIM e os CNAME `send`/`rsend` na Name.com | ✅ verificado | Gustavo | 17/10 | Domínio "Verified" no painel |
| Chave exposta na conversa revogada; chave nova só de envio, restrita ao domínio | ⏳ confirmar a revogação | Gustavo | 17/10 | A chave antiga não aparece mais em API Keys |
| Segredo `resend-api-key` com versão (Secret Manager e `.env`) | ✅ | Gustavo | 17/10 | `gcloud secrets versions list resend-api-key --project=estoque-pay` |
| E-mail de teste chega na **caixa de entrada** do @edu.unifor.br do Gustavo (não no spam) | ✅ | Gustavo | 20/10 | Testado em 20/10: o e-mail chegou na caixa de entrada do @edu.unifor.br. Para repetir, enviar pelo painel do Resend ou por `curl` e abrir a caixa da Unifor |

Plano grátis: 3.000 e-mails por mês, 100 por dia, 3 domínios. Não há cobrança por excedente no plano grátis.

## 3. FeriadosAPI (dias úteis, multa e prazos)

| Item | Status | Responsável | Data | Como testar |
|---|---|---|---|---|
| Conta criada (plano Free, sem cartão) | ✅ | Gustavo | 17/10 | — |
| Segredo `feriados-api-key` com versão | ✅ | Gustavo | 17/10 | `curl` em `/api/v1/feriados/cidade/2304400?ano=2026` → `"total":15` |

Fortaleza = IBGE `2304400`. Uma chamada por ano traz os feriados nacionais, estaduais e municipais, guardados no Firestore (`feriados/<ano>`). O plano grátis cobre as 27 capitais, com 60 req/min. Recesso acadêmico é cadastrado pelo projeto. Teste automático: Marina (venceu sáb 10/10) → 13, 14 e 15/10 → R$ 6,00.

## 4. Gemini (Assistente)

| Item | Status | Responsável | Data | Como testar |
|---|---|---|---|---|
| Chave criada no AI Studio, em projeto **sem faturamento** (plano Free) | ✅ | Gustavo | 17/10 | AI Studio → API keys → plano "Free" |
| Segredo `gemini-api-key` com versão | ✅ | Gustavo | 17/10 | `curl` em `generateContent` com `gemini-3.8-flash` → resposta com `"text"` |
| Limites do plano grátis do modelo escolhido | ⬜ conferir | Gustavo | 18/10 | https://aistudio.google.com/rate-limit |

Sem faturamento no projeto da chave, não há como cobrar: ao passar do limite, a chamada só falha. No plano grátis o Google usa os dados para melhorar os produtos. Os dados do app são fictícios; registrar isso no README.

## 5. Open Library e BrasilAPI (API externa da cadeira de Integração)

Decidido em 23/10: a Google Books saiu (erros 503 e 429) e entram duas APIs que **não pedem chave**. Não há segredo nem variável de ambiente para elas.

| Item | Status | Responsável | Data | Como testar |
|---|---|---|---|---|
| Open Library responde | ⬜ conferir | Gustavo | 23/10 | `curl -A "UniBooks/1.0 (+https://uni-books.app)" "https://openlibrary.org/api/books?bibkeys=ISBN:9780132350884&format=json&jscmd=data"` → título "Clean Code" |
| BrasilAPI responde | ⬜ conferir | Gustavo | 23/10 | `curl https://brasilapi.com.br/api/isbn/v1/9788535914849` → título "1984" e a sinopse |
| Apagar o segredo `google-books-api-key` e a linha `GOOGLE_BOOKS_API_KEY` do `.env` | ⬜ | Gustavo | 23/10 | `gcloud secrets list` sem o segredo |

As 2 requisições usadas são a da Open Library (`api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data`) e a da BrasilAPI (`isbn/v1/{isbn}`), feitas ao mesmo tempo, com 5 segundos de limite cada. A Open Library pede um `User-Agent` que identifique o app (`UniBooks/1.0 (+https://uni-books.app)`).

## 6. Deploy da API (Cloud Run e Hosting)

Primeiro deploy em 24/10/2026 (RNF-IMP-01, RNF-SEG-01 e RNF-SEG-07). Nada aqui é segredo: os valores secretos ficam no Secret Manager e a origem do passkey vem do `.env` local.

| Item | Valor |
|---|---|
| Serviço | `unibooks-api`, Cloud Run, `southamerica-east1`, projeto `estoque-pay` |
| Conta de serviço | `unibooks-api@estoque-pay.iam.gserviceaccount.com` (papéis: `datastore.user`, `firebaseauth.admin`, `secretmanager.secretAccessor` e Token Creator sobre ela mesma) |
| Instâncias | mínimo 0 e máximo 2; timeout de 60 s (o limite do Hosting) |
| Acesso | público (`--allow-unauthenticated`): quem protege as rotas é o ID token, conferido pela própria API |
| Segredos | `RESEND_API_KEY`, `FERIADOS_API_KEY` e `GEMINI_API_KEY`, ligados ao Secret Manager na versão `:latest` |
| Variáveis não secretas | `NODE_ENV`, `GOOGLE_CLOUD_PROJECT`, `PASSKEY_RP_ID`, `PASSKEY_ANDROID_ORIGINS`, `AUTH_EMAIL_DOMAIN`, `EMAIL_FROM` e `GEMINI_MODEL`, lidas do `.env` do Gustavo (o `PORT` é do Cloud Run). **Nunca** vão `FIRESTORE_EMULATOR_HOST` nem `FIREBASE_AUTH_EMULATOR_HOST` |
| Imagens | Artifact Registry `southamerica-east1-docker.pkg.dev/estoque-pay/unibooks/api:<commit>`; a política em `deploy/artifact-cleanup-policy.json` guarda só as 2 mais recentes |
| Endereço oficial | `https://api.uni-books.app` (Hosting → Cloud Run). O endereço `*.run.app` serve só para teste interno |
| Hosting | um único site (`estoque-pay`) com `uni-books.app` e `api.uni-books.app`. O `firebase.json` manda tudo para o Cloud Run (`rewrites`), e o `assetlinks.json` continua sendo servido como arquivo. Efeito colateral aceito: `uni-books.app` também responde com a API fora dos arquivos estáticos; separar exigiria um segundo site |

Comandos (cada um pede que o ID do projeto seja digitado):

1. `npm run deploy:firestore`: publica regras, índices e TTL do Firestore.
2. `npm run deploy`: monta a imagem no Cloud Build e publica no Cloud Run. Exige a árvore git limpa, porque a imagem leva o commit como tag.
3. `npx firebase deploy --only hosting --project estoque-pay`: só quando o `firebase.json` ou o `assetlinks.json` mudarem.

Conferência depois do deploy: `/health` responde 200, `/docs` abre, `/me` sem token responde 401, `https://uni-books.app/.well-known/assetlinks.json` responde 200, `gcloud run services describe unibooks-api --region=southamerica-east1` mostra a conta de serviço e os segredos e nenhuma variável de emulador, e o log do morgan aparece no Cloud Logging. Ainda falta provar o cabeçalho `Authorization` passando pelo Hosting com um login de verdade (depende do seed em produção).

## 7. Cloud Scheduler (rotinas da API)

Criado com `npm run deploy:scheduler` (pede o ID do projeto digitado, pode rodar de novo sem duplicar nada). Nada aqui é segredo.

| Item | Valor |
|---|---|
| Conta de serviço | `unibooks-scheduler@estoque-pay.iam.gserviceaccount.com`, sem nenhum papel: a API é pública e confere o token por conta própria |
| Chamada | `POST https://api.uni-books.app/jobs/<rotina>` com o token OIDC do Google dessa conta, audiência `https://api.uni-books.app` (Hosting → Cloud Run, timeout de 60 s) |
| Confere na API | assinatura RS256 contra as chaves públicas do Google, emissor, audiência, validade e o e-mail da conta de serviço. Sem token ou token inválido: 401. Token de outra conta: 403. A sessão do app nunca vale |
| Região e fuso | `southamerica-east1`, `America/Fortaleza` |
| Tentativas | 1 nova tentativa por erro; cada execução fica em `jobRuns` |

| Job | Quando | O que faz |
|---|---|---|
| `unibooks-advance-queues` | a cada 5 min | quem passou das 24h para confirmar a vez sai da fila e o próximo ganha a vez (RF-FIL-07) |
| `unibooks-expire-pickups` | a cada 15 min | pedido não retirado no prazo expira e o exemplar volta (RF-EMP-06) |
| `unibooks-due-reminders` | todo dia, 8h | lembrete 2 dias antes e no dia, aviso de atraso e último dia para retirar (RF-SIS-05) |
| `unibooks-accrue-fines` | todo dia, 6h | começa a contar a multa do empréstimo atrasado (RF-MUL-01) |
| `unibooks-refresh-holidays` | segunda, 3h | busca na FeriadosAPI os feriados do ano atual e do próximo, se faltarem (RF-SIS-01) |

Custo: o Cloud Scheduler dá 3 jobs grátis por conta de faturamento; os outros 2 custam cerca de US$ 0,10 por mês cada.

| Verificação | Estado | Quem | Quando | Como conferir |
|---|---|---|---|---|
| Cloud Scheduler ativado no projeto | ✅ | Gustavo | 26/10 | `gcloud services list --enabled --project=estoque-pay` mostra `cloudscheduler.googleapis.com` |
| API publicada com a rota `/jobs` | ✅ | Gustavo | 26/10 | `npm run deploy`; `POST /jobs/accrue_fines` sem token responde 401 |
| Jobs criados | ✅ | Gustavo (com o "pode") | 26/10 | `gcloud scheduler jobs list --location=southamerica-east1 --project=estoque-pay` mostra 5 jobs |
| Uma rotina roda e termina em `ok` | ✅ | Gustavo | 26/10 | `gcloud scheduler jobs run unibooks-advance-queues --location=southamerica-east1 --project=estoque-pay` e conferir `jobRuns`; as rotinas já rodam sozinhas e terminam em `ok` |

## 8. Checklist da terça, 27/10 (manhã)

Tudo o que toca produção só roda com o "pode" do Gustavo, um passo por vez.

| Passo | Quem | Como |
|---|---|---|
| Recarregar os dados de demonstração (as rotinas já mexeram nos dados do seed de 25/10) | Gustavo | `npm run seed -- --prod --reset` (pede a frase "apagar tudo"); fazer depois do job das 8h |
| `--min-instances 1` no Cloud Run antes da apresentação, para a primeira chamada não acordar a API; **voltar para 0 depois** | Gustavo (com o "pode") | `gcloud run services update unibooks-api --region=southamerica-east1 --project=estoque-pay --min-instances=1` e, depois da apresentação, `--min-instances=0`. Um `npm run deploy` feito no meio volta o mínimo para 0 |
| Conferir `/health`, `/docs` e um login de teste | Gustavo | `/health` responde 200 e `/docs` lista as rotas |
| Criar a tag `integration-delivery` nos dois repositórios | Claude, quando o Gustavo mandar | `git tag` na `main` de cada repositório |

## Ordem de execução

Protótipo de passkey na **terça, 20/10**. Código a partir de quarta, 21/10. Entrega de Integração em 27/10.

1. **Sáb 17/10 — feito:** domínio, faturamento, Firestore, domínios `uni-books.app` e `api.uni-books.app` conectados no Hosting, domínio do Resend verificado, e as chaves do Resend, FeriadosAPI e Gemini guardadas no Secret Manager e no `.env` local. Escopo fechado.
2. **Dom 18/10 (Gustavo, ~20 min):**
   - conferir o alerta `alerta-zero`, o teto do Cloud Run e as APIs ativas;
   - ativar o provedor E-mail/senha no Firebase Authentication;
   - mandar um e-mail de teste do Resend para o seu @edu.unifor.br e ver se chega na caixa de entrada;
   - confirmar que a chave antiga do Resend foi revogada;
   - apagar o projeto `unifor-biblioteca`;
   - conferir as cotas do Gemini.
3. **Seg 19/10 (Claude e Gustavo):**
   - definir o nome do pacote Android;
   - registrar o app da Web no Firebase e dar à conta de serviço o papel Service Account Token Creator;
   - publicar no Hosting o `/.well-known/assetlinks.json`, com o pacote e a impressão SHA-256 da chave de assinatura do build de teste;
   - preparar os dois repositórios (`unifor-biblioteca-api` e `unifor-biblioteca-app`), cada um só com a `main`, com `.gitignore` (inclui `.env`), e o kanban no GitHub Projects a partir do CSV.
4. **Ter 20/10:** protótipo de passkey num Android físico, com RP ID `uni-books.app`, terminando no custom token do Firebase e na sessão aberta no app.
5. **Qua 21/10 em diante:** código da API (Cloud Run + Hosting) e primeiro deploy, com a política de limpeza do Artifact Registry. ✅ Primeiro deploy em 24/10 (seção 6).

Depois (não bloqueia o protótipo): Expo Push só no Android (credenciais do FCM). O Cloud Scheduler está na seção 7. No iPhone não há push nem passkey (dependem da conta paga da Apple); como o app vai rodar lá será decidido depois que o Android funcionar.
