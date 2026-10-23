# Requisitos funcionais e não funcionais

Gerado em 18/10/2026 a partir do documento de requisitos (rev 77) e do kanban. São 85 RF e 28 RNF. "Comum" vale para as duas entregas (29/10 e 09/11); "Sistema" é comportamento automático da API. Prioridade: Alta, Média ou Baixa.

Cada tarefa de código deve citar o código do requisito que atende (ex.: `RF-EMP-01`).

## Requisitos funcionais

### Acesso e cadastro

- **RF-AUT-01 — Cadastro do aluno** (Alta, Comum): O aluno cria a conta preenchendo e-mail institucional, matrícula de 7 dígitos, senha e confirmação da senha. Matrícula e e-mail são únicos: a API recusa um cadastro repetido, e o app mostra o erro no campo repetido.
- **RF-AUT-02 — Validar e-mail @edu.unifor.br** (Alta, Comum): O cadastro só aceita e-mail que termine em @edu.unifor.br. A validação é uma expressão regular, sem consultar a base da Unifor.
- **RF-AUT-03 — Token de confirmação por e-mail** (Alta, Comum): A API envia por e-mail um token de confirmação, que o aluno digita no app. O aluno pode pedir o reenvio e corrigir o e-mail. O token vale 20 minutos e é de uso único; vencido ou já usado, o app avisa e oferece reenviar.
- **RF-AUT-04 — Criar passkey após confirmar e-mail** (Alta, Comum): Depois de confirmar o e-mail, o app mostra uma tela que recomenda criar o passkey: ilustração, três vantagens (entrar em um toque, mais seguro que senha, biometria que não sai do celular) e os botões Criar passkey e Agora não. Criar passkey abre a biometria na hora, o celular cria o passkey (digital, rosto ou PIN) e a API guarda só a chave pública. Agora não entra no app, e o passkey pode ser criado depois em Meus passkeys.
- **RF-AUT-05 — Login com passkey (principal)** (Alta, Comum): O aluno entra com passkey (método principal, nas duas entregas): a API manda um desafio, o celular o assina e a API devolve um custom token do Firebase, que o app troca pela sessão.
- **RF-AUT-06 — Login com matrícula e senha (Firebase Auth)** (Alta, Comum): O aluno também entra com matrícula e senha pelo Firebase Authentication, pela opção Outras formas de entrar. A conta no Firebase usa um e-mail interno montado da matrícula (por exemplo 2412858@contas.uni-books.app, que nunca recebe mensagens), e o e-mail real fica no Firestore. O bibliotecário entra do mesmo jeito.
- **RF-AUT-07 — Login do bibliotecário** (Alta, Comum): O bibliotecário entra com matrícula e senha pré-cadastradas, sem passkey e sem tela de cadastro.
- **RF-AUT-08 — Recuperação de senha** (Alta, Comum): O aluno e o bibliotecário recuperam a senha do mesmo jeito: pedem um token no e-mail cadastrado, digitam no app e definem uma nova senha.
- **RF-AUT-09 — Novo passkey após recuperar acesso** (Média, Comum): Depois de recuperar o acesso em outro celular, o aluno pode criar um novo passkey.
- **RF-AUT-10 — Meus passkeys** (Média, Comum): Em Meus passkeys, o aluno vê os aparelhos cadastrados, cria um passkey no aparelho que está usando e remove um deles, com confirmação. Se o aparelho já tem um passkey da conta, o celular avisa e não cria outro. Num aparelho sem passkey, o botão Criar passkey neste aparelho fica ativo.
- **RF-AUT-11 — Logout** (Alta, Comum): O usuário sai da conta: o app sai do Firebase e a API revoga os refresh tokens dele.
- **RF-AUT-12 — Rotas protegidas: 401, 403 e sessão expirada** (Alta, Comum): Cada rota exige sessão. As rotas do bibliotecário exigem o perfil bibliotecário. Sem sessão a API responde 401; com o perfil errado, 403. No app, a sessão expirada leva ao login com o aviso "Sua sessão expirou"; o 403 não aparece no app, que não oferece ações de outro perfil, e é mostrado na demonstração da API.
- **RF-AUT-13 — Abrir área conforme o perfil** (Alta, Comum): Após o login, o app abre a área do aluno ou o painel do bibliotecário, conforme o perfil.
- **RF-AUT-14 — Abertura e apresentação** (Baixa, Comum): No primeiro acesso, o app mostra a abertura e 3 telas de apresentação que dão para pular.
- **RF-AUT-15 — Tela de login única** (Média, Comum): A tela de login é a mesma nas duas entregas, com o passkey primeiro e o campo de senha em "Outras formas de entrar", e um atalho pequeno que troca o formulário entre "Acessar como bibliotecário" e "Acessar como aluno".
- **RF-AUT-16 — Outras formas de entrar** (Alta, Comum): Se o passkey não funcionar (biometria recusada ou celular sem passkey), o aluno abre "Outras formas de entrar" e escolhe entre entrar com matrícula e senha, pelo Firebase Authentication, ou "Esqueci minha senha" (token por e-mail e nova senha). Depois de entrar com a senha, pode criar o passkey no aparelho.

### Acervo

- **RF-ACE-01 — Busca no acervo** (Alta, Comum): O aluno busca livros por título, autor ou assunto, ignorando acento, sem filtros avançados.
- **RF-ACE-02 — Página do livro** (Alta, Comum): A página do livro mostra capa, status, exemplares, edição, editora, ano, CDU, Cutter, estante e sinopse.
- **RF-ACE-03 — Devolução prevista e fila no livro emprestado** (Alta, Comum): Livro emprestado mostra a devolução prevista e quantas pessoas estão na fila.
- **RF-ACE-04 — Enriquecer livro com Open Library e BrasilAPI** (Alta, Comum): A API enriquece cada livro com 2 requisições feitas ao mesmo tempo, com o ISBN: uma à Open Library (título, autores, capa e assuntos) e outra à BrasilAPI (sinopse e campos vazios), e combina o resultado com os dados locais. Cada requisição tem tempo máximo de 5 segundos.
- **RF-ACE-05 — Script de importação do acervo** (Média, Comum): Um script de importação percorre o acervo e atualiza os livros pela Open Library e BrasilAPI.
- **RF-ACE-06 — Busca sem resultado leva ao Assistente** (Baixa, Comum): Na busca sem resultado, o app oferece perguntar ao Assistente.
- **RF-ACE-07 — Compartilhar livro** (Baixa, Comum): O aluno compartilha o livro pelo menu nativo do celular, pelo botão Compartilhar da página do livro.
- **RF-ACE-08 — Livro indisponível para novos pedidos** (Média, Comum): O livro marcado como indisponível para novos pedidos continua na busca e na página do livro. Os botões Solicitar empréstimo e Entrar na fila ficam desativados, com o aviso "Indisponível para novos pedidos".

### Empréstimos

- **RF-EMP-01 — Solicitar empréstimo** (Alta, Comum): O aluno solicita um livro disponível; um exemplar fica separado e ele tem 2 dias úteis para retirar.
- **RF-EMP-02 — Limite de 10 livros** (Alta, Comum): O aluno tem no máximo 10 livros ao mesmo tempo; livro solicitado e ainda não retirado conta nos 10.
- **RF-EMP-03 — Recusar mesmo título e outra edição** (Média, Comum): A API recusa dois exemplares do mesmo título e outra edição dele.
- **RF-EMP-04 — Atraso bloqueia novos empréstimos** (Alta, Comum): Enquanto houver livro em atraso, o aluno não solicita, não entra em fila e não retira outro livro.
- **RF-EMP-05 — Cancelar solicitação** (Alta, Comum): O aluno cancela uma solicitação antes de retirar; o exemplar volta a ficar disponível ou segue para o próximo da fila.
- **RF-EMP-06 — Expirar pedido não retirado** (Alta, Sistema): O pedido não retirado em 2 dias úteis expira e o exemplar volta ao acervo.
- **RF-EMP-07 — QR de retirada** (Alta, Comum): O app mostra o QR da retirada com um código aleatório do pedido, também sem internet.
- **RF-EMP-08 — Meus empréstimos** (Alta, Comum): Meus empréstimos lista ativos, filas e histórico, com prazo, progresso e status de cada livro.
- **RF-EMP-09 — Renovar empréstimo** (Alta, Comum): O aluno renova um empréstimo uma única vez, por +14 dias, dentro do prazo.
- **RF-EMP-10 — Negar renovação com motivo** (Alta, Comum): A renovação é negada se o empréstimo está em atraso, se há pessoas na fila do livro ou se a renovação já foi usada; o app mostra o motivo.
- **RF-EMP-11 — Cálculo de prazos em dias úteis** (Alta, Sistema): Prazos em dias úteis excluem fins de semana, feriados e recesso, vencem no horário de fechamento da biblioteca e, se caem em feriado, passam para o próximo dia útil.

### Filas

- **RF-FIL-01 — Ver pessoas na frente antes de entrar** (Alta, Comum): Antes de entrar na fila, o aluno vê quantas pessoas estão na frente.
- **RF-FIL-02 — Fila só com todos os exemplares emprestados** (Alta, Comum): A fila só abre quando todos os exemplares da edição estão emprestados.
- **RF-FIL-03 — Limite de 7 filas** (Média, Comum): O aluno entra em até 7 filas ao mesmo tempo, separado do limite de 10 empréstimos.
- **RF-FIL-04 — Fila em várias edições** (Média, Comum): Em livro com mais de uma edição, o aluno marca uma ou mais. Cada edição marcada conta como 1 das 7 filas. A primeira que voltar fica com ele, e as outras filas são canceladas com aviso, liberando essas vagas.
- **RF-FIL-05 — Sair da fila** (Alta, Comum): O aluno sai de uma fila a qualquer momento.
- **RF-FIL-06 — Vez na fila: 24h e 2 dias úteis** (Alta, Sistema): Quando o livro volta, o 1º da fila é avisado e tem 24h corridas para confirmar; ao confirmar, tem 2 dias úteis para retirar.
- **RF-FIL-07 — Perdeu o prazo, sai da fila** (Alta, Sistema): Quem perde um dos prazos sai da fila e o próximo é avisado.
- **RF-FIL-08 — Minhas filas** (Alta, Comum): Minhas filas mostra a posição e o status de cada fila.

### Multas

- **RF-MUL-01 — Cálculo da multa** (Alta, Sistema): A multa é de R$ 2,00 por dia útil de atraso, por livro, sem teto.
- **RF-MUL-02 — Multa congelada na devolução** (Alta, Sistema): Na devolução a multa para de contar e fica em aberto até o bibliotecário registrar o pagamento.
- **RF-MUL-03 — Aluno consulta multas (sem pagar no app)** (Alta, Comum): O aluno consulta o valor, os dias de atraso e o livro de cada multa. O app não recebe pagamentos: a multa se paga só no balcão.
- **RF-MUL-04 — Multa em aberto sem atraso só avisa** (Média, Comum): Multa em aberto sem atraso só mostra um aviso e não bloqueia novos empréstimos.

### Salvos

- **RF-SAL-01 — Salvar livro** (Média, Comum): O aluno salva um livro em "Todos os salvos" e o remove de lá.
- **RF-SAL-02 — CRUD de pastas de Salvos** (Alta, Comum): O aluno cria, renomeia e apaga pastas (nome com até 30 caracteres). Apagar uma pasta não remove os livros de "Todos os salvos".
- **RF-SAL-03 — Livros nas pastas** (Alta, Comum): O aluno coloca e tira livros das pastas.

### Perfil

- **RF-PER-01 — Perfil do aluno** (Média, Comum): O Perfil mostra os dados do aluno, os livros com ele, as filas ativas, quantos livros leu no ano e as multas.
- **RF-PER-02 — Regras da biblioteca** (Baixa, Comum): A tela Regras da biblioteca resume as regras e leva à página oficial. Inclui o aviso de que, em caso de perda ou dano da obra, o aluno responsável deve repor o livro. O app só informa essa regra e não controla a reposição.
- **RF-PER-03 — Tema claro e escuro** (Média, Comum): O app tem tema claro e escuro, nos dois perfis.

### Balcão (bibliotecário)

- **RF-BAL-01 — Painel do bibliotecário** (Média, Comum): O painel mostra os números do dia: retiradas pendentes, devoluções, filas e multas.
- **RF-BAL-02 — Leitor único de QR abre a ficha do aluno** (Alta, Comum): O bibliotecário escaneia o QR do pedido num leitor único, sem abas. O QR abre a ficha do aluno (pedido e livros com ele), de onde ele registra a retirada; o empréstimo de 14 dias começa a contar.
- **RF-BAL-03 — Ficha do aluno sem QR (matrícula ou código)** (Alta, Comum): Sem QR, o bibliotecário digita a matrícula ou o código do pedido e abre a mesma ficha do aluno.
- **RF-BAL-04 — Registrar devolução pela ficha do aluno** (Alta, Comum): O bibliotecário registra a devolução a partir da ficha do aluno (QR do pedido ou matrícula). Se há fila, o 1º é avisado na hora.
- **RF-BAL-05 — Lista de retiradas com busca por matrícula** (Média, Comum): A lista Retiradas mostra os pedidos aguardando retirada e o prazo de cada um, numa lista única do prazo mais curto ao mais longo, com busca pela matrícula do aluno.
- **RF-BAL-06 — Gerir fila do livro** (Alta, Comum): Na fila de um livro, o bibliotecário muda a posição de um aluno, reenvia o aviso, remove com motivo e adiciona um aluno em qualquer posição com motivo.
- **RF-BAL-07 — Confirmação ao passar à frente na fila** (Média, Comum): Mexer na fila no fim não pede confirmação; passar à frente de outros pede confirmação listando quem desce, com motivo obrigatório. O aluno afetado é avisado.
- **RF-BAL-08 — Multa paga agora na devolução** (Alta, Comum): Ao registrar a devolução de um livro com multa, o bibliotecário pode marcar "Multa paga agora" depois de receber o valor no balcão.
- **RF-BAL-09 — Aba Multas** (Média, Comum): A aba Multas, que fica na barra do bibliotecário, lista as multas Em aberto, Contando e Pagas, com busca por nome ou matrícula e sem filtros avançados, e o bibliotecário registra o pagamento de uma multa em aberto.
- **RF-BAL-10 — Perfil do bibliotecário** (Baixa, Comum): O perfil do bibliotecário permite trocar o tema e sair da conta.

### Gestão do acervo

- **RF-GAC-01 — Listar e buscar acervo (bibliotecário)** (Alta, Comum): O bibliotecário abre o acervo por um atalho no Painel (a home) e lista e busca os livros por título, autor ou ISBN, com filtros.
- **RF-GAC-02 — Cadastrar livro (aviso de ISBN não encontrado)** (Alta, Comum): O bibliotecário cadastra um livro (ISBN, título, autores, editora, edição, ano, CDU, Cutter, estante e exemplares), com busca do ISBN na Open Library e na BrasilAPI. Se nenhuma encontrar o ISBN, o app avisa em vermelho e o bibliotecário preenche os dados à mão.
- **RF-GAC-03 — Editar livro** (Alta, Comum): O bibliotecário edita os dados de um livro.
- **RF-GAC-04 — Atualizar livro pelas fontes externas** (Alta, Comum): O bibliotecário atualiza um livro pela Open Library e BrasilAPI; CDU, Cutter, estante e exemplares não mudam. Rota só do bibliotecário.
- **RF-GAC-05 — Remover livro** (Média, Comum): O bibliotecário remove um livro do acervo. Só é possível se nenhum exemplar estiver emprestado e não houver fila; o histórico de empréstimos é mantido. Quando não for possível, o bibliotecário marca o livro como indisponível para novos pedidos (RF-GAC-06).
- **RF-GAC-06 — Indisponível para novos pedidos** (Média, Comum): O bibliotecário marca um livro como "Indisponível para novos pedidos" ao editá-lo e tira a marca quando quiser. Com a marca, ninguém solicita o livro nem entra na fila dele. O livro continua no catálogo, visível para os alunos. Pedidos, empréstimos e filas que já existem não mudam.

### Sistema (rotinas automáticas)

- **RF-SIS-01 — Feriados na FeriadosAPI com cache** (Alta, Comum): A API busca os feriados nacionais, do Ceará e de Fortaleza na FeriadosAPI e os guarda no banco, por causa do limite de 60 requisições por minuto.
- **RF-SIS-02 — Horários e recesso** (Média, Comum): Horários da biblioteca e dias de recesso ficam numa tabela pequena preenchida à mão.
- **RF-SIS-03 — Atraso calculado, não salvo** (Média, Sistema): Atraso é calculado pela data de vencimento, não é um estado salvo.
- **RF-SIS-04 — Data de hoje simulada no teste** (Média, Comum): No ambiente de teste, a API aceita uma "data de hoje" simulada para a demonstração.
- **RF-SIS-05 — Rotina agendada (Cloud Scheduler)** (Alta, Sistema): Uma rotina agendada (Cloud Scheduler) chama a API para expirar pedidos, andar filas e enviar lembretes de prazo.

### Avisos

- **RF-AVI-01 — Notificações no app** (Alta, Comum): O app mostra as notificações do aluno (sua vez, prazo, atraso, devolução, fila) e permite marcar todas como lidas.
- **RF-AVI-02 — Push (Expo) e e-mail (Resend)** (Alta, Comum): Os avisos também chegam por push (Expo, só no Android) e por e-mail (Resend) no e-mail cadastrado. No iPhone, sem push, os avisos ficam dentro do app.
- **RF-AVI-03 — Ligar e desligar avisos** (Média, Comum): "Sua vez na fila" e "Atraso e multa" ficam sempre ligados; os demais avisos o aluno liga e desliga.
- **RF-AVI-04 — Falha no push coberta pelo app** (Média, Comum): Se o push falhar, o aviso dentro do app cobre a falha.

### Assistente (IA)

- **RF-ASS-01 — Assistente ensina a usar o app** (Alta, Comum): O Assistente ensina o aluno a usar o app.
- **RF-ASS-02 — Assistente busca e sugere parecidos** (Alta, Comum): O Assistente busca no acervo e sugere livros parecidos.
- **RF-ASS-03 — Sugestões pelo histórico e Recomendados para você** (Média, Comum): O Assistente sugere livros pelo histórico de leitura do aluno. As sugestões também aparecem no Início, em "Recomendados para você".
- **RF-ASS-04 — Assistente age com confirmação** (Alta, Comum): O Assistente solicita empréstimo e entra em fila em nome do aluno, mostra antes o que vai fazer e só age depois da confirmação. As ações seguem as mesmas regras e permissões do aluno; se uma regra bloqueia a ação (atraso, limite), o Assistente explica o motivo e não oferece confirmação.
- **RF-ASS-05 — Aviso de que pode errar** (Média, Comum): O Assistente mostra o aviso de que pode errar.
- **RF-ASS-06 — Assistente só do aluno** (Média, Comum): O Assistente é só do aluno; o bibliotecário não o acessa.
- **RF-ASS-07 — Assistente como módulo da API (Gemini)** (Alta, Comum): O Assistente é um módulo da API principal (Gemini API) e só envia ao provedor o que precisa.

## Requisitos não funcionais

### Segurança

- **RNF-SEG-01 — HTTPS com domínio próprio** (Alta, Comum): Todo o tráfego entre app e API usa HTTPS, com domínio próprio.
- **RNF-SEG-02 — Sessão com ID token do Firebase** (Alta, Comum): Nas duas entregas, a sessão é o ID token do Firebase Authentication, que o SDK JavaScript do Firebase guarda e renova; a API o confere com o Firebase Admin, inclusive se foi revogado, e, no logout, revoga os refresh tokens do usuário.
- **RNF-SEG-03 — Chave privada do passkey fica no aparelho** (Alta, Comum): A chave privada do passkey nunca sai do aparelho; a API guarda só a chave pública e usa um desafio novo a cada tentativa.
- **RNF-SEG-04 — Senhas só no Firebase Authentication** (Alta, Comum): As senhas ficam só no Firebase Authentication, nas duas entregas. A API não guarda senha nenhuma, nem em hash, e nunca as registra em log.
- **RNF-SEG-05 — Tokens de e-mail de uso único** (Alta, Comum): Os tokens de e-mail (confirmação e recuperação) são de uso único e de validade curta (meta: 20 minutos).
- **RNF-SEG-06 — App só fala com a API** (Alta, Comum): O app nunca lê nem grava no banco direto: tudo passa pela API, que aplica as regras e as permissões.
- **RNF-SEG-07 — Segredos no Secret Manager e em .env fora do Git** (Alta, Comum): Chaves e segredos (Resend, Gemini, FeriadosAPI) ficam no Secret Manager em produção e num arquivo .env fora do Git no desenvolvimento, nunca no repositório.
- **RNF-SEG-08 — Testes só no Emulator Suite** (Alta, Comum): Os testes usam o Firebase Emulator Suite e nunca tocam os dados de produção.

### Desempenho

- **RNF-DES-01 — Busca em até 1 segundo** (Média, Comum): A busca no acervo responde em até 1 segundo no acervo de demonstração, com a API já acordada.
- **RNF-DES-02 — Telas em até 2 segundos** (Média, Comum): As demais telas carregam em até 2 segundos com conexão comum de celular. A primeira chamada depois de a API ficar parada (Cloud Run com zero instâncias, para manter o gasto zero) fica fora destas duas metas; a API é acordada antes da demonstração.
- **RNF-DES-03 — Cache de feriados** (Alta, Comum): A API guarda os feriados no banco para não estourar o limite de 60 requisições por minuto da FeriadosAPI.

### Confiabilidade

- **RNF-CON-01 — QR funciona sem internet** (Alta, Comum): O QR de retirada aparece no celular do aluno mesmo sem internet.
- **RNF-CON-02 — Aviso não se perde se o push falhar** (Média, Comum): Falha no push não perde o aviso: ele continua dentro do app.
- **RNF-CON-03 — Acervo funciona se as fontes externas falharem** (Média, Comum): Falha na Open Library ou na BrasilAPI não impede o uso do acervo: a busca e a página do livro nunca chamam as fontes e a API usa os dados já salvos. Só o cadastro e a atualização de um livro as consultam, e uma fonte fora do ar não impede a outra de responder.

### Usabilidade

- **RNF-USA-01 — Interface em português com prazos concretos** (Média, Comum): Interface em português do Brasil, com prazos concretos ("Retire até seg, 19/10") e botões que começam com verbo.
- **RNF-USA-02 — Contraste WCAG AA** (Média, Comum): Contraste de texto de pelo menos 4,5:1 (WCAG 2.1 AA), nos dois temas.
- **RNF-USA-03 — Alvos de toque e nomes acessíveis** (Média, Comum): Alvos de toque de pelo menos 44 px e nomes acessíveis nos botões só com ícone.
- **RNF-USA-04 — Status nunca só por cor** (Média, Comum): O status nunca depende só da cor: sempre vem com ícone e palavra.
- **RNF-USA-05 — Confirmação nas decisões** (Média, Comum): Toda decisão (solicitar, cancelar, sair da fila, renovar, remover, registrar devolução ou pagamento) pede confirmação.

### Compatibilidade

- **RNF-COM-01 — Android e iOS em celular físico** (Alta, Comum): O app roda em Android e iOS, apresentado em celular físico. Como o app vai rodar no iPhone (sem conta paga da Apple não há passkey nem push) será decidido depois que o Android estiver funcionando.
- **RNF-COM-02 — Pré-requisitos dos passkeys (só Android)** (Alta, Comum): Passkeys rodam só no Android: exigem build de desenvolvimento do Expo (não rodam no Expo Go), domínio HTTPS e o arquivo assetlinks.json. No iPhone exigiriam a conta paga da Apple, que o projeto não usa. Como o app tem passkey, no Android ele roda como build de desenvolvimento nas duas apresentações.

### Manutenção

- **RNF-MAN-01 — Dois repositórios, só a main, entregas por tag** (Alta, Comum): São dois repositórios, unifor-biblioteca-api e unifor-biblioteca-app, cada um só com a branch main. Cada tarefa vira uma branch curta com PR para a main, e cada entrega é marcada por tag: integration-delivery (29/10, nos dois) e mobile-delivery (09/11).
- **RNF-MAN-02 — README e código em inglês** (Alta, Comum): README e código do app em inglês; commits e interface em português.
- **RNF-MAN-03 — Usar o design system UniforBib** (Média, Comum): As telas usam o design system UniforBib (cores, tipos e componentes) em vez de estilos soltos.

### Implantação

- **RNF-IMP-01 — API no Cloud Run** (Alta, Comum): A API roda no Google Cloud Run, com HTTPS e domínio próprio, e orçamento com alerta.
- **RNF-IMP-02 — README da API** (Alta, Comum): O README da API traz como clonar, executar, as variáveis de ambiente, o deploy e o link da API publicada.
- **RNF-IMP-03 — Firestore: produção e Emulator Suite** (Alta, Comum): O banco é o Firebase Firestore, com ambiente de produção no Firebase e ambiente de teste no Emulator Suite.
- **RNF-IMP-04 — App completo na demo de 29/10** (Alta, Comum): O app completo, com todas as funcionalidades, funciona em 29/10 para a demonstração ao vivo da API.
