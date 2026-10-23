# Unifor Biblioteca — Documento de Escopo

Criado em 15/10/2026 por Gustavo. Exportado em 18/10/2026 (versão 155). Fonte oficial: documento de escopo no Claude.

## O que é o sistema

Unifor Biblioteca é um app mobile de biblioteca universitária, com API REST própria, para alunos de graduação da Unifor e para a equipe do balcão. O aluno busca no acervo, solicita empréstimo, acompanha prazos e entra na fila quando o livro está emprestado, vendo antes quantas pessoas estão na frente. O bibliotecário registra retiradas e devoluções, acompanha multas e gerencia as filas. Um Assistente com IA ensina o aluno a usar o app e sugere livros pelo histórico de leitura.

O projeto é a entrega final de duas cadeiras: Técnicas de Integração de Sistemas (a API, demonstrada ao vivo por meio do app) e Desenvolvimento Mobile (o app, em React Native com Expo). Este escopo é único para as duas e deve ser seguido fielmente até o fim.

O app não recebe pagamentos: multa se paga só no balcão. Livros, datas e históricos usados nas telas são exemplos, porque não há acesso a dados reais da biblioteca.

## Ecossistema

O sistema tem três partes: o app mobile, a API REST e um banco de dados em dois ambientes.

- **App mobile:** React Native com Expo, para Android e iOS. É o cliente da API e atende os dois perfis (aluno e bibliotecário) num único app.
- **API REST:** Node. Concentra as regras de negócio, a autenticação (cadastro com confirmação de e-mail, senha e passkeys), as permissões por perfil, o módulo do Assistente com IA e a integração com a API externa.
- **Banco de dados:** Firebase Firestore, exigido pela cadeira de Mobile, em dois ambientes: produção no Firebase e teste local no Firebase Emulator Suite. Os testes nunca tocam os dados de produção.
- **Assistente com IA:** módulo da própria API principal, e não um serviço separado. É exclusivo do aluno e usa a Gemini API. Lê o acervo e o histórico do aluno pela API e não tem banco próprio. As ações do Assistente (solicitar empréstimo e entrar em fila) passam pelas mesmas regras de negócio e permissões do aluno.

A API é o centro do sistema: o app a chama por HTTPS, e ela consulta o banco e a API externa.

## Perfis e atores

O perfil (aluno ou bibliotecário) é definido no login pela matrícula, e a API só libera cada ação ao perfil que pode fazê-la.

| Ator | Quem é | O que faz |
| --- | --- | --- |
| Aluno | Graduação da Unifor. Personas das telas: Lucas Almeida (2412858), em dia, e Marina Castro (2513320), com um livro atrasado. | Busca no acervo, solicita empréstimo, entra em filas, retira com QR, renova, acompanha multas, salva livros em pastas, conversa com o Assistente. |
| Bibliotecário | Equipe do balcão. Não se cadastra pelo app: as contas já existem no banco (dados pré-cadastrados) e ele só faz login. Persona das telas: Ana Souza. | Escaneia o QR de retirada, registra devolução, confirma pagamento de multa, gerencia filas (mudar posição, reenviar aviso, remover, adicionar aluno). |
| Assistente (IA) | Só para o aluno. | Ajuda de uso do app, busca no acervo com sugestão de livros parecidos e sugestões pelo histórico. Avisa que pode errar. |
| Sistema | Automático. | Anda a fila, conta prazos, envia avisos e calcula multas. |
| API externa | Open Library e BrasilAPI, públicas, gratuitas e sem chave. | Fornece dados que a API combina com os do acervo local (ver Integração com API externa). |

## Dentro e fora do escopo

O app cobre o ciclo completo de empréstimo de livros para a graduação, do acervo à devolução. O que não está na lista abaixo não será feito.

**Dentro**

- Aluno: primeiro acesso (abertura e 3 telas curtas puláveis), cadastro com e-mail institucional e confirmação por token, login (passkey como principal, com matrícula e senha como alternativa), recuperação de senha, início (com "Recomendados para você", vindos do Assistente), busca no acervo por título, autor ou assunto e página do livro, solicitar empréstimo, fila, retirada por QR, meus empréstimos e renovação, atraso e multa (consulta), Salvos com pastas, notificações com liga/desliga, regras da biblioteca, perfil (com Meus passkeys) e Assistente.
- Bibliotecário: login (sem cadastro, a conta já existe no banco), painel, retiradas, escanear o QR do pedido (abre a ficha do aluno, onde se registram a retirada e as devoluções; sem QR, digita a matrícula ou o código do pedido), gestão de filas com ações manuais, a aba Multas (com busca por nome ou matrícula) na barra (Em aberto, Contando e Pagas) e a gestão do acervo, aberta por um atalho no Painel (lista, cadastro, edição e remoção de livro, marcação de livro como indisponível para novos pedidos, e atualização de um livro pela Open Library e BrasilAPI).
- Tema claro e escuro, nos dois perfis.
- Avisos e lembretes no celular e no e-mail cadastrado.

**Fora**

- Alunos que não sejam de graduação.
- Vídeos, jogos, bolsas e guarda-volumes da biblioteca.
- Pagamento de multa pelo app ou qualquer integração de pagamento.
- Sugerir aquisição de livro e citação ABNT.
- Avaliações de usuários nos livros.
- Assistente para o bibliotecário.
- Filtros avançados e atalhos na busca do acervo (tipo de material, idioma, ordenação, Meu curso, Mais lidos).
- Sugestões do Assistente enviadas como aviso ou e-mail.

## Regras de negócio

Estas regras já estão decididas no design e valem para a API e para o app. Dias úteis excluem fins de semana e feriados (nacionais, do Ceará e de Fortaleza, vindos da FeriadosAPI) e dias de recesso do calendário acadêmico; prazo que cai em feriado passa para o próximo dia útil.

| Tema | Regra |
| --- | --- |
| Login | Matrícula de 7 dígitos (os 2 primeiros são o ano de ingresso). O cadastro é só de aluno e só aceita e-mail que termine em @edu.unifor.br (a API valida só o formato, com uma expressão regular). Bibliotecário não se cadastra: a conta já existe no banco e ele só faz login. O perfil vem do login. |
| Limites do aluno | Até 10 livros ao mesmo tempo, 14 dias por empréstimo. Não pode pegar dois exemplares do mesmo título nem outra edição dele. |
| Livro disponível | Sem fila, o aluno solicita e tem 2 dias úteis para retirar. |
| Fila | Só abre quando todos os exemplares da edição estão emprestados. O aluno vê quantas pessoas estão na frente antes de entrar. Até 7 filas ao mesmo tempo, separado do limite de 10 empréstimos. |
| Várias edições | Ao entrar na fila de um livro com mais de uma edição, o aluno marca uma ou mais. A primeira que voltar fica com ele e as outras filas são canceladas sozinhas, com aviso. Para o limite de 7 filas, cada edição marcada conta como 1 fila. |
| Livro devolvido | O 1º da fila tem 24h para confirmar e, depois, 2 dias úteis para retirar. Quem perde um prazo sai da fila e o próximo é avisado. |
| Renovação | Uma única renovação por empréstimo, de +14 dias, dentro do prazo. Não renova se o empréstimo está em atraso nem se há pessoas na fila do livro. Pelo app, Unifor Online ou balcão. |
| Multa | R$ 2,00 por dia útil de atraso, por livro (valor adotado pelo projeto). Na devolução ela para de contar e fica em aberto até o bibliotecário registrar o pagamento. |
| Atraso | Bloqueia novos empréstimos (solicitar, entrar em fila, retirar) até a devolução. Com multa em aberto, o aluno pode pegar livros e vê só um aviso. |
| Pagamento | Só presencial, no balcão. Só o bibliotecário confirma, na devolução (chave "Multa paga agora") ou depois, na aba Multas. |
| Perda ou dano | O aluno repõe o livro e ainda paga a multa do atraso. O app só informa essa regra, na tela Regras da biblioteca, e não controla a reposição. |
| Remoção de livro | Só se remove livro sem exemplar emprestado e sem fila; o histórico de empréstimos é mantido. Quando não dá, o bibliotecário marca o livro como indisponível para novos pedidos: ele continua no catálogo, mas ninguém solicita nem entra na fila dele. Pedidos, empréstimos e filas que já existem não mudam. |
| Retirada | QR no app do aluno (funciona sem internet), escaneado pelo bibliotecário. Alternativa: matrícula ou código do pedido. |
| Fila pelo bibliotecário | Pode mudar posição, reenviar aviso, remover com motivo e adicionar aluno em qualquer posição com motivo. No fim da fila não pede confirmação; à frente de outros pede confirmação listando quem desce, com motivo obrigatório. |
| Avisos | "Sua vez na fila" e "Atraso e multa" ficam sempre ligados; os demais o aluno liga e desliga. |
| Assistente | Só para o aluno. Mostra aviso de que pode errar. |
| Atendimento | Biblioteca (Praça Central): seg a sex, 7h às 21h55; sáb, 8h às 14h10. BiblioZap (85) 3477-3257, Empréstimo (85) 3477-3162, bibemprestimo@unifor.br. |

## Autenticação

O acesso combina senha, confirmação de e-mail e passkeys, porque o passkey (WebAuthn) não funciona sozinho: o celular assina um desafio com uma chave privada que nunca sai do aparelho, e a API guarda só a chave pública, mas trocar ou perder o celular exige outro caminho de entrada. Por isso o cadastro pede e-mail institucional, matrícula e senha, e confirma o e-mail com um token. O cadastro é só do aluno: o bibliotecário tem conta pré-cadastrada no banco e entra com matrícula e senha, sem passkey. O app é o mesmo nas duas entregas (decidido em 18/10): o passkey é o login principal do aluno, rápido e protegido, e a matrícula com a senha do cadastro servem de alternativa, em "Outras formas de entrar", quando o passkey não funciona. Cadastro, confirmação de e-mail, recuperação de senha, login com senha e sessão ficam no Firebase Authentication. O funcionamento detalhado do passkey no app e na API ainda será estudado e fechado pelo aluno; esta seção fixa o método e o que a API precisa oferecer.

- **Primeiro acesso (cadastro):** o aluno preenche o formulário (e-mail institucional terminado em @edu.unifor.br, matrícula, senha e confirmação da senha), recebe um token no e-mail e o digita no app para confirmar. A API só confere se o e-mail termina em @edu.unifor.br, por expressão regular, sem consultar a base da Unifor. Ela cria a conta no Firebase Authentication desativada, com o e-mail interno da matrícula e a senha, e a ativa quando o token é confirmado. Em seguida, o app mostra uma tela que recomenda o passkey, com ilustração, três vantagens (entrar em um toque, mais seguro que senha, biometria que não sai do celular) e os botões Criar passkey e Agora não. Agora não entra no app, e o passkey pode ser criado depois em Meus passkeys. Em Criar passkey, o celular cria na hora o par de chaves do passkey (digital, rosto ou PIN).
- **Login do dia a dia:** com passkey (biometria ou PIN do celular) como método principal, nas duas entregas; a API confere a assinatura e devolve um custom token do Firebase, que o app troca pela sessão. Se o passkey não funcionar, "Outras formas de entrar" leva ao login com matrícula e senha (pelo Firebase Authentication) ou à recuperação de senha. O bibliotecário não usa passkey: entra com matrícula e senha pré-cadastradas.
- **Recuperação de senha e troca de celular:** o aluno pede um token no e-mail cadastrado, digita no app e define uma nova senha. Em seguida entra com a nova senha e pode criar um novo passkey no aparelho novo.
- **Sessão:** igual nas duas entregas, feita pelo Firebase Authentication (decidido em 17/10). O SDK JavaScript do Firebase guarda e renova o ID token (que vale 1 hora), o app o envia em cada chamada no cabeçalho Authorization e a API o confere com o Firebase Admin, inclusive se foi revogado. Depois do passkey, a API devolve um custom token do Firebase e o app o troca pela sessão; o login com senha vai direto ao Firebase. No logout, o app sai do Firebase e a API revoga os refresh tokens do usuário. Não há token opaco nem JWT próprio.
- **Permissões:** cada rota exige sessão e, nas do bibliotecário, o perfil bibliotecário. Sem sessão a API responde 401; com o perfil errado, 403.
- **Gestão de passkeys:** em Meus passkeys, na tela de Perfil, o aluno vê os aparelhos cadastrados, cria um passkey no aparelho que está usando (por exemplo, se pulou essa etapa ou trocou de celular) e remove um deles. Só quem está logado cria passkey, e só para a própria conta; se o aparelho já tem um passkey da conta, o celular avisa e não cria outro.

Rotas de autenticação (nomes sugeridos, podem mudar na implementação). O login com matrícula e senha não é rota da API: o app o faz pelo SDK do Firebase, nas duas entregas.

| Método | Rota | Acesso | Função |
| --- | --- | --- | --- |
| POST | /auth/cadastro/iniciar | público | Recebe e-mail, matrícula, senha e confirmação da senha (só para alunos), recusa e-mail que não termine em @edu.unifor.br e envia o token de confirmação ao e-mail. |
| POST | /auth/cadastro/confirmar | público | Confere o token e confirma o e-mail. Em seguida, devolve as opções com o desafio para criar o passkey. |
| POST | /auth/passkey/registrar | público | Verifica a resposta do celular e salva a chave pública. |
| POST | /auth/passkey/login/opcoes | público | Devolve um desafio novo e os passkeys da matrícula. |
| POST | /auth/passkey/login/verificar | público | Confere a assinatura e devolve um custom token do Firebase, que o app troca pela sessão. |
| GET | /me | sessão | Dados de quem está logado. |
| GET, POST, DELETE | /auth/passkeys, /auth/passkeys/:id | sessão | Lista os passkeys, pede o desafio para criar um novo no aparelho atual (o registro termina em /auth/passkey/registrar) e remove um passkey. |
| POST | /auth/logout | sessão | Revoga os refresh tokens do usuário no Firebase; o app também sai do Firebase. |
| POST | /auth/cadastro/reenviar | público | Reenvia o token de confirmação do e-mail. |
| POST | /auth/senha/recuperar | público | Envia um token de recuperação ao e-mail cadastrado. |
| POST | /auth/senha/redefinir | público | Confere o token e grava a nova senha. |

## Integração com API externa

A cadeira de Integração exige que a API se integre a outra API externa, que pode ser de terceiros ou criada pela própria equipe. Os critérios são fixos: fazer pelo menos 2 requisições à API externa e combinar os dados dela com os da API local. O exemplo dado pela cadeira é uma API de biblioteca que consulta um sistema de estoque externo.

A API externa são duas APIs públicas e sem chave: a Open Library e a BrasilAPI (ISBN). Só a API principal fala com elas, e o app não participa dessa integração. A API principal busca dados brutos de livros (capa, sinopse, autores, editora, ano e assuntos), adapta ao formato que o projeto quer guardar e salva no banco, enriquecendo e atualizando o acervo. As 2 requisições à API externa são feitas ao mesmo tempo, com o ISBN, e cada uma tem tempo máximo de 5 segundos: (1) Open Library, com GET https://openlibrary.org/api/books?bibkeys=ISBN:<ISBN>&format=json&jscmd=data, que traz título, subtítulo, autores, editora, ano, assuntos e capa; (2) BrasilAPI, com GET https://brasilapi.com.br/api/isbn/v1/<ISBN>, que traz a sinopse e preenche qualquer campo que a Open Library deixou vazio (404 e 400, este para ISBN de fora do Brasil, contam como "não encontrado" nesta fonte). A Open Library vem primeiro em título, autores, capa e assuntos. Se só uma das fontes responder, vale ela; se nenhuma achar o ISBN, o livro fica como "não encontrado" e o app pede o preenchimento à mão. Falha de rede em uma fonte nunca derruba a busca nem a página do livro: só o cadastro e a atualização de um livro chamam as fontes (RNF-CON-03). A API principal combina o resultado com os dados locais (exemplares, estante, status e fila) e salva no banco. Quem dispara: um script de importação que percorre o acervo e uma rota só do bibliotecário para atualizar um livro, o que também mostra a validação de permissão por perfil na demonstração.

A Open Library e a BrasilAPI não trazem CDU, Cutter, localização na estante nem número de exemplares. Esses dados são do próprio projeto e nunca são trocados pelas fontes.

## Duas entregas, um sistema só

O mesmo sistema é entregue duas vezes, sem nenhuma diferença entre as entregas (decidido em 18/10): o app tem o passkey como login principal e "Outras formas de entrar" com matrícula e senha, o que atende as duas cadeiras. O código fica em dois repositórios (API e app), cada um só com a branch main, e cada entrega é marcada por tag. As regras de negócio deste documento valem para as duas.

O app completo, com todas as funcionalidades, também precisa estar pronto e funcionando em 29/10, porque a cadeira de Integração demonstra a API ao vivo por meio dele. Na prática, todo o escopo deste documento deve estar implementado até 29/10.

| Cadeira | O que entrega | Prazo |
| --- | --- | --- |
| Técnicas de Integração de Sistemas | API REST em Node com autenticação, endpoints protegidos, permissões por perfil, integração com API externa, README, deploy e o app completo funcionando com todas as funcionalidades | 29/10/2026 |
| Desenvolvimento Mobile | App em React Native com Expo, Android e iOS, apresentado em celular físico, com código e README em inglês | 09/11/2026 |

### Decisões dos critérios

Os critérios das duas cadeiras foram comparados e estas decisões valem para o resto do projeto.

- **Autenticação:** a cadeira de Integração exige um método de autenticação diferente do usual, e o escolhido é o passkey (WebAuthn/FIDO2), que não funciona sozinho. O cadastro é igual nas duas entregas: formulário (e-mail @edu.unifor.br, matrícula, senha e confirmação da senha) e token enviado ao e-mail e digitado no app. O cadastro é só do aluno; o bibliotecário tem conta pré-cadastrada e só faz login (matrícula e senha). Depois do cadastro, o aluno cria o passkey e passa a entrar com ele (biometria ou PIN); se o passkey falhar, entra com matrícula e senha pelo Firebase Authentication ou recupera a senha. Assim a Integração vê o passkey e a Mobile vê o Firebase Authentication, no mesmo app (decidido em 18/10). Confirmação de e-mail, recuperação de senha, login com senha e sessão ficam no Firebase Authentication.
- **Caminho dos dados:** o app (cliente) sempre fala com a API (servidor), nas duas entregas. O Firebase fica atrás da API, e o app não lê nem grava no banco direto.
- **Banco e IA:** o banco é o Firestore, e o Assistente com IA é um módulo da API principal, e não um serviço à parte. Assim há um único serviço para publicar no Cloud Run.
- **IA e recuperação de acesso:** entram nas duas entregas. Como o escopo vale inteiro para 29/10, as duas precisam estar prontas nessa data.
- **CRUDs da cadeira de Mobile (mínimo de 2, além do cadastro):** Empréstimos (o aluno solicita, consulta, renova e cancela), Pastas de Salvos (o aluno cria, renomeia, exclui e organiza livros) e Acervo (o bibliotecário cria, edita e remove livros). São três, um a mais que o mínimo.
- **Endpoints protegidos da cadeira de Integração (mínimo de 3):** solicitar empréstimo e consultar os próprios empréstimos (aluno); atualizar um livro pelas fontes externas e registrar devolução (bibliotecário). Quem não está logado recebe 401, e um aluno que chama uma rota do bibliotecário recebe 403.

### Repositórios e branches

- **Dois repositórios** (decidido em 18/10): [`unifor-biblioteca-api`](https://github.com/gustavuhh1/unifor-biblioteca-api) e [`unifor-biblioteca-app`](https://github.com/gustavuhh1/unifor-biblioteca-app). Cada um tem só a branch `main`, que é a única origem do código.
- **Entregas por tag, não por branch:** em 29/10 a tag `integration-delivery` marca a versão entregue à cadeira de Integração, nos dois repositórios; em 09/11 a tag `mobile-delivery` marca a versão entregue à cadeira de Mobile.
- **O que muda entre as entregas fica fora do código:** o README da API traz clone, execução, variáveis de ambiente, deploy e link (Integração); o README do app segue o modelo da cadeira de Mobile, junto com o PDF de requisitos e protótipo.
- **Regra de trabalho:** cada tarefa vira uma branch curta com PR para a `main`.

Como o app passa sempre pela API e é o mesmo nas duas entregas, cadastro, confirmação de e-mail, recuperação de senha e login valem igualmente para as duas cadeiras: passkey como login principal do aluno e senha pelo Firebase Authentication como alternativa.

## Pendências conhecidas

O escopo foi fechado em 17/10/2026, com as decisões complementares abaixo. O que segue são tarefas pendentes, não decisões em aberto.

- **Telas:** o canvas tem 75 telas e o Figma 105 (o Figma separa estados, como Perfil com e sem multa). Os dois são mantidos em paralelo, e as decisões da auditoria de 18/10 foram aplicadas nos dois.
- **Protótipo de passkey (terça, 20/10):** num Android físico, com RP ID uni-books.app e o assetlinks.json publicado no Firebase Hosting. Ele fecha o que falta do fluxo: o que o app mostra em cada passo e como a API trata os erros. O guia [Passkeys na Biblioteca](https://claude.ai/artifact/QiRvZgdwCR9YeK8uEgUYkK) traz o passo a passo.
- **E-mail para @edu.unifor.br:** mandar um e-mail de teste do Resend para o e-mail institucional do aluno e conferir se chega na caixa de entrada. Se a Unifor filtrar, o cadastro ao vivo não funciona.
- **Tema escuro:** feito em 18/10, sem esperar prints: todas as telas do Figma e do canvas existem também no tema escuro, com as cores ligadas às variáveis do design system. Falta só conferir o contraste no celular.

## Decisões complementares

Pontos que o escopo não definia e que foram decididos em 16 e 17/10. Valem para a API e para o app. Onde o aluno não tinha preferência, vale a recomendação.

| # | Tema | Decisão |
| --- | --- | --- |
| 1 | Renovação | Uma única renovação por empréstimo (+14 dias), dentro do prazo. Não renova se o empréstimo está em atraso nem se há pessoas na fila do livro. |
| 2 | Limite de 10 | Um livro solicitado e ainda não retirado conta nos 10 empréstimos. |
| 3 | Cancelamento | O aluno pode cancelar uma solicitação antes de retirar e sair de uma fila a qualquer momento. O exemplar volta a ficar disponível ou segue para o próximo da fila. |
| 4 | Hora dos prazos | Prazos em dias úteis vencem no horário de fechamento da biblioteca no último dia (21h55 e, no sábado, 14h10). As 24h para confirmar continuam contando em horas corridas. |
| 5 | Feriados | Vêm da FeriadosAPI (feriadosapi.com), que exige chave. A API principal busca os feriados nacionais, do Ceará e de Fortaleza e os guarda no banco, porque o plano gratuito limita a 60 requisições por minuto. Os horários da biblioteca e os dias de recesso da Unifor, que a FeriadosAPI não traz, ficam numa tabela pequena preenchida à mão. |
| 6 | Estados | Exemplar: disponível, emprestado, reservado. Empréstimo: aguardando retirada, ativo, devolvido, expirado, cancelado. "Atrasado" é calculado pela data de vencimento, não é um estado salvo. |
| 7 | Perda, dano e multa | Perda e dano ficam fora do escopo, só como regra em texto. A multa não tem teto e é paga por inteiro, por livro, no balcão. |
| 8 | Exemplo da Marina | Marina Castro retirou Cálculo, Vol. 1 no sábado 26/09 e o livro venceu no sábado 10/10 (o balcão abre aos sábados). Com 12/10 feriado nacional, os dias úteis de atraso até quinta 15/10, a data de hoje das telas, são 13, 14 e 15, ou seja, R$ 6,00. |
| 9 | Usuários | Cadastro só de aluno, sem consultar a Unifor: qualquer aluno cria sua conta informando e-mail, matrícula, senha e confirmação da senha. O e-mail só precisa terminar em @edu.unifor.br (uma expressão regular, por exemplo /^\[^\\s@\]+@edu\\.unifor\\.br$/i) e recebe um token de confirmação digitado no app. Bibliotecário não tem cadastro: as contas já existem no banco (dados pré-cadastrados) e o app só oferece login. Dados de exemplo: Lucas, Marina, Ana, mais alguns alunos e 1 ou 2 bibliotecários. |
| 10 | Demonstração ao vivo | Dados de exemplo com datas no passado e uma "data de hoje" simulada que a API aceita só no ambiente de teste. |
| 11 | Busca no acervo | A API guarda o acervo em memória e filtra por título, autor e assunto, ignorando acento. Serve para um acervo de demonstração. O Prisma não conecta ao Firestore, então não entra. |
| 12 | Login e Firebase | O login do dia a dia do aluno é o passkey, com matrícula e senha como alternativa, nas duas entregas (app único desde 18/10), e o bibliotecário entra com matrícula e senha. A senha e a sessão ficam no Firebase Authentication, e a conta no Firebase usa um e-mail interno montado da matrícula (por exemplo 2412858@contas.uni-books.app, que nunca recebe mensagens), e o e-mail real fica no Firestore para os tokens enviados pelo Resend. O app usa o SDK JavaScript do Firebase, que roda no Expo Go, e nenhuma rota revela o e-mail de alguém pela matrícula (decidido em 17/10). Cadastro, confirmação de e-mail e recuperação de senha são iguais nas duas. |
| 13 | Passkeys no app | Exigem build de desenvolvimento (não rodam no Expo Go), celular físico, domínio HTTPS e o arquivo assetlinks.json (Android). O passkey é o login principal nas duas entregas e é o critério da cadeira de Integração; a senha serve de alternativa para quem não conseguir usar o passkey, mas não o substitui na demonstração. Um protótipo mínimo num Android físico vem antes do resto, com meta de 20/10. Decidido em 17/10: passkey só no Android. No iPhone o passkey exige a capacidade Associated Domains, que só existe na conta paga da Apple (US$ 99 por ano), e o projeto não vai pagar; como o app vai rodar no iPhone será decidido depois que o Android estiver funcionando (18/10). Como o app tem passkey, no Android ele roda como build de desenvolvimento nas duas apresentações. |
| 14 | Idioma | README em inglês (exigência do Mobile), commits em português e interface em português. Código e rotas ficam flexíveis, com nomes em inglês como regra de partida, a combinar. |
| 15 | E-mail, push e lembretes | E-mail pelo Resend, com domínio próprio. Push pelo Expo, só no Android (no iPhone o push depende da conta paga da Apple, então lá os avisos ficam dentro do app). Uma rotina agendada (Cloud Scheduler) chama a API para os lembretes de prazo, e os avisos dentro do app cobrem qualquer falha do push. |
| 16 | Deploy | A API vai para o Google Cloud Run, com HTTPS e domínio próprio. Exige faturamento ativado no Google Cloud, com alerta de orçamento. |
| 17 | QR de retirada | O QR leva um código aleatório do pedido, que aparece mesmo sem internet no celular do aluno. O bibliotecário escaneia, e a API confere o código e o status do pedido. |
| 18 | Assistente (IA) | Gemini API. O Assistente lê o acervo e o histórico do aluno e também solicita empréstimo e entra em fila em nome dele, mostrando antes o que vai fazer e esperando a confirmação. O Assistente é um módulo da própria API principal, então as ações seguem as regras e permissões do aluno. Só o necessário vai ao provedor de IA. |
| 19 | Telas dos passkeys | Resolvido em 16/10. O canvas tem 75 telas (18/10), incluindo criar passkey, erro, login com passkey, Meus passkeys e remover passkey. O tema escuro também foi feito em 18/10 (as mesmas telas no Figma e no canvas). |
| 20 | Domínios | Decidido em 17/10: uni-books.app (Name.com, pelo GitHub Student Developer Pack) é o domínio principal. A API responde em api.uni-books.app pelo Firebase Hosting na frente do Cloud Run, porque o mapeamento de domínio do próprio Cloud Run não existe na região de São Paulo. O RP ID do passkey é uni-books.app, com o assetlinks.json servido pelo Hosting; trocar o RP ID depois invalida os passkeys já criados. O Resend envia de email.uni-books.app. O uni-books.me não é usado agora e fica só como saída se o .app der problema. |
| 21 | Login e navegação | O visual do app não muda por causa das cadeiras. A tela de login é a mesma nas duas entregas, com um atalho pequeno que troca o formulário entre "Acessar como bibliotecário" e "Acessar como aluno". O aluno vê a mesma tela de login nas duas entregas. O passkey vem primeiro (matrícula e confirmação por biometria) e a senha fica atrás de "Outras formas de entrar", junto com "Esqueci minha senha" (token por e-mail e nova senha). Desde 18/10 essa tela vale igual para as duas entregas: a Integração vê o passkey e a Mobile vê o login com senha pelo Firebase Authentication. Barra do bibliotecário: Painel, Retiradas, Escanear, Filas e Multas (a aba Multas fica na barra). A gestão do acervo abre por um atalho no Painel, a home do bibliotecário. |
| 22 | Sessão | Igual nas duas entregas: a sessão é o ID token do Firebase Authentication (1 hora), renovado pelo SDK JavaScript do Firebase e conferido pela API com o Firebase Admin, inclusive a revogação. O passkey é conferido pela própria API, que devolve um custom token do Firebase para o app abrir a sessão; login com senha e recuperação de senha vão pelo Firebase Authentication. O logout revoga os refresh tokens. Não há token opaco nem JWT próprio. A conta de serviço da API precisa do papel Service Account Token Creator para emitir o custom token. |
| 23 | iPhone | Passkey e push só no Android, porque no iPhone os dois dependem da conta paga da Apple (US$ 99 por ano). No iPhone os avisos ficam só dentro do app (RF-AVI-04). Como o app vai rodar no iPhone será decidido depois que o Android estiver funcionando (decidido em 18/10). |
| 24 | Metas de desempenho | Busca em até 1 segundo e demais telas em até 2 segundos (RNF-DES-01 e 02), com a API já acordada. A primeira chamada depois de a API ficar parada pode levar alguns segundos, porque o Cloud Run fica com zero instâncias para manter o gasto zero. A API é acordada antes da demonstração. |
| 25 | Contas e tokens | O bibliotecário recupera a senha pelo e-mail guardado na conta, como o aluno. Matrícula e e-mail são únicos: uma conta por cada um, e a API recusa cadastro repetido. Os tokens de e-mail (confirmação e recuperação) valem 20 minutos e são de uso único. |
| 26 | Auditoria de design | Decidido em 18/10, depois da auditoria de design. Escanear: um único leitor de QR, sem abas; o QR do pedido abre a ficha do aluno, de onde o bibliotecário registra a retirada e as devoluções, e sem pedido ele digita a matrícula. Multas: busca por nome ou matrícula e as abas Em aberto, Contando e Pagas, sem filtros avançados. Início: "Recomendados para você" entra como saída do Assistente (RF-ASS-03). Saem: filtros e atalhos da busca do acervo, sugestões do Assistente como aviso, "Desfazer" depois de sair da fila (fica só a confirmação), a aba Atrasados em Retiradas e o menu do bibliotecário no avatar (fica a tela de Perfil). Entram os estados de token expirado, cadastro repetido, sessão expirada, Meus passkeys sem passkey, ação do Assistente bloqueada e ISBN não encontrado nas fontes externas. |
| 27 | Um app e dois repositórios | Decidido em 18/10. O app é o mesmo nas duas entregas: passkey como login principal do aluno e "Outras formas de entrar" (matrícula e senha pelo Firebase Authentication, ou esqueci minha senha) sempre disponível; cadastro sempre com a etapa do passkey (com Agora não) e Meus passkeys no Perfil. Não há mais branch nem configuração por entrega. Código em dois repositórios, unifor-biblioteca-api e unifor-biblioteca-app, cada um só com a main; tarefas em branches curtas com PR; entregas marcadas pelas tags integration-delivery (29/10) e mobile-delivery (09/11). Android roda como build de desenvolvimento nas duas apresentações; o iPhone fica para depois que o Android funcionar. |
| 28 | API externa | Decidido em 23/10. A Google Books sai: deu erro 503 e 429 nos testes e a demonstração de 29/10 não pode depender dela. Entram a Open Library e a BrasilAPI, que não pedem chave (a Open Library pede só um User-Agent que identifique o app). A Open Library vem primeiro em título, autores, capa e assuntos; a BrasilAPI traz a sinopse e preenche o que faltar; cada uma tem tempo máximo de 5 segundos e as duas são consultadas ao mesmo tempo. Nenhuma fonte informa o idioma, então o idioma do livro não é mais trocado pela atualização. CDU, Cutter, estante e exemplares nunca são trocados. Ajuste do mesmo dia, depois da revisão: a atualização de um livro já cadastrado **só preenche campo vazio** (título, subtítulo, autores, editora, ano, sinopse, capa e assuntos nunca sobrescrevem um valor existente), porque a Open Library tem edições e títulos diferentes dos do acervo; o cadastro continua usando a consulta por ISBN para pré-preencher o formulário. |

## Riscos conhecidos

Regras aceitas por enquanto que podem dar problema no futuro.

- **Edições contam como o mesmo livro:** para não pegar dois exemplares do mesmo título, todas as edições de um livro valem como um só. Isso evita problemas hoje, porque o conteúdo das edições costuma ser o mesmo, mas pode bloquear um aluno que precise de duas edições com conteúdo diferente. Revisar se esse caso aparecer. No limite de 7 filas, ao contrário, cada edição conta separada (decidido em 17/10, para simplificar).
- **Passkeys com a senha como plano B:** a cadeira de Integração exige passkeys, e o fluxo depende de domínio HTTPS, build de desenvolvimento e celular físico. O login do dia a dia do aluno é o passkey, e a senha dele serve de alternativa. Se o passkey falhar tarde, o aluno ainda entra com matrícula e senha na demonstração de 29/10. Decidido em 16/10 pelo aluno: passkey como método principal, com senha como alternativa, atende o critério da cadeira, então não há pendência com o professor. Desde 17/10, a sessão é do Firebase Authentication: a parte própria da API é o passkey (desafio, assinatura e custom token). Se o professor exigir sessão emitida pela própria API, volta o token opaco.
- **Matrícula não verificada:** o cadastro confere só o formato do e-mail (final @edu.unifor.br) e da matrícula (7 dígitos), sem consultar a Unifor. O token prova que o aluno abre aquela caixa de e-mail, mas não que a matrícula digitada é dele: quem informar a matrícula de outro aluno passa a agir em nome dele. Aceito porque o projeto não tem acesso à base da Unifor. Se virar problema, a API pode exigir que a matrícula combine com a do e-mail ou usar uma lista de matrículas válidas.
- **Escopo inteiro em 14 dias:** o escopo completo, inclusive o Assistente que executa ações, o push e o deploy, precisa estar pronto em 29/10. Se o prazo apertar, qualquer corte precisa ser uma decisão explícita de escopo.
