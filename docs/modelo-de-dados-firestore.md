# Unifor Biblioteca — modelo de dados do Firestore

Versão 1 · 18/10/2026 · fonte: Documento de Escopo, Requisitos (RF e RNF, rev 59) e `design-unifor-biblioteca.md`.

Este documento define **todas as coleções, documentos e campos** do banco do sistema Unifor Biblioteca, com tipos, regras, índices, regras de segurança e dados de demonstração. Ele é a referência única para a API, para o script de carga inicial e para quem for criar o banco.

---

## 0. Instruções para quem for criar o banco (pessoa ou IA)

1. O banco é o **Cloud Firestore em modo nativo**, banco `(default)`, projeto `estoque-pay`, região `southamerica-east1`. O teste roda no **Firebase Emulator Suite** com o mesmo modelo.
2. O Firestore **não tem esquema fixo**: uma coleção passa a existir quando o primeiro documento é gravado nela. "Criar as tabelas" significa: gravar os documentos de configuração e os dados de demonstração (seção 6), publicar os índices (seção 4), as políticas de TTL (seção 4.3) e as regras de segurança (seção 5).
3. **Nomes de coleções e campos em inglês** (o código é em inglês, exigência da cadeira de Mobile). Textos mostrados ao usuário ficam em português.
4. **Quem grava no banco é só a API** (Node + Firebase Admin SDK). O app nunca lê nem grava direto (RNF-SEG-06). Por isso as regras de segurança negam todo acesso de cliente.
5. Convenções de tipo:
   - `timestamp` = Timestamp do Firestore, sempre gravado em UTC; a regra de negócio usa o fuso `America/Fortaleza` (UTC−3, sem horário de verão).
   - `date` = texto `"AAAA-MM-DD"`, para datas sem hora (feriados, recessos).
   - `money` = número inteiro em **centavos** (R$ 2,00 = `200`). Nunca usar número decimal para dinheiro.
   - `ref:<coleção>` = texto com o ID de um documento daquela coleção.
   - `enum` = texto com um dos valores listados.
   - `?` depois do tipo = campo opcional ou que pode ser `null`.
6. Todo documento tem `createdAt` e `updatedAt` (`timestamp`), gravados pela API, mesmo quando não aparecem nas tabelas.
7. **Não gravar senha em lugar nenhum** (RNF-SEG-04). Senha e sessão ficam só no Firebase Authentication.
8. **"Atrasado" não é estado salvo** (RF-SIS-03): é calculado comparando `dueAt` com a data de hoje.

---

## 1. Visão geral

### 1.1 Lista de coleções

| # | Caminho | ID do documento | O que guarda |
|---|---|---|---|
| 1 | `users/{uid}` | uid do Firebase Authentication | Aluno ou bibliotecário: perfil, dados, contadores e preferências |
| 2 | `matriculaIndex/{matricula}` | matrícula (7 dígitos) | Garante matrícula única e acha o usuário pela matrícula |
| 3 | `emailIndex/{email}` | e-mail real em minúsculas | Garante e-mail único |
| 4 | `emailTokens/{tokenId}` | automático | Token de 6 dígitos (confirmação e recuperação), 20 min, uso único |
| 5 | `passkeys/{credentialId}` | credentialId (base64url) | Chave pública de cada passkey (só aluno, só Android) |
| 6 | `passkeyChallenges/{challengeId}` | automático | Desafio de uso único do passkey |
| 7 | `works/{workId}` | slug do título + autor | A obra (título), que agrupa as edições |
| 8 | `books/{bookId}` | automático | A edição que aparece no acervo ("livro" nas telas) |
| 9 | `copies/{copyId}` | automático | Cada exemplar físico |
| 10 | `loans/{loanId}` | automático | Pedido e empréstimo, do pedido à devolução |
| 11 | `queueEntries/{entryId}` | automático | Cada lugar de um aluno na fila de uma edição |
| 12 | `fines/{fineId}` | automático | Multa por atraso de um empréstimo |
| 13 | `users/{uid}/savedBooks/{bookId}` | bookId | "Todos os salvos" e as pastas de cada livro salvo |
| 14 | `users/{uid}/folders/{folderId}` | automático | Pastas de Salvos |
| 15 | `users/{uid}/notifications/{notificationId}` | automático | Avisos dentro do app |
| 16 | `users/{uid}/devices/{deviceId}` | ID de instalação do app | Token de push (Expo) por aparelho |
| 17 | `users/{uid}/assistantMessages/{messageId}` | automático | Conversa com o Assistente |
| 18 | `users/{uid}/assistantActions/{actionId}` | automático | Ação proposta pelo Assistente, esperando confirmação |
| 19 | `recommendations/{uid}` | uid | "Recomendados para você" (cache) |
| 20 | `holidays/{year}` | ano, ex. `2026` | Feriados vindos da FeriadosAPI (cache) |
| 21 | `recesses/{recessId}` | automático | Dias de recesso, cadastrados à mão |
| 22 | `settings/library` | fixo | Horários, regras numéricas e data simulada de teste |
| 23 | `auditLog/{logId}` | automático | Ações do bibliotecário que pedem motivo, e outras ações sensíveis |
| 24 | `jobRuns/{runId}` | automático | Registro de cada execução da rotina agendada |

### 1.2 Relações

- `users` 1—N `loans`, `queueEntries`, `fines`, `passkeys`, e as subcoleções.
- `works` 1—N `books` (edições do mesmo título). A regra "não pegar dois exemplares do mesmo título nem outra edição dele" (RF-EMP-03) usa `workId`.
- `books` 1—N `copies`. A fila é **por edição**: `queueEntries.bookId`.
- `loans` N—1 `copies` (o exemplar separado ou emprestado) e 0..1—1 `fines`.
- `queueEntries` 0..1—1 `loans` (quando a vez é confirmada, nasce um pedido).

### 1.3 Ciclos de vida (enums principais)

**Exemplar (`copies.status`)**

| Valor | Na tela | Quando |
|---|---|---|
| `available` | Disponível / na estante | Sem pedido, sem empréstimo |
| `reserved` | Reservado | Separado para um pedido (`awaiting_pickup`) ou para o 1º da fila na vez dele (`your_turn`) |
| `on_loan` | Emprestado | Retirado pelo aluno |
| `withdrawn` | (não aparece) | Livro removido do acervo |

**Pedido e empréstimo (`loans.status`)**

| Valor | Na tela | Quando |
|---|---|---|
| `awaiting_pickup` | Pronto para retirar | Pedido feito (direto ou pela fila); tem até `pickupDeadline` |
| `active` | Em andamento / Vence em breve / Atrasado | Retirado; "Atrasado" e "Vence em breve" são calculados por `dueAt` |
| `returned` | Devolvido | Devolvido no balcão |
| `expired` | Expirado | Não retirado no prazo (RF-EMP-06) |
| `cancelled` | Cancelado | O aluno cancelou antes de retirar (RF-EMP-05) |

**Lugar na fila (`queueEntries.status`)**

| Valor | Na tela | Quando |
|---|---|---|
| `waiting` | Na fila | Esperando a vez |
| `your_turn` | É a sua vez / Confirme | Livro voltou; 24h corridas para confirmar (`confirmDeadline`) |
| `fulfilled` | (sai da lista) | Confirmou; virou um pedido (`loanId`) |
| `left` | (sai da lista) | O aluno saiu da fila (RF-FIL-05) |
| `missed` | Vez perdida | Não confirmou em 24h (RF-FIL-07) |
| `removed` | (sai da lista) | O bibliotecário removeu, com motivo (RF-BAL-06) |
| `cancelled_other_edition` | Fila cancelada | Outra edição do mesmo grupo chegou primeiro (RF-FIL-04) |
| `cancelled_book_removed` | (sai da lista) | Reserva técnica: livro removido do acervo (não deve ocorrer, porque só remove sem fila) |

"Filas ativas" = `waiting` + `your_turn`.

**Multa (`fines.status`)**

| Valor | Aba no balcão | Quando |
|---|---|---|
| `accruing` | Contando | Empréstimo atrasado e livro ainda não devolvido; valor calculado na hora |
| `open` | Em aberto | Livro devolvido, valor congelado, falta pagar no balcão |
| `paid` | Pagas | Bibliotecário registrou o pagamento (com quem recebeu) |

---

## 2. Coleções, campo a campo

Legenda da coluna **Obrig.**: S = sempre presente; N = opcional ou só em certos estados.

### 2.1 `users/{uid}`

ID = `uid` do Firebase Authentication. A conta do Firebase usa o e-mail interno `<matricula>@contas.uni-books.app`; o e-mail real fica aqui.

| Campo | Tipo | Obrig. | Regra / observação |
|---|---|---|---|
| `role` | enum `student` \| `librarian` | S | Define a área que abre após o login (RF-AUT-13) e as permissões (RF-AUT-12) |
| `matricula` | string | S | Exatamente 7 dígitos (`^\d{7}$`); os 2 primeiros = ano de ingresso. Única (ver `matriculaIndex`) |
| `fullName` | string | S | Ex.: "Lucas Almeida" |
| `fullNameNormalized` | string | S | Minúsculas, sem acento, para busca por nome (aba Multas, fila) |
| `initials` | string | S | Ex.: "LA" (avatar) |
| `email` | string | S | E-mail real. Aluno: termina em `@edu.unifor.br` (RF-AUT-02, `^[^\s@]+@edu\.unifor\.br$`, sem diferenciar maiúsculas). Bibliotecário: e-mail cadastrado da conta. Único (ver `emailIndex`) |
| `authEmail` | string | S | `<matricula>@contas.uni-books.app` (nunca recebe mensagens) |
| `status` | enum `pending_email` \| `active` \| `disabled` | S | Aluno nasce `pending_email` (conta no Firebase desativada) e vira `active` ao confirmar o token. Bibliotecário já nasce `active` |
| `emailVerifiedAt` | timestamp | N | Quando confirmou o token |
| `course` | string | N | Aluno. Ex.: "Ciência da Computação" (Perfil) |
| `entryYear` | number | N | Aluno. Ex.: 2024 (derivado da matrícula: `2000 + dois primeiros dígitos`) |
| `deskLabel` | string | N | Bibliotecário. Ex.: "Balcão · Biblioteca (Praça Central)" |
| `activeLoanCount` | number | S | Pedidos `awaiting_pickup` + empréstimos `active`. Limite 10 (RF-EMP-02). Atualizado na mesma transação de cada mudança |
| `activeQueueCount` | number | S | Lugares em fila `waiting` + `your_turn`. Cada edição conta 1. Limite 7 (RF-FIL-03, RF-FIL-04) |
| `openFineTotalCents` | money | S | Soma das multas `open` (aviso do Perfil, RF-MUL-04). As `accruing` são calculadas na hora |
| `booksReadByYear` | map<string, number> | S | Ex.: `{"2026": 17}`. +1 a cada devolução, no ano da devolução (RF-PER-01, "lidos em 2026") |
| `notificationPrefs` | map | S | Ver abaixo (RF-AVI-03) |
| `onboardingSeenAt` | timestamp | N | Viu a apresentação do primeiro acesso (RF-AUT-14). O app também guarda isso no aparelho |
| `lastLoginAt` | timestamp | N | Último login conhecido pela API |

**`notificationPrefs`** (aluno; para o bibliotecário fica com os valores padrão e não é usado):

| Chave | Tipo | Padrão | Pode desligar? |
|---|---|---|---|
| `queueTurn` | boolean | `true` | **Não** ("Sua vez na fila", sempre ligado) |
| `overdueAndFines` | boolean | `true` | **Não** ("Atraso e multa", sempre ligado) |
| `dueReminders` | boolean | `true` | Sim (lembrete 2 dias antes e no dia) |
| `pickupReady` | boolean | `true` | Sim (pedido pronto, pedido expirando ou expirado) |
| `queueUpdates` | boolean | `true` | Sim (subiu na fila, posição alterada pelo balcão) |
| `returnConfirmed` | boolean | `true` | Sim (devolução registrada) |
| `channelPush` | boolean | `true` | Sim. Só tem efeito no Android (no iPhone não há push) |
| `channelEmail` | boolean | `true` | Sim |

A API recusa gravar `false` em `queueTurn` e `overdueAndFines`. Os avisos sempre aparecem dentro do app, qualquer que seja o canal (RNF-CON-02). Ajustar os nomes das chaves aos itens exatos da tela Avisos e lembretes (A51), se diferirem.

### 2.2 `matriculaIndex/{matricula}` e `emailIndex/{email}`

O Firestore não tem restrição de valor único. Estes dois índices garantem matrícula e e-mail únicos (RF-AUT-01): o cadastro cria os dois documentos e o `users/{uid}` **na mesma transação**; se algum já existir, a API recusa e diz qual campo repetiu.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `uid` | ref:users | S | Dono da matrícula ou do e-mail |
| `role` | enum `student` \| `librarian` | S | Só em `matriculaIndex`, para o login do bibliotecário |

ID de `emailIndex` = e-mail em minúsculas, sem espaços. Se o aluno corrigir o e-mail antes de confirmar (RF-AUT-03), a API troca o documento do índice na mesma transação.

**Privacidade:** nenhuma rota devolve o e-mail de alguém a partir da matrícula.

### 2.3 `emailTokens/{tokenId}`

Token de 6 dígitos enviado pelo Resend. Vale **20 minutos** e é de **uso único** (RF-AUT-03, RF-AUT-08, RNF-SEG-05).

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `uid` | ref:users | S | Dono do token |
| `purpose` | enum `email_confirmation` \| `password_reset` | S | |
| `codeHash` | string | S | Hash (SHA-256 com `salt`) dos 6 dígitos. **Nunca** gravar o código em texto |
| `salt` | string | S | Aleatório, por token |
| `sentTo` | string | S | E-mail real para onde foi enviado |
| `expiresAt` | timestamp | S | `createdAt` + 20 min. Também é o campo da política de TTL |
| `usedAt` | timestamp | N | Preenchido ao usar; token usado é recusado ("Token expirado ou já usado", A77) |
| `attempts` | number | S | Tentativas erradas. Com 5, o token fica inválido |
| `invalidatedAt` | timestamp | N | Preenchido quando um novo token do mesmo `purpose` é pedido (reenviar) |

Ao reenviar, a API invalida os tokens anteriores do mesmo `uid` e `purpose`.

### 2.4 `passkeys/{credentialId}`

ID = `credentialId` em base64url. A API guarda **só a chave pública** (RNF-SEG-03).

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `uid` | ref:users | S | Dono (só aluno) |
| `publicKey` | string | S | Chave pública COSE em base64url |
| `signCount` | number | S | Contador do autenticador, atualizado a cada login |
| `transports` | array<string> | N | Ex.: `["internal", "hybrid"]` |
| `deviceName` | string | S | Ex.: "Galaxy A54" (Meus passkeys) |
| `aaguid` | string | N | Identifica o tipo de autenticador |
| `lastUsedAt` | timestamp | N | "usado em 11/10" |
| `revokedAt` | timestamp | N | Removido em Meus passkeys (RF-AUT-10). A API apaga o documento ou marca aqui |

RP ID = `uni-books.app` (não muda). Um aparelho com passkey da conta não cria outro (o próprio celular avisa).

### 2.5 `passkeyChallenges/{challengeId}`

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `challenge` | string | S | Aleatório, 32 bytes, base64url. Novo a cada tentativa (RNF-SEG-03) |
| `purpose` | enum `registration` \| `authentication` | S | |
| `uid` | ref:users | N | Registro: o aluno logado. Login: o dono da matrícula digitada |
| `expiresAt` | timestamp | S | `createdAt` + 5 min. Campo de TTL |
| `usedAt` | timestamp | N | Uso único |

### 2.6 `works/{workId}`

A obra (o título), que reúne as edições. ID = slug do título + sobrenome do 1º autor, ex.: `codigo-limpo--martin`.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `title` | string | S | "Código Limpo" |
| `authors` | array<string> | S | ["Robert C. Martin"] |
| `bookIds` | array<ref:books> | S | Edições desta obra (ativas e removidas) |
| `editionCount` | number | S | Edições ativas (não removidas). Se > 1, a página do livro oferece "fila em várias edições" (RF-FIL-04) |

### 2.7 `books/{bookId}` (a edição; "livro" nas telas)

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `workId` | ref:works | S | Liga as edições do mesmo título |
| `isbn` | string | N | Só dígitos (ISBN-13 ou ISBN-10). Pode faltar (filtro "Sem ISBN", RF-GAC-01) |
| `title` | string | S | "Código Limpo" |
| `subtitle` | string | N | "habilidades práticas do agile software" |
| `authors` | array<string> | S | |
| `translators` | array<string> | N | "Chu, Leandro" |
| `publisher` | string | N | "Alta Books" |
| `publicationPlace` | string | N | "Rio de Janeiro" |
| `edition` | string | N | Texto livre: "2. ed.", "revisada", "1ª" |
| `year` | number | N | 2011 |
| `language` | string | S | "Português" |
| `materialType` | string | S | "Livro" (registro completo da página do livro) |
| `series` | string | N | "(Robert C. Martin)" |
| `subjects` | array<string> | S | Assuntos ("Desenvolvimento de software"). Pode ser vazio |
| `synopsis` | string | N | Do Google Books ou à mão |
| `coverUrl` | string | N | Imagem do Google Books. Sem ela, o app gera a capa |
| `coverTone` | number | S | 1 a 6, cor da capa gerada (design system) |
| `cdu` | string | S | "005.1" (dado do projeto, não vem do Google Books) |
| `cutter` | string | S | "M386c" |
| `shelf` | string | S | "Estante 005.1" |
| `location` | string | S | "Biblioteca (Praça Central)" |
| `googleBooks` | map | N | `{ volumeId, lastSyncedAt, found: boolean }`. `found: false` quando o ISBN não foi encontrado (RF-GAC-02) |
| `dataSource` | enum `google_books` \| `manual` \| `mixed` | S | De onde vieram título, autores, editora e sinopse |
| `copiesTotal` | number | S | Exemplares não retirados do acervo |
| `copiesAvailable` | number | S | Exemplares `available`. A fila só abre com `copiesAvailable == 0` e nenhum exemplar `reserved` livre (RF-FIL-02) |
| `queueLength` | number | S | Lugares `waiting` + `your_turn` nesta edição ("1 reserva na fila") |
| `nextReturnAt` | timestamp | N | Menor `dueAt` entre os exemplares emprestados ("Próxima devolução 24/10") |
| `unavailableForNewRequests` | boolean | S | "Indisponível para novos pedidos" (RF-GAC-06, RF-ACE-08). Padrão `false` |
| `unavailableSetAt` | timestamp | N | |
| `unavailableSetBy` | ref:users | N | Bibliotecário |
| `status` | enum `active` \| `removed` | S | `removed` sai da busca e não pode ser pedido; o histórico continua (RF-GAC-05) |
| `removedAt` | timestamp | N | |
| `removedBy` | ref:users | N | |
| `searchText` | string | S | Título, subtítulo, autores, assuntos e ISBN em minúsculas e sem acento, para a busca (RF-ACE-01, RF-GAC-01). A busca roda em memória na API |
| `createdBy` | ref:users | N | Bibliotecário que cadastrou |

Regras:
- Remover (`status: removed`) só quando nenhum exemplar está `reserved` ou `on_loan` e `queueLength == 0` (RF-GAC-05). Senão, a API recusa e sugere marcar `unavailableForNewRequests`.
- Atualizar pelo Google Books (RF-GAC-04) troca só `title`, `subtitle`, `authors`, `publisher`, `year`, `synopsis`, `coverUrl`, `subjects`, `language` e `googleBooks`. **Nunca** `cdu`, `cutter`, `shelf` nem exemplares.
- Se o Google Books falhar, a API usa os dados já salvos (RNF-CON-03).

### 2.8 `copies/{copyId}`

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `bookId` | ref:books | S | |
| `workId` | ref:works | S | Cópia do `books.workId`, para consultas |
| `registration` | string | S | Número de registro: "46122", "223223". Único |
| `acquisitionYear` | number | N | "2011 · Impresso" |
| `format` | string | S | "Impresso" |
| `libraryCode` | string | S | "1163 · Biblioteca · Livros" |
| `status` | enum (ver 1.3) | S | |
| `currentLoanId` | ref:loans | N | Preenchido em `reserved` (pedido) e `on_loan` |
| `reservedForQueueEntryId` | ref:queueEntries | N | Preenchido em `reserved` pela vez da fila (antes de virar pedido) |
| `dueAt` | timestamp | N | Cópia do `loans.dueAt` quando `on_loan` ("Devolução prevista: 24/10") |

### 2.9 `loans/{loanId}` (pedido e empréstimo)

Um documento acompanha todo o caminho: pedido → retirada → devolução (ou expirado, ou cancelado).

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `studentUid` | ref:users | S | |
| `matricula` | string | S | Cópia, para a busca no balcão (RF-BAL-03, RF-BAL-05) |
| `studentName` | string | S | Cópia, para listas do balcão |
| `bookId` | ref:books | S | |
| `workId` | ref:works | S | Regra do mesmo título (RF-EMP-03) |
| `copyId` | ref:copies | S | Exemplar separado no pedido |
| `bookTitle` | string | S | Cópia, para listas e avisos |
| `bookShelf` | string | S | Cópia: "Estante 005.1" (lista Retiradas) |
| `status` | enum (ver 1.3) | S | |
| `origin` | enum `request` \| `queue` \| `assistant` | S | Pedido direto, vez da fila confirmada ou ação do Assistente |
| `queueEntryId` | ref:queueEntries | N | Quando `origin == queue` |
| `pickupCode` | string | S | Código curto "RET-4821" (`RET-` + 4 dígitos), único entre pedidos `awaiting_pickup`. Digitado no balcão sem QR |
| `qrToken` | string | S | Segredo aleatório (≥ 128 bits, base64url) que vai no QR (RF-EMP-07). O app guarda o QR no aparelho para mostrar sem internet (RNF-CON-01) |
| `requestedAt` | timestamp | S | |
| `pickupDeadline` | timestamp | S | 2 dias úteis após o pedido (ou após confirmar a vez), no horário de fechamento do último dia (RF-EMP-01, RF-EMP-11) |
| `pickedUpAt` | timestamp | N | Retirada registrada (RF-BAL-02) |
| `pickedUpBy` | ref:users | N | Bibliotecário |
| `loanDays` | number | S | 14 |
| `dueAt` | timestamp | N | Vencimento: retirada + 14 dias, no fechamento; se cair em domingo, feriado ou recesso, vai para o próximo dia em que a biblioteca abre |
| `originalDueAt` | timestamp | N | Vencimento antes da renovação |
| `renewalCount` | number | S | 0 ou 1. Só uma renovação (RF-EMP-09) |
| `renewedAt` | timestamp | N | |
| `returnedAt` | timestamp | N | Devolução (RF-BAL-04) |
| `returnedTo` | ref:users | N | Bibliotecário |
| `cancelledAt` | timestamp | N | Cancelado pelo aluno (RF-EMP-05) |
| `expiredAt` | timestamp | N | Expirou sem retirada (RF-EMP-06) |
| `fineId` | ref:fines | N | Se houve atraso |
| `remindersSent` | map | S | `{ due2Days: timestamp?, dueDay: timestamp?, overdue: timestamp? }`. Evita lembrete repetido |

Regras que a API aplica ao **criar um pedido** (solicitar ou confirmar a vez), numa transação:
1. `users.status == active` e `role == student`.
2. Sem empréstimo atrasado: nenhum `loans` do aluno com `status == active` e `dueAt < agora` (RF-EMP-04).
3. `activeLoanCount < 10` (RF-EMP-02).
4. Nenhum `loans` do aluno com o mesmo `workId` em `awaiting_pickup` ou `active` (RF-EMP-03).
5. `books.status == active` e `unavailableForNewRequests == false` (RF-ACE-08). Não vale para a vez da fila, que já existia antes da marca (RF-GAC-06).
6. Pedido direto: existe exemplar `available` e a fila da edição está vazia. Esse exemplar vira `reserved`.

Ao **renovar** (RF-EMP-09, RF-EMP-10), a API recusa e devolve o motivo quando: está atrasado (`dueAt < agora`), `books.queueLength > 0`, ou `renewalCount == 1`. Se passar: `originalDueAt = dueAt`, `dueAt += 14 dias` (mesma regra de ajuste), `renewalCount = 1`.

"Vence em breve" = `active` com `dueAt` em até 2 dias. "Atrasado" = `active` com `dueAt < agora`. Nenhum dos dois é gravado.

### 2.10 `queueEntries/{entryId}`

Um documento por aluno por edição. Fila em várias edições = vários documentos com o mesmo `editionGroupId`.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `bookId` | ref:books | S | A fila é por edição |
| `workId` | ref:works | S | |
| `bookTitle` | string | S | Cópia |
| `studentUid` | ref:users | S | |
| `matricula` | string | S | Cópia (tela de gestão da fila) |
| `studentName` | string | S | Cópia |
| `status` | enum (ver 1.3) | S | |
| `order` | number | S | Define a ordem na fila (menor = na frente). Entrada normal: maior `order` atual + 1000. O bibliotecário põe alguém entre dois alunos usando um valor intermediário (RF-BAL-06) |
| `joinedAt` | timestamp | S | "na fila desde 08/10" |
| `editionGroupId` | string | N | Mesmo valor nas edições marcadas juntas (RF-FIL-04) |
| `origin` | enum `student` \| `assistant` \| `librarian` | S | |
| `addedBy` | ref:users | N | Bibliotecário que adicionou |
| `addReason` | string | N | Obrigatório quando o bibliotecário adiciona à frente de outros (RF-BAL-07) |
| `turnStartedAt` | timestamp | N | Quando virou `your_turn` |
| `confirmDeadline` | timestamp | N | `turnStartedAt` + 24 horas corridas (RF-FIL-06) |
| `reservedCopyId` | ref:copies | N | Exemplar guardado para a vez dele |
| `loanId` | ref:loans | N | Pedido criado ao confirmar (`fulfilled`) |
| `lastNotifiedAt` | timestamp | N | Para "Reenviar aviso" (RF-BAL-06) |
| `notifyCount` | number | S | |
| `endedAt` | timestamp | N | Quando saiu de `waiting`/`your_turn` |
| `endReason` | string | N | Motivo da remoção pelo bibliotecário (obrigatório em `removed`) |
| `endedBy` | ref:users | N | Quem removeu |

Regras ao **entrar na fila** (RF-FIL-01 a RF-FIL-04), numa transação:
1. Mesmas checagens 1, 2 e 5 do pedido.
2. A edição não tem exemplar `available` (RF-FIL-02).
3. `activeQueueCount + número de edições marcadas ≤ 7`.
4. O aluno não tem lugar ativo nem empréstimo ativo da mesma edição.
5. "Pessoas na frente" = lugares `waiting`/`your_turn` da edição com `order` menor. É calculado, não gravado.

**Quando um exemplar volta** (devolução, pedido expirado ou cancelado): se a edição tem fila, o exemplar fica `reserved` para o 1º `waiting` (menor `order`), que vira `your_turn` e é avisado. Se não tem fila, o exemplar fica `available`.

**Confirmar a vez:** cria o `loans` (`origin: queue`) com `pickupDeadline` de 2 dias úteis, e o lugar vira `fulfilled`. Os outros lugares do mesmo `editionGroupId` viram `cancelled_other_edition`, com aviso, e liberam as vagas.

**Perder o prazo:** passou `confirmDeadline` → `missed`, aviso, e o exemplar passa ao próximo da fila (RF-FIL-07).

### 2.11 `fines/{fineId}`

Uma multa por empréstimo atrasado. **R$ 2,00 por dia útil de atraso, sem teto** (RF-MUL-01).

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `loanId` | ref:loans | S | Um para um |
| `studentUid` | ref:users | S | |
| `matricula` | string | S | Cópia (busca na aba Multas, RF-BAL-09) |
| `studentName` | string | S | Cópia |
| `studentNameNormalized` | string | S | Busca por nome sem acento |
| `bookId` | ref:books | S | |
| `bookTitle` | string | S | Cópia |
| `status` | enum `accruing` \| `open` \| `paid` | S | |
| `ratePerBusinessDayCents` | money | S | 200 (copiado de `settings/library` no momento da criação) |
| `dueAt` | timestamp | S | Cópia do vencimento ("venceu em 10/10") |
| `businessDaysLate` | number | N | Gravado ao congelar (`open`). Em `accruing`, é calculado na hora |
| `amountCents` | money | N | Gravado ao congelar: `businessDaysLate × ratePerBusinessDayCents` |
| `frozenAt` | timestamp | N | Data da devolução (RF-MUL-02) |
| `paidAt` | timestamp | N | |
| `receivedBy` | ref:users | N | Bibliotecário que recebeu |
| `receivedByName` | string | N | Cópia (aba Pagas mostra quem recebeu) |
| `paidAtReturn` | boolean | N | `true` quando marcado "Multa paga agora" na devolução (RF-BAL-08) |

Regras:
- A rotina agendada cria a multa `accruing` no primeiro dia útil de atraso. A devolução congela (`open`); o registro de pagamento fecha (`paid`).
- Dias úteis de atraso = dias de segunda a sexta, sem feriado nem recesso, depois do dia do vencimento, até a devolução (ou até hoje). Exemplo: venceu no sábado 10/10, hoje quinta 15/10, 12/10 é feriado → 13, 14 e 15/10 → 3 dias → R$ 6,00.
- O app não recebe pagamento: só o bibliotecário muda para `paid` (RF-MUL-03).
- Multa `open` sem atraso não bloqueia empréstimos; só mostra aviso (RF-MUL-04).

### 2.12 `users/{uid}/savedBooks/{bookId}`

Existir o documento = o livro está em "Todos os salvos" (RF-SAL-01).

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `bookId` | ref:books | S | Igual ao ID |
| `savedAt` | timestamp | S | |
| `folderIds` | array<ref:folders> | S | Pastas em que o livro está (RF-SAL-03). Pode ser vazio |

### 2.13 `users/{uid}/folders/{folderId}`

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `name` | string | S | 1 a 30 caracteres (RF-SAL-02). Ex.: "Ler depois", "Amei!!!", "TCC" |
| `bookCount` | number | S | Atualizado ao colocar ou tirar livros |

Apagar a pasta tira o `folderId` de todos os `savedBooks`, mas não apaga os livros salvos.

### 2.14 `users/{uid}/notifications/{notificationId}`

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `type` | enum (abaixo) | S | |
| `title` | string | S | "É a sua vez: Código Limpo" |
| `body` | string | S | "Confirme até amanhã, 09:12, que vai retirar." |
| `bookId` | ref:books | N | |
| `loanId` | ref:loans | N | |
| `queueEntryId` | ref:queueEntries | N | |
| `fineId` | ref:fines | N | |
| `action` | enum `confirm_turn` \| `show_qr` \| `open_loan` \| `open_fine` \| `none` | S | Botões do aviso ("Vou retirar", "Desistir") |
| `readAt` | timestamp | N | Marcar todas como lidas (RF-AVI-01) |
| `delivery` | map | S | `{ push: enum, email: enum }`, cada um `sent` \| `failed` \| `disabled` \| `unsupported` \| `skipped` (RF-AVI-04) |

Valores de `type`: `queue_turn`, `queue_turn_missed`, `queue_moved_up`, `queue_position_changed`, `queue_added_by_librarian`, `queue_removed_by_librarian`, `queue_cancelled_other_edition`, `pickup_ready`, `pickup_expiring`, `pickup_expired`, `loan_picked_up`, `due_reminder`, `overdue`, `return_confirmed`, `fine_open`, `fine_paid`, `renewal_done`.

Quais tipos respeitam `notificationPrefs`: `queue_turn` e `queue_turn_missed` → `queueTurn` (sempre); `overdue`, `fine_open` → `overdueAndFines` (sempre); `due_reminder` → `dueReminders`; `pickup_*` → `pickupReady`; `queue_moved_up`, `queue_position_changed`, `queue_added_*`, `queue_removed_*`, `queue_cancelled_other_edition` → `queueUpdates`; `return_confirmed`, `fine_paid`, `renewal_done`, `loan_picked_up` → `returnConfirmed`.

### 2.15 `users/{uid}/devices/{deviceId}`

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `platform` | enum `android` \| `ios` | S | |
| `expoPushToken` | string | N | Só Android (RF-AVI-02). No iPhone fica vazio |
| `deviceName` | string | N | |
| `appVersion` | string | N | |
| `lastSeenAt` | timestamp | S | |
| `pushDisabledAt` | timestamp | N | Token inválido devolvido pelo Expo |

### 2.16 `users/{uid}/assistantMessages/{messageId}`

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `sender` | enum `student` \| `assistant` | S | |
| `text` | string | S | |
| `suggestedBookIds` | array<ref:books> | N | Livros mostrados como cartões (RF-ASS-02) |
| `actionId` | ref:assistantActions | N | Quando a resposta propõe uma ação |
| `blockedReason` | string | N | Quando uma regra bloqueia ("atraso desde 10/10…", A81) |
| `error` | boolean | N | Resposta com erro (A49) |

Só o aluno tem Assistente (RF-ASS-06). A API envia ao Gemini só o necessário: a pergunta, trechos do acervo e um resumo do histórico de leitura, **sem** matrícula, e-mail nem nome completo (RF-ASS-07).

### 2.17 `users/{uid}/assistantActions/{actionId}`

A ação só acontece depois da confirmação do aluno (RF-ASS-04).

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `type` | enum `request_loan` \| `join_queue` | S | |
| `bookIds` | array<ref:books> | S | Uma edição no pedido; uma ou mais na fila |
| `status` | enum `proposed` \| `confirmed` \| `cancelled` \| `expired` \| `blocked` \| `failed` | S | `blocked` = regra impede, sem botão de confirmar |
| `blockedReason` | enum `overdue` \| `loan_limit` \| `queue_limit` \| `same_title` \| `unavailable` \| `not_queueable` | N | |
| `preview` | map | S | O que o cartão mostra: `{ pickupDeadline?, activeLoansAfter?, queuePosition? }` |
| `expiresAt` | timestamp | S | `createdAt` + 15 min. Campo de TTL |
| `resultLoanId` | ref:loans | N | |
| `resultQueueEntryIds` | array<ref:queueEntries> | N | |

Na confirmação, a API refaz todas as checagens (o estado pode ter mudado).

### 2.18 `recommendations/{uid}`

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `bookIds` | array<ref:books> | S | Até 6 ("Recomendados para você", RF-ASS-03) |
| `reasonText` | string | S | "Pelo que você mais leu em Engenharia de Software" |
| `generatedAt` | timestamp | S | |
| `validUntil` | timestamp | S | `generatedAt` + 24h; depois a API gera de novo |

### 2.19 `holidays/{year}`

Cache da FeriadosAPI (RF-SIS-01, RNF-DES-03). Uma chamada por ano, para Fortaleza (IBGE `2304400`), que traz feriados nacionais, do Ceará e de Fortaleza.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `year` | number | S | 2026 |
| `cityIbge` | string | S | "2304400" |
| `items` | array<map> | S | `{ date: date, name: string, scope: "national" \| "state" \| "municipal" }` |
| `fetchedAt` | timestamp | S | |
| `source` | string | S | "FeriadosAPI" |

### 2.20 `recesses/{recessId}`

Recesso acadêmico, cadastrado à mão (RF-SIS-02).

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `startDate` | date | S | Primeiro dia |
| `endDate` | date | S | Último dia (inclusive) |
| `description` | string | S | "Recesso de fim de ano" |

### 2.21 `settings/library`

Documento único com horários e números das regras. Mudar um número aqui muda a regra sem mexer no código.

| Campo | Tipo | Valor | Observação |
|---|---|---|---|
| `timezone` | string | `"America/Fortaleza"` | |
| `openingHours` | map | ver abaixo | Por dia da semana; `null` = fechado |
| `maxActiveLoans` | number | 10 | RF-EMP-02 |
| `maxActiveQueues` | number | 7 | RF-FIL-03 |
| `loanDays` | number | 14 | Dias corridos |
| `renewalDays` | number | 14 | RF-EMP-09 |
| `maxRenewals` | number | 1 | |
| `pickupBusinessDays` | number | 2 | RF-EMP-01 |
| `queueConfirmHours` | number | 24 | Horas corridas, RF-FIL-06 |
| `fineCentsPerBusinessDay` | money | 200 | RF-MUL-01 |
| `dueSoonDays` | number | 2 | "Vence em breve" e lembrete |
| `emailTokenMinutes` | number | 20 | RNF-SEG-05 |
| `emailTokenMaxAttempts` | number | 5 | |
| `assistantActionMinutes` | number | 15 | |
| `simulatedNow` | timestamp? | `null` | **Só no ambiente de teste** (RF-SIS-04). Em produção a API ignora o campo |
| `contact` | map | ver abaixo | Tela Regras da biblioteca |
| `officialRulesUrl` | string | `"https://unifor.br/cesta-de-servicos/biblioteca"` | |

`openingHours`:
```json
{
  "mon": {"open": "07:00", "close": "21:55"},
  "tue": {"open": "07:00", "close": "21:55"},
  "wed": {"open": "07:00", "close": "21:55"},
  "thu": {"open": "07:00", "close": "21:55"},
  "fri": {"open": "07:00", "close": "21:55"},
  "sat": {"open": "08:00", "close": "14:10"},
  "sun": null
}
```

`contact`:
```json
{
  "place": "Biblioteca (Praça Central)",
  "biblioZap": "(85) 3477-3257",
  "loanPhone": "(85) 3477-3162",
  "loanEmail": "bibemprestimo@unifor.br"
}
```

### 2.22 `auditLog/{logId}`

Registro das ações do bibliotecário que pedem motivo ou mexem em outro aluno (RF-BAL-06, RF-BAL-07), e de outras ações sensíveis.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `actorUid` | ref:users | S | Quem fez |
| `actorRole` | enum `student` \| `librarian` \| `system` | S | |
| `action` | enum (abaixo) | S | |
| `targetUid` | ref:users | N | Aluno afetado |
| `bookId` | ref:books | N | |
| `entityId` | string | N | ID do documento alterado |
| `reason` | string | N | Motivo informado |
| `details` | map | N | Ex.: `{ from: 4, to: 1, movedDown: ["uidA", "uidB"] }` |

Valores de `action`: `queue_add`, `queue_move`, `queue_remove`, `queue_resend_notice`, `loan_pickup`, `loan_return`, `fine_paid`, `book_create`, `book_update`, `book_sync_google`, `book_remove`, `book_set_unavailable`, `passkey_create`, `passkey_remove`, `password_reset`.

### 2.23 `jobRuns/{runId}`

A rotina agendada (Cloud Scheduler chamando a API, RF-SIS-05) registra cada execução, para não repetir trabalho e para depuração.

| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `job` | enum `expire_pickups` \| `advance_queues` \| `due_reminders` \| `accrue_fines` \| `refresh_holidays` | S | |
| `startedAt` | timestamp | S | |
| `finishedAt` | timestamp | N | |
| `status` | enum `running` \| `ok` \| `error` | S | |
| `processed` | number | S | Quantos documentos tratou |
| `error` | string | N | |

O que cada rotina faz:
- `expire_pickups`: `loans` `awaiting_pickup` com `pickupDeadline` vencido → `expired`; exemplar volta (fila ou estante); aviso "Seu pedido de … expirou".
- `advance_queues`: `queueEntries` `your_turn` com `confirmDeadline` vencido → `missed`; próximo da fila.
- `due_reminders`: lembrete 2 dias antes e no dia do vencimento; aviso de atraso.
- `accrue_fines`: cria a multa `accruing` dos empréstimos que passaram a ficar atrasados.
- `refresh_holidays`: busca o ano seguinte na FeriadosAPI quando faltar.

---

## 3. Operações principais e o que cada uma grava

Todas em **transação** (Firestore `runTransaction`), para os contadores e os estados ficarem sempre certos.

| Operação | Documentos alterados |
|---|---|
| Cadastro (RF-AUT-01) | cria `users` (`pending_email`), `matriculaIndex`, `emailIndex`, `emailTokens`; conta no Firebase Auth desativada |
| Confirmar e-mail | `emailTokens.usedAt`; `users.status = active`, `emailVerifiedAt`; ativa a conta no Firebase Auth |
| Solicitar empréstimo | cria `loans` (`awaiting_pickup`); `copies` → `reserved`; `books.copiesAvailable −1`; `users.activeLoanCount +1` |
| Cancelar pedido | `loans` → `cancelled`; `users.activeLoanCount −1`; exemplar volta (fila ou estante) |
| Entrar na fila | cria `queueEntries` (`waiting`); `books.queueLength +1`; `users.activeQueueCount +1` por edição |
| Sair da fila | `queueEntries` → `left`; `books.queueLength −1`; `users.activeQueueCount −1` |
| Confirmar a vez | `queueEntries` → `fulfilled`; cria `loans` (`origin: queue`); outras edições do grupo → `cancelled_other_edition`; contadores |
| Registrar retirada (RF-BAL-02) | `loans` → `active`, `pickedUpAt`, `dueAt`; `copies` → `on_loan`, `dueAt`; `books.nextReturnAt` |
| Renovar | `loans.dueAt`, `originalDueAt`, `renewalCount`, `renewedAt`; `copies.dueAt` |
| Registrar devolução (RF-BAL-04) | `loans` → `returned`; `users.activeLoanCount −1`; `users.booksReadByYear +1`; multa → `open` (congela) ou `paid` se "Multa paga agora"; exemplar → 1º da fila (`your_turn`, aviso na hora) ou `available` |
| Registrar pagamento | `fines` → `paid`, `receivedBy`; `users.openFineTotalCents` −valor |
| Gestão da fila pelo bibliotecário | `queueEntries.order` ou status; `auditLog` com motivo; avisos aos afetados |
| Remover livro | `books.status = removed`; `copies` → `withdrawn`; `works.editionCount −1`; `auditLog` |

---

## 4. Índices e TTL

### 4.1 Índices compostos (`firestore.indexes.json`)

```json
{
  "indexes": [
    { "collectionGroup": "loans", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "studentUid", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "dueAt", "order": "ASCENDING"} ] },
    { "collectionGroup": "loans", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "studentUid", "order": "ASCENDING"}, {"fieldPath": "workId", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"} ] },
    { "collectionGroup": "loans", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "studentUid", "order": "ASCENDING"}, {"fieldPath": "requestedAt", "order": "DESCENDING"} ] },
    { "collectionGroup": "loans", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "pickupDeadline", "order": "ASCENDING"} ] },
    { "collectionGroup": "loans", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "dueAt", "order": "ASCENDING"} ] },
    { "collectionGroup": "loans", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "matricula", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "pickupDeadline", "order": "ASCENDING"} ] },
    { "collectionGroup": "loans", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "returnedAt", "order": "DESCENDING"} ] },
    { "collectionGroup": "loans", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "bookId", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"} ] },

    { "collectionGroup": "queueEntries", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "bookId", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "order", "order": "ASCENDING"} ] },
    { "collectionGroup": "queueEntries", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "studentUid", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "joinedAt", "order": "ASCENDING"} ] },
    { "collectionGroup": "queueEntries", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "confirmDeadline", "order": "ASCENDING"} ] },
    { "collectionGroup": "queueEntries", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "editionGroupId", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"} ] },

    { "collectionGroup": "fines", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "frozenAt", "order": "DESCENDING"} ] },
    { "collectionGroup": "fines", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "dueAt", "order": "ASCENDING"} ] },
    { "collectionGroup": "fines", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "status", "order": "ASCENDING"}, {"fieldPath": "paidAt", "order": "DESCENDING"} ] },
    { "collectionGroup": "fines", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "matricula", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"} ] },
    { "collectionGroup": "fines", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "studentUid", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"} ] },

    { "collectionGroup": "copies", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "bookId", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"} ] },

    { "collectionGroup": "books", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "workId", "order": "ASCENDING"}, {"fieldPath": "status", "order": "ASCENDING"} ] },

    { "collectionGroup": "emailTokens", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "uid", "order": "ASCENDING"}, {"fieldPath": "purpose", "order": "ASCENDING"}, {"fieldPath": "createdAt", "order": "DESCENDING"} ] },

    { "collectionGroup": "passkeys", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "uid", "order": "ASCENDING"}, {"fieldPath": "createdAt", "order": "DESCENDING"} ] },

    { "collectionGroup": "notifications", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "readAt", "order": "ASCENDING"}, {"fieldPath": "createdAt", "order": "DESCENDING"} ] },

    { "collectionGroup": "savedBooks", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "folderIds", "arrayConfig": "CONTAINS"}, {"fieldPath": "savedAt", "order": "DESCENDING"} ] },

    { "collectionGroup": "auditLog", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "bookId", "order": "ASCENDING"}, {"fieldPath": "createdAt", "order": "DESCENDING"} ] },

    { "collectionGroup": "jobRuns", "queryScope": "COLLECTION",
      "fields": [ {"fieldPath": "job", "order": "ASCENDING"}, {"fieldPath": "startedAt", "order": "DESCENDING"} ] }
  ],
  "fieldOverrides": []
}
```

A conversa do Assistente (assistantMessages ordenada por createdAt) também usa o índice automático: o Firestore recusa índice composto de um campo só (removido em 18/10).

Consultas com um campo só (ex.: `loans.pickupCode == "RET-4821"`, `loans.qrToken == …`, `copies.registration == …`) usam os índices automáticos.

### 4.2 Busca de texto

O Firestore não faz busca por trecho de texto. A API carrega `books` ativos em memória (o acervo de demonstração é pequeno) e busca em `searchText`, sem acento (RF-ACE-01, RNF-DES-01). Busca de alunos por nome (aba Multas, adicionar à fila) usa `fullNameNormalized` / `studentNameNormalized` da mesma forma; por matrícula, igualdade exata.

### 4.3 Políticas de TTL (apagam sozinhas os documentos vencidos)

| Coleção | Campo |
|---|---|
| `emailTokens` | `expiresAt` |
| `passkeyChallenges` | `expiresAt` |
| `users/{uid}/assistantActions` (grupo `assistantActions`) | `expiresAt` |

O TTL apaga com atraso de até 24h; a API sempre confere `expiresAt` antes de aceitar.

---

## 5. Regras de segurança (`firestore.rules`)

O app nunca acessa o Firestore direto (RNF-SEG-06). A API usa o Firebase Admin SDK, que não passa pelas regras. Então as regras negam tudo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 6. Dados de demonstração

Seguem a linha do tempo das telas: **hoje é quinta, 15/10/2026**, e o teste usa `settings/library.simulatedNow = 2026-10-15T12:00:00-03:00`. 12/10 é feriado.

As telas mostram momentos diferentes da mesma história. A carga usa **um único momento**: Lucas **já confirmou** a vez em Código Limpo (pedido RET-4821, 4 de 10) e Marina **ainda não devolveu** Cálculo, Vol. 1 (multa contando). As telas de antes ("É a sua vez") e de depois (devolução da Marina) são demonstradas fazendo essas ações ao vivo.

### 6.1 Usuários (`users`, com `matriculaIndex` e `emailIndex`)

| Nome | Matrícula | Perfil | E-mail real | Situação |
|---|---|---|---|---|
| Ana Souza | 0900001 | librarian | ana.souza@unifor.br | Bibliotecária do balcão |
| Lucas Almeida | 2412858 | student | lucas.almeida@edu.unifor.br | Em dia. Ciência da Computação, 2024. 3 empréstimos + 1 pedido (4 de 10), 1 fila (Arquitetura Limpa, 2º), 17 lidos em 2026 |
| Marina Castro | 2513320 | student | marina.castro@edu.unifor.br | Sistemas de Informação, 2025. Cálculo, Vol. 1 atrasado desde 10/10 (multa contando, R$ 6,00); 3 de 10; na fila de Arquitetura Limpa desde 09/10 |
| Beatriz Nogueira | 2311052 | student | beatriz.nogueira@edu.unifor.br | Pedido RET-4817 (Padrões de Projeto), último dia hoje |
| Rafael Teixeira | 2210478 | student | rafael.teixeira@edu.unifor.br | Pedido RET-4809 (Cálculo, Vol. 2), retirar até amanhã |
| Ana Beatriz Lima | 2311047 | student | ana.lima@edu.unifor.br | 1ª na fila de Arquitetura Limpa, desde 02/10 |
| Carlos Eduardo Sá | 2210933 | student | carlos.sa@edu.unifor.br | 3º na fila de Arquitetura Limpa, desde 10/10 |
| Pedro Martins | 2412001 | student | pedro.martins@edu.unifor.br | Está com Arquitetura Limpa, devolve 21/10 |
| Pedro Henrique Lima | 2410221 | student | pedro.hlima@edu.unifor.br | Multa em aberto R$ 10,00 (Física Básica, Vol. 2, devolvido 13/10) |
| Júlia Martins | 2320876 | student | julia.martins@edu.unifor.br | Multa em aberto R$ 4,00 (Contabilidade Introdutória, devolvido 09/10) |
| Camila Rocha | 2214567 | student | camila.rocha@edu.unifor.br | Multa em aberto R$ 8,00 (Direito Civil: Parte Geral, devolvido 02/10) |
| Diego Alves | 2511903 | student | diego.alves@edu.unifor.br | Multa em aberto R$ 6,00 (Anatomia Humana, devolvido 30/09) |

A matrícula e o e-mail da bibliotecária são de exemplo; trocar pelos dados reais da conta pré-cadastrada. As contas do Firebase Authentication (com `authEmail` e senha de teste) são criadas pelo script de carga, não neste documento.

### 6.2 Acervo (`works`, `books`, `copies`)

| Livro (edição) | Obra | ISBN | CDU · Cutter | Exemplares | Situação |
|---|---|---|---|---|---|
| Código Limpo (ed. revisada, Alta Books, 2011) | codigo-limpo--martin | 9788576082675 | 005.1 · M386c | 3 (46122, 223223, 223323) | 46122 reservado para RET-4821 (Lucas); 223223 e 223323 emprestados (devolução 28/10 e 03/11); 1 aluno na fila (Carlos Eduardo Sá) |
| Refatoração (2. ed., Novatec, 2020) | refatoracao--fowler | 9788575227244 | 005.1 · F787r | 3 (51734, 51735, 51736) | 2 na estante, 1 emprestado (devolução 22/10) |
| Arquitetura Limpa | arquitetura-limpa--martin | — | 005.1 | 1 | Emprestado a Pedro Martins (devolve 21/10); 4 na fila; **indisponível para novos pedidos** |
| O Codificador Limpo (2012) | o-codificador-limpo--martin | — | 005.1 | 2 | 2 na estante, sem fila (exemplo de remover livro) |
| Padrões de Projeto (Gamma et al.) | padroes-de-projeto--gamma | — | 005.1 | 1+ (registro 51902) | Reservado para RET-4817 (Beatriz) |
| Cálculo, Vol. 1 (James Stewart) | calculo-vol-1--stewart | — | 515 | 1+ | Emprestado a Marina, venceu 10/10 |
| Cálculo, Vol. 2 (James Stewart) | calculo-vol-2--stewart | — | 515 | 1+ | Reservado para RET-4809 (Rafael) |
| Engenharia de Software (Ian Sommerville) | engenharia-de-software--sommerville | — | 005.1 | 1+ | Com Lucas, vence 16/10; 2 na fila (renovação negada) |
| Redes de Computadores (Andrew S. Tanenbaum) | redes-de-computadores--tanenbaum | — | 004.7 | 1+ | Com Lucas, vence 20/10 |
| Estruturas de Dados e Algoritmos (Goodrich, Tamassia) | estruturas-de-dados--goodrich | — | 005.1 | 1+ | Com Lucas, vence 23/10 |
| Algoritmos — 3ª ed. (Elsevier, 2012) e 4ª ed. (GEN LTC, 2024) | algoritmos--cormen | 9788535236996 (3ª) | 005.1 · C811a | 4 em 2 edições (60411, 60412, 71880, 71881) | Exemplo de fila em 2 edições |
| Code Complete (Steve McConnell, 2005) | code-complete--mcconnell | — | 005.1 | 1+ | Emprestado, sem fila |

Campos sem valor na tabela (ISBN, editora) podem ser preenchidos pelo script com o Google Books ou ficar vazios. Para a busca "código" retornar 24 resultados, como na tela A09, completar o acervo com mais livros de programação.

### 6.3 Pedidos, empréstimos, filas e multas

| Coleção | Registro | Campos-chave |
|---|---|---|
| `loans` | Lucas · Engenharia de Software | `active`, retirado 02/10, `dueAt` 16/10 21:55, `renewalCount` 0 |
| `loans` | Lucas · Redes de Computadores | `active`, retirado 06/10, `dueAt` 20/10 21:55 |
| `loans` | Lucas · Estruturas de Dados e Algoritmos | `active`, retirado 09/10, `dueAt` 23/10 21:55 |
| `loans` | Lucas · Código Limpo (pedido, RET-4821) | `awaiting_pickup`, `origin` queue, `pickupDeadline` seg 19/10 21:55 |
| `loans` | Beatriz · Padrões de Projeto (RET-4817) | `awaiting_pickup`, `pickupDeadline` 15/10 21:55 |
| `loans` | Rafael · Cálculo, Vol. 2 (RET-4809) | `awaiting_pickup`, `pickupDeadline` 16/10 21:55 |
| `loans` | Marina · Cálculo, Vol. 1 | `active`, retirado sáb 26/09, `dueAt` sáb 10/10 14:10, com `fineId` |
| `loans` | Pedro Martins · Arquitetura Limpa | `active`, `dueAt` 21/10 21:55 |
| `queueEntries` | Arquitetura Limpa | 1º Ana Beatriz Lima (desde 02/10), 2º Lucas (08/10), 3º Carlos Eduardo Sá (10/10), 4º Marina (09/10), todos `waiting`, `order` 1000, 2000, 3000, 4000 |
| `queueEntries` | Engenharia de Software | 2 alunos `waiting` (bloqueiam a renovação de Lucas) |
| `queueEntries` | Código Limpo | Lucas `fulfilled` (virou RET-4821); Carlos Eduardo Sá `waiting` |
| `fines` | Marina · Cálculo, Vol. 1 | `accruing`, `dueAt` 10/10 (hoje: 3 dias úteis, R$ 6,00, calculado) |
| `fines` | Pedro Henrique Lima, Júlia Martins, Camila Rocha, Diego Alves | `open`, valores 1000, 400, 800 e 600 centavos (R$ 28,00 em 4 alunos). Depois da devolução da Marina ao vivo: R$ 34,00 em 5 alunos, como na tela de Multas |

### 6.4 Exemplo completo de documentos (JSON)

`users/uid_lucas`
```json
{
  "role": "student",
  "matricula": "2412858",
  "fullName": "Lucas Almeida",
  "fullNameNormalized": "lucas almeida",
  "initials": "LA",
  "email": "lucas.almeida@edu.unifor.br",
  "authEmail": "2412858@contas.uni-books.app",
  "status": "active",
  "emailVerifiedAt": "2026-09-01T10:00:00-03:00",
  "course": "Ciência da Computação",
  "entryYear": 2024,
  "activeLoanCount": 4,
  "activeQueueCount": 1,
  "openFineTotalCents": 0,
  "booksReadByYear": {"2026": 17},
  "notificationPrefs": {
    "queueTurn": true, "overdueAndFines": true, "dueReminders": true, "pickupReady": true,
    "queueUpdates": true, "returnConfirmed": true, "channelPush": true, "channelEmail": true
  },
  "createdAt": "2026-09-01T09:50:00-03:00",
  "updatedAt": "2026-10-15T09:12:00-03:00"
}
```

`books/book_codigo_limpo`
```json
{
  "workId": "codigo-limpo--martin",
  "isbn": "9788576082675",
  "title": "Código Limpo",
  "subtitle": "habilidades práticas do agile software",
  "authors": ["Robert C. Martin"],
  "translators": ["Leandro Chu"],
  "publisher": "Alta Books",
  "publicationPlace": "Rio de Janeiro",
  "edition": "revisada",
  "year": 2011,
  "language": "Português",
  "materialType": "Livro",
  "series": "(Robert C. Martin)",
  "subjects": ["Desenvolvimento de software", "Linguagem de programação"],
  "synopsis": "Mostra como escrever código fácil de ler e de manter...",
  "coverUrl": null,
  "coverTone": 1,
  "cdu": "005.1",
  "cutter": "M386c",
  "shelf": "Estante 005.1",
  "location": "Biblioteca (Praça Central)",
  "googleBooks": {"volumeId": null, "lastSyncedAt": null, "found": true},
  "dataSource": "mixed",
  "copiesTotal": 3,
  "copiesAvailable": 0,
  "queueLength": 1,
  "nextReturnAt": "2026-10-28T21:55:00-03:00",
  "unavailableForNewRequests": false,
  "status": "active",
  "searchText": "codigo limpo habilidades praticas do agile software robert c. martin desenvolvimento de software linguagem de programacao 9788576082675"
}
```

`loans/loan_ret4821`
```json
{
  "studentUid": "uid_lucas",
  "matricula": "2412858",
  "studentName": "Lucas Almeida",
  "bookId": "book_codigo_limpo",
  "workId": "codigo-limpo--martin",
  "copyId": "copy_46122",
  "bookTitle": "Código Limpo",
  "bookShelf": "Estante 005.1",
  "status": "awaiting_pickup",
  "origin": "queue",
  "queueEntryId": "qe_lucas_codigo_limpo",
  "pickupCode": "RET-4821",
  "qrToken": "q9Zr0bH6v3S1kT8xY2mW4pLc",
  "requestedAt": "2026-10-15T09:30:00-03:00",
  "pickupDeadline": "2026-10-19T21:55:00-03:00",
  "loanDays": 14,
  "renewalCount": 0,
  "remindersSent": {}
}
```

`fines/fine_marina_calculo1`
```json
{
  "loanId": "loan_marina_calculo1",
  "studentUid": "uid_marina",
  "matricula": "2513320",
  "studentName": "Marina Castro",
  "studentNameNormalized": "marina castro",
  "bookId": "book_calculo_vol1",
  "bookTitle": "Cálculo, Vol. 1",
  "status": "accruing",
  "ratePerBusinessDayCents": 200,
  "dueAt": "2026-10-10T14:10:00-03:00"
}
```

`queueEntries/qe_anabeatriz_arquitetura`
```json
{
  "bookId": "book_arquitetura_limpa",
  "workId": "arquitetura-limpa--martin",
  "bookTitle": "Arquitetura Limpa",
  "studentUid": "uid_anabeatriz",
  "matricula": "2311047",
  "studentName": "Ana Beatriz Lima",
  "status": "waiting",
  "order": 1000,
  "joinedAt": "2026-10-02T10:00:00-03:00",
  "origin": "student",
  "notifyCount": 0
}
```

Nos JSONs, as datas aparecem como texto ISO só para leitura; no banco são `timestamp`.

### 6.5 Dados complementares do seed (decididos em 18/10)

> **Datas relativas (decidido em 19/10):** o seed monta todas as datas a partir do dia em que roda ("hoje"), mantendo as mesmas situações das seções 6.1 a 6.5 (ex.: a Marina com cerca de 3 dias úteis de atraso, o pedido do Lucas para retirar em até 2 dias úteis, a Beatriz no último dia). As datas exatas das tabelas valem como exemplo do dia 15/10. Não precisa ser perfeito: se um prazo cair num feriado, tudo bem. Os valores das multas em aberto (já congeladas) continuam fixos. O seed serve só para ter dados de teste e de navegação.

Completam as seções 6.1 a 6.3 para o script de carga. Os valores marcados como exemplo são fictícios.

**Exemplares.** Onde a 6.2 diz "1+", o livro tem **exatamente 1 exemplar**. Registros que faltam (exemplo): Arquitetura Limpa 80101; O Codificador Limpo 80111 e 80112; Cálculo, Vol. 1 80121; Cálculo, Vol. 2 80131; Engenharia de Software 80141; Redes de Computadores 80151; Estruturas de Dados e Algoritmos 80161; Code Complete 80171.

**Cutter (exemplo) e assuntos.** Arquitetura Limpa M386a; O Codificador Limpo M386co; Padrões de Projeto G192p; Cálculo, Vol. 1 e Vol. 2 S849c; Engenharia de Software S697e; Redes de Computadores T164r; Estruturas de Dados e Algoritmos G655e; Code Complete M478c; Algoritmos 4ª ed. C811a. `subjects`: livros de 005.1 → ["Desenvolvimento de software", "Programação"]; Cálculo → ["Matemática", "Cálculo"]; Redes → ["Redes de computadores"]. `coverTone` em ciclo de 1 a 6, na ordem da tabela 6.2.

**Empréstimos ativos que faltavam** (todos `active`, `dueAt` às 21:55, ou 14:10 no sábado; `pickedUpAt` = vencimento menos 14 dias, salvo renovação):
- Código Limpo 223223 → Júlia Martins: retirado 30/09, renovado 07/10 (`renewalCount` 1), vence 28/10.
- Código Limpo 223323 → Camila Rocha: retirado 06/10, renovado 08/10 (`renewalCount` 1), vence 03/11.
- Refatoração 51736 → Diego Alves: retirado 08/10, vence 22/10.
- Code Complete 80171 → Marina Castro: retirado 05/10, vence 19/10.
- Algoritmos 60411 (3ª ed.) → Marina Castro: retirado 03/10, vence sáb 17/10 14:10.
- Algoritmos 60412 (3ª ed.) → Pedro Henrique Lima: retirado 13/10, vence 27/10.
- Algoritmos 71880 (4ª ed.) → Ana Beatriz Lima: retirado 07/10, vence 21/10.
- Algoritmos 71881 (4ª ed.) → Rafael Teixeira: retirado 09/10, vence 23/10.

Com isso Marina fica com 3 de 10 (Cálculo, Vol. 1, Code Complete e Algoritmos), como na 6.1. Todo exemplar `on_loan` tem `currentLoanId`. Algoritmos fica com os 4 exemplares emprestados e sem fila, para a demonstração de entrar na fila em 2 edições ao vivo.

**Multas em aberto: livros e empréstimos devolvidos.** Quatro livros novos, só com o essencial (título, autor, 1 exemplar `available`): Física Básica, Vol. 2; Contabilidade Introdutória; Direito Civil: Parte Geral; Anatomia Humana. Empréstimos `returned` (dias úteis de atraso = dias de semana após o vencimento até a devolução, inclusive, sem 12/10):
- Pedro Henrique Lima · Física Básica, Vol. 2: retirado 21/09, venceu 05/10, devolvido 13/10 → 5 dias, 1000 centavos.
- Júlia Martins · Contabilidade Introdutória: retirado 23/09, venceu 07/10, devolvido 09/10 → 2 dias, 400 centavos.
- Camila Rocha · Direito Civil: Parte Geral: retirado 14/09, venceu 28/09, devolvido 02/10 → 4 dias, 800 centavos.
- Diego Alves · Anatomia Humana: retirado 11/09, venceu 25/09, devolvido 30/09 → 3 dias, 600 centavos.

**Filas.** Engenharia de Software: 1ª Beatriz Nogueira (desde 05/10), 2º Diego Alves (desde 13/10), `waiting`, `order` 1000 e 2000. Código Limpo: Lucas entrou em 09/10 e Carlos Eduardo Sá em 10/10.

**Contadores.** Todos calculados pelos dados, com uma exceção documentada: `booksReadByYear` do Lucas é o literal `{"2026": 17}` da 6.4 (o histórico dele não é carregado). Os demais alunos contam só as devoluções carregadas.

**Datas derivadas.** `requestedAt` de Beatriz em 13/10 e de Rafael em 14/10, às 12:00 (-03:00). `pickedUpAt` de Pedro Martins = vencimento menos 14 dias.

**Avisos e salvos.** Avisos do Lucas: "É a sua vez: Código Limpo", "Engenharia de Software vence em 2 dias" e o pedido RET-4821 pronto para retirada. Salvos do Lucas: Refatoração, O Codificador Limpo e Algoritmos na primeira pasta; as outras pastas vazias.

**Feriados e recessos.** `holidays/2026` vem da FeriadosAPI (nacionais, Ceará e Fortaleza) e é guardado também em `scripts/data/holidays-2026.json`, como reserva sem rede. `recesses` fica vazio até a Unifor divulgar as datas.

**Busca "código" com 24 resultados (tela A09).** Fica para depois: não entra neste seed.

---

## 7. O que fica fora do banco

- Senhas e sessões: Firebase Authentication.
- Chaves (Resend, Gemini, FeriadosAPI, Google Books): Secret Manager e `.env` (RNF-SEG-07).
- Tema claro ou escuro e "já viu a apresentação": no próprio aparelho.
- Perda, dano e reposição de obras: fora do escopo, só texto na tela Regras da biblioteca.
- Pagamentos: o app não recebe; só o registro feito pelo bibliotecário (`fines.paid`).

---

## 8. Script de carga (seed) — obrigatório, primeira tarefa do código

Pedido do Gustavo em 18/10/2026: **não esquecer**. É a primeira tarefa quando o código começar (quarta, 21/10), porque a API, o app e a demonstração dependem dele.

O script fica no repositório `unifor-biblioteca-api` (ex.: `scripts/seed.ts`), roda com `npm run seed` e faz, nesta ordem:

1. **Escolhe o ambiente:** por padrão o Firebase Emulator Suite (`FIRESTORE_EMULATOR_HOST` e `FIREBASE_AUTH_EMULATOR_HOST`). Produção só com a opção explícita `--prod` e uma confirmação digitada, para nunca apagar dados reais sem querer (RNF-SEG-08).
2. **Limpa** as coleções da seção 1 (só no emulador, ou em produção com `--reset` confirmado).
3. **Grava as configurações:** `settings/library` (com `simulatedNow` só no emulador), `recesses` e `holidays/2026` (buscado na FeriadosAPI, ou um arquivo local se a chave não estiver no `.env`).
4. **Cria as contas no Firebase Authentication:** cada usuário da seção 6.1 com `authEmail` e uma senha de teste lida do `.env` (nunca escrita no código), já ativas, e grava `users`, `matriculaIndex` e `emailIndex` com o mesmo `uid`.
5. **Grava o acervo:** `works`, `books` e `copies` da seção 6.2; com a chave do Google Books, completa capa, sinopse e editora pelo ISBN (RF-ACE-04, RF-ACE-05).
6. **Grava a circulação:** `loans`, `queueEntries` e `fines` da seção 6.3, com contadores (`activeLoanCount`, `activeQueueCount`, `copiesAvailable`, `queueLength`, `openFineTotalCents`, `booksReadByYear`) calculados a partir dos próprios dados, nunca digitados à mão.
7. **Grava avisos e salvos de exemplo** (Notificações do Lucas, pastas "Ler depois", "Amei!!!" e "TCC").
8. **Publica os índices e as regras:** `firestore.indexes.json` e `firestore.rules` da seção 4 e 5 (`firebase deploy --only firestore`) e as políticas de TTL da seção 4.3 (`gcloud firestore fields ttls update`).
9. **Confere** e imprime um resumo: quantos documentos por coleção e se as checagens passam (Lucas com 4 de 10, Marina com 3 dias úteis e R$ 6,00, Arquitetura Limpa com 4 na fila, R$ 28,00 em aberto).

O script deve poder rodar várias vezes seguidas e chegar sempre ao mesmo resultado (idempotente), para recarregar o banco antes da demonstração de 29/10.
