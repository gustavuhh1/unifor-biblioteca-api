# Unifor Biblioteca — design e regras de negócio

Atualizado em 18/10/2026 (tarde). **Escopo fechado em 17/10/2026:** mudança só com decisão explícita do aluno. Em 18/10 o aluno aprovou os ajustes da auditoria de design (seção própria abaixo). A fonte das decisões de escopo é o documento "Unifor Biblioteca — Documento de Escopo" (https://claude.ai/code/artifact/f446d844-81c7-49e4-8d19-8e857d333f16). Este arquivo guarda o design e as regras de negócio que valem para a API e para o app.

- Design system (Claude): https://claude.ai/artifact/DUPU27rydrUScaeqTKyakU (namespace `UniforBib`, azul do símbolo #004AF5, Figtree + Newsreader, temas claro/escuro). Em 16/10 ganhou CodeInput, ListRow, Toggle, FolderCard, Stepper, FineRow e ícones novos. Em 18/10 foi sincronizado com o Figma: line-strong #7F879C, tokens on-danger, on-cover, qr-ink e qr-paper, meios-passos de espaço, os 29 estilos de texto, 10 ícones (heart, share, copy, mapPin, wifiOff, checkCircle, logIn, bookmarkFill, externalLink, userPlus), Toast, PromptSugerido e README com as regras de 18/10, seção Tema escuro e tabela de nomes Figma × código.
- Telas (Claude, canvas): https://claude.ai/artifact/JM6M43nJfcTZdfeV6uRckY — **75 telas** (as 21 originais, mais as novas de 16, 17 e 18/10): primeiro acesso, cadastro, confirmação do e-mail por token, passkeys, login (com "Outras formas de entrar"), recuperação de senha, Salvos, decisões de pedido e fila, renovação, multa, Assistente que pede confirmação, avisos, aparência, regras, e o bibliotecário com multas, pagamento, gestão do acervo e perfil. Em 18/10 entraram erro de login, sessão expirada, token expirado, cadastro repetido, Meus passkeys sem passkey e Assistente com ação bloqueada. **Tema escuro (18/10):** o canvas tem duas páginas, Tema claro e Tema escuro; cada tela clara tem uma versão escura (`<Tela>Escuro.dc.html`) que monta a mesma tela com `tema="dark"`, então qualquer mudança na tela clara aparece na escura sem retrabalho. Total: 150 artboards.
- Auditoria de design × escopo (Docs, 18/10): https://claude.ai/code/artifact/2eab8eae-18c4-4126-8d1d-e4e2c4923bb0
- **Figma (conta Unifor, assento Full): https://www.figma.com/design/Xg3hlqOp5v0XGT7P7ZooIp** — arquivo único com 5 páginas:
  - Capa
  - Fundamentos: coleção Cor com modos Claro/Escuro (32 cores, inclui on-danger, on-cover, qr-ink, qr-paper), Espaço (15, inclui meios-passos space-0-5/1-5/2-5/3-5 e, desde 18/10, os passos grandes space-12 = 48, space-14 = 56 e space-18 = 72). Em 18/10 todos os paddings e gaps das telas e dos componentes passaram a usar essas variáveis (cerca de 2.460 ligações); valores fora da escala foram arredondados: 3→4, 5→4 (legendas Contexto), 18→16, 28→24, 68→72. As páginas escuras foram refeitas a partir das claras depois disso, Raio (5), 29 estilos de texto (nenhum tamanho feito à mão), 3 sombras
  - Componentes: 54 ícones, Logo/Unifor, StatusBar, HomeIndicator, Toast, Toggle, PromptSugerido e componentes com variantes. FineCard tem o aviso "Pagamento só presencial" (propriedade Mostrar pagamento; oculto nas telas do bibliotecário). BottomNav do bibliotecário: Painel · Retiradas · Escanear · Filas · Multas. ChatBubble do aluno quebra linha com largura máxima de 280.
  - Telas — Aluno (80 telas: A01–A81, sem a A10, apagada em 18/10) e Telas — Bibliotecário (25 telas: B01–B26, sem a B02, apagada em 18/10)
  - Telas — Aluno (escuro) e Telas — Bibliotecário (escuro) (18/10): cópias das duas páginas com o modo Escuro da coleção Cor aplicado na página. Todas as cores das telas estão ligadas a variáveis (só a câmera da B03 tem cores fixas, de propósito), então o escuro sai certo sem ajuste. Ao mudar uma tela clara, mudar também a cópia escura (ou apagar a página escura e duplicar de novo).
- **Figma e canvas são mantidos em paralelo (decidido em 17/10).** Os dois ficam no mesmo estado: toda mudança de tela ou texto é feita nos dois, e nenhum é a referência única. Sincronizados em 17/10 e de novo em 18/10, texto a texto (o Figma foi a referência de texto e dados de exemplo). As decisões da auditoria de 18/10 foram aplicadas nos dois. O Figma tem 105 telas e o canvas 75 porque o Figma separa estados (por exemplo, Perfil com multa e Perfil sem multa); ao mudar uma regra, conferir os dois.
- Arquivo antigo na conta Gmail (Starter, incompleto): https://www.figma.com/design/fsZkneLd9bwP88l2QRAGAu — pode ser apagado.

## Fontes oficiais
- Guia da Biblioteca 2026.2 (PT, EN, ES) e página https://unifor.br/cesta-de-servicos/biblioteca (enviados pelo aluno em 15/10/2026). O app é só para alunos de graduação; vídeos, jogos, bolsas e guarda-volumes ficam fora.

## Decisões da auditoria (15/10/2026)
- Área segura: toda tela tem barra de status (47px) e indicador de gestos (34px).
- Estilos de texto para todos os tamanhos usados.
- Duas personas de aluno: **Lucas Almeida (2412858)**, em dia, no fluxo feliz; **Marina Castro (2513320)**, com Cálculo, Vol. 1 atrasado. Bibliotecária: **Ana Souza**. Cada tela tem uma etiqueta pequena de contexto acima dela. Datas de exemplo: ver Pendente.
- Organização por área, com legenda em cada linha:
  - Aluno: acesso · início · catálogo · salvos · solicitar e retirar · fila · empréstimos · atraso e multa · Assistente · perfil · estados gerais.
  - Bibliotecário: painel · balcão · filas · multas.
- Tema escuro: feito em 18/10 sem esperar os prints do Unifor Mobile (decisão do aluno). Mantidos os valores do modo Escuro que já existiam no Figma e no design system; todos os pares de texto passam de 4,5:1 e line-strong passa de 3:1 nos dois temas. Ficam iguais nos dois temas: capas geradas, QR (escuro sobre branco, para o leitor do balcão) e câmera do leitor.

## Revisão de acessibilidade e tokens (15/10/2026)
- Contraste (WCAG 2.1 AA) medido em todos os pares de texto/fundo das 73 telas do Figma, nos dois temas. Corrigido:
  - número do badge de notificação: branco sobre danger falhava no escuro (2,2:1) → token on-danger;
  - placeholders (busca, chat) em ink-faint (3,0:1) → ink-muted (6,3:1);
  - line-strong (contorno de campos, chave desligada) no claro: #8C94A8 → #7F879C (3,35:1 sobre surface).
- Áreas de toque: botão pequeno (36), chips (36) e chave (32) ganharam camada transparente "Área de toque 44px" (decisão: área invisível, visual igual).
- Foco: propriedade booleana "Foco" com anel de 2px (token focus, afastado 2px) em Botão, Chip, Chave, Campo de texto e Busca.
- Fonte ampliada: Toast e PromptSugerido crescem com o texto; Botão, Chip, DeadlineChip, StatusBadge e AutorChip usam altura mínima em vez de fixa.
- Tokens: cores soltas das capas, do QR e do badge ligadas a tokens novos (on-cover, qr-ink, qr-paper, on-danger); 290 espaços ligados a tokens, com meios-passos criados (decisão do aluno) e 7→8 / 11→12 arredondados. Exceções conhecidas: barra de status do sistema (28px) e a tela da câmera (B03, cores fixas de visor).
- Ainda sem medição de contraste: no Figma, A35–A38, A56–A81 e B19–B26; no canvas, nenhuma tela (usa os tokens do artifact, com o line-strong antigo).

## Decisões sobre as "promessas" do app (15/10/2026)
- Avisos e lembretes: tela de liga/desliga. "Sua vez na fila" e "Atraso e multa" ficam sempre ligados (rótulo "Sempre" com cadeado). Avisos chegam no celular e no e-mail institucional.
- Regras da biblioteca: página de leitura com seções curtas e botão para a página oficial.
- Busca sem resultado: sai "Sugerir aquisição"; fica "Perguntar ao Assistente" com um card de pergunta pronta (componente PromptSugerido). O Assistente busca no acervo e, se não achar, sugere livros parecidos.
- Favoritos viram **Salvos** (estilo Instagram): botão Salvar na página do livro salva em "Todos os salvos"; o aluno cria pastas com nomes próprios (ex.: "Ler depois", "Amei!!!"), com até 30 caracteres. Salvos fica no Perfil. O lápis da pasta abre menu com Renomear e Apagar (apagar não remove os livros de Todos os salvos).
- Página do livro: sai "Citar (ABNT)"; ficam Salvar e Compartilhar (menu nativo do celular). No canvas, que mostra só o topo, Compartilhar fica no menu ⋯.
- Primeiro acesso: abertura com logo e 3 telas curtas puláveis.
- Bibliotecário: barra com Painel · Retiradas · Escanear · Filas · Multas. A aba Multas fica na barra, com busca por nome ou matrícula e abas Em aberto · Contando (livro ainda não devolvido, sem pagamento) · Pagas (com quem recebeu). O ícone de perfil no Painel abre a tela Perfil (B25), com tema e Sair; o menu do avatar (B02) saiu em 18/10. A gestão do acervo (buscar, cadastrar, editar) abre por uma linha "Acervo" no Painel, a home do bibliotecário; a tela do acervo tem botão de voltar.
- Adicionar aluno à fila: o bibliotecário escolhe a posição. No fim, sem confirmação; à frente de outros, confirmação de ação perigosa listando quem desce, com motivo obrigatório.
- Limite de 7 filas (aprovado): na página de um livro emprestado, se o aluno já está em 7 filas, o botão fica desativado ("Limite de 7 filas atingido"), com aviso e atalho "Ver minhas filas".
- Fila em várias edições (aprovado): ao entrar na fila de um livro com mais de uma edição, o aluno marca uma ou mais edições (com quantas pessoas na frente em cada). A primeira edição que voltar fica com ele e as outras filas são canceladas sozinhas, com aviso (inclusive em Notificações). **Decidido em 17/10:** cada edição marcada conta como 1 das 7 filas, para simplificar; quando a primeira edição volta e as outras filas são canceladas, essas vagas são liberadas. (Para o empréstimo continua valendo que edições do mesmo livro são o mesmo título.)

## Decisões da auditoria de design (18/10/2026)
Aprovadas pelo aluno depois da auditoria design × escopo. Aplicadas no Figma e no canvas.

**Escopo**
- Busca do acervo: só a barra de busca (título, autor, assunto). Saem a tela de filtros (A10), os atalhos Todos/Disponíveis/Meu curso/Mais lidos e o ícone de filtro.
- Início: "Recomendados para você" fica e entra no RF-ASS-03 (são as sugestões do Assistente pelo histórico). Sai o "Ver todos".
- Avisos: sai "Sugestões do Assistente" (não entra no escopo).
- Escanear: um único leitor de QR, sem abas (Retirada, Devolução, Consulta). O QR do pedido abre a ficha do aluno (pedido pronto e livros com ele), de onde o bibliotecário entrega o pedido ou registra devoluções. Sem pedido, ele toca em "Digitar matrícula ou código" e cai na mesma ficha (tela Identificar aluno). A regra do QR não muda: é um código aleatório do pedido.
- Sair da fila: só a confirmação ("Sair da fila de …?"); sai o "Desfazer" do aviso depois.
- Multas (bibliotecário): busca por nome ou matrícula e as abas Em aberto, Contando e Pagas; sem ícone de filtros.
- Retiradas: sai a aba Atrasados. Depois (18/10, 17h) saíram também as abas Separar e Aguardando e o selo "Separado": a tela é uma lista única de pedidos, do prazo mais curto ao mais longo, com busca pela matrícula do aluno (para achar os pedidos de um aluno no balcão).
- Perfil do bibliotecário: fica só a tela (B25); o menu do avatar (B02) foi apagado.
- Assistente entrando em fila: usa o mesmo cartão de confirmação da solicitação (A72), sem tela própria.

**Telas novas (Figma e canvas)**
- A06 / LoginErro: erro de login com matrícula e senha (Firebase), igual nas duas entregas: "Matrícula ou senha incorretos." e o caminho Esqueci minha senha. Saiu o texto antigo do Unifor Online.
- A77 / TokenExpirado: token vencido (20 min) ou já usado, com "Reenviar token".
- A78 / CadastroDuplicado: matrícula ou e-mail que já têm conta, erro em cada campo.
- A79 / SessaoExpirada: login com o aviso "Sua sessão expirou" (401).
- A80 / MeusPasskeysSemPasskey: aparelho sem passkey, com "Criar passkey neste aparelho" ativo.
- A81 / AssistenteBloqueado: Marina pede um livro e o Assistente explica que o atraso bloqueia, sem botão de confirmar.
- B21 / LivroNovo: ISBN não encontrado no Google Books, com texto vermelho pedindo para preencher à mão.
- Remover livro com empréstimo ou fila não ganhou tela: a B26 (marcar "Indisponível para novos pedidos") já cobre.

**Textos e dados corrigidos**
- "Feriado acadêmico adia 1 dia" → "fim de semana, feriado e recesso não contam" (em todas as páginas de livro e na confirmação de pedido). "O pedido é cancelado" → "o pedido expira".
- "Você usa a senha para recuperar o acesso" → "Você usa a senha para entrar no app" (cadastro e nova senha).
- "Retirada confirmada" → "Pedido confirmado" (tela do QR).
- Meus passkeys: o segundo aparelho é um Galaxy A54 (passkey só no Android).
- Notificações: sai "Estruturas de Dados vence em 8 dias" (o lembrete sai 2 dias antes e no dia); "Engenharia de Software vence em 2 dias" (enviado ontem); a vez perdida é de Sistemas de Banco de Dados (Lucas está com Redes de Computadores).
- Assistente: "Lido por colegas do seu curso" → "Pelo que você leu".
- Detalhe da multa: "fim de semana, feriado e recesso não contam".
- Nome do lugar: "Biblioteca (Praça Central)"; "no balcão da biblioteca".
- Grafia: "Código Limpo" em todas as telas.
- Código Limpo: CDU 005.1, Cutter M386c, Estante 005.1 (igual no aluno e no bibliotecário).
- Refatoração: ISBN 9788575227244, CDU 005.1, Cutter F787r, registros 51734–51736.
- Algoritmos (A36): dados próprios (4 exemplares em 2 edições, ISBN 9788535236996, Elsevier 2012 e GEN LTC 2024, CDU 005.1 C811a, registros 60411, 60412, 71880, 71881, do mesmo autor: Desmistificando Algoritmos).
- Matrículas únicas: Beatriz Nogueira 2311052 e Rafael Teixeira 2210478 (antes repetiam as de Ana Beatriz Lima e Carlos Eduardo Sá). Marina na fila de Arquitetura Limpa: 2513320, desde 09/10.
- O pedido de Beatriz (RET-4817) é de Padrões de Projeto (antes Refatoração, que deixaria só 1 exemplar na estante).
- Arquitetura Limpa: 4 na fila no Acervo (gestão), igual à tela da fila.
- O exemplo de remover livro passou a ser O Codificador Limpo (2 exemplares na estante, sem empréstimo nem fila).
- Ficha da Marina no balcão: sem pedido para retirar (em atraso ela não pode ter pedido válido); 3 de 10 livros; o Perfil da Marina com atraso também mostra 3/10. Lucas com o pedido confirmado: 4 de 10 (pedido conta nos 10).
- Livro emprestado (Código Limpo): 1 pessoa na frente em todas as telas.
- Senha e confirmação iguais no cadastro do fluxo feliz.

**Variantes por perfil (para os devs; sem tela própria)**
- Desde 18/10 não há variante por entrega: o app é o mesmo nas duas apresentações (ver Acesso, cadastro e perfis).
- Bibliotecário: recupera a senha nas mesmas telas, sem a frase "trocou de celular?" e sem "Criar passkey".
- iPhone (a definir depois que o Android funcionar): sem push, Avisos e lembretes ficaria sem "Notificação no celular".
- 403: a interface do aluno não mostra ações do bibliotecário, então o 403 não aparece no app; ele é mostrado na demonstração da API.
- Pedido expirado: notificação "Seu pedido de <livro> expirou. Não foi retirado em 2 dias úteis e voltou para a estante."
- Identificar aluno: tocar num livro em "Com o aluno" abre Registrar devolução.

**Design system: o que levar do Figma ao artifact antes do código** (feito em 18/10, à tarde: tudo abaixo foi levado ao artifact, menos os espaços soltos do Figma; os nomes que diferem estão numa tabela no README do design system)
- line-strong claro #7F879C (o artifact ainda tem #8C94A8); tokens on-danger, on-cover, qr-ink, qr-paper; meios-passos de espaço; os 29 estilos de texto; Toast e PromptSugerido; ícones heart, share, copy, map-pin, wifi-off, check-circle, log-in, bookmark-fill, external-link, user-plus.
- Nomes de variantes que diferem: StatusBadge (disponivel ↔ Disponível, aguardando ↔ Confirme, retirar ↔ Pronto para retirar, ativo ↔ Em andamento, vence ↔ Vence em breve, fila ↔ Na fila); Button (sm/md/lg ↔ Small/Medium, sem Large no Figma; Disabled é variante no Figma e propriedade no artifact); Alert (info/success/warning/danger ↔ Info/Sucesso/Aviso/Perigo); DeadlineChip (kind ↔ Tom em inglês); BookCover (sm/md/lg ↔ P/M/G).
- StatusBadge `devolvido` era usado como "Separado" na tela Retiradas; o selo saiu da tela em 18/10, então não precisa de variante nova.
- No artifact faltam no Figma CodeInput, ListRow, FolderCard, Stepper e FineRow (no Figma essas partes são frames soltos).
- README do design system desatualizado (corrigido em 18/10): login "só com passkey", senha "serve à recuperação", remoção de livro sem citar fila e "Indisponível para novos pedidos", "pular alunos" na fila.
- Espaços no Figma: só 86 de 1.429 paddings e gaps das telas do aluno estão ligados a variáveis; valores fora da escala: 18, 28, 56 e 68.

## Acesso, cadastro e perfis (decidido em 16/10/2026; app único desde 18/10)
- **Um app só para as duas entregas (decidido em 18/10/2026).** Não há diferença entre a apresentação de Integração e a de Mobile: o passkey é sempre o login principal do aluno, "Outras formas de entrar" (matrícula e senha pelo Firebase Authentication, ou Esqueci minha senha) está sempre disponível, o cadastro sempre tem a etapa do passkey (com Agora não) e Meus passkeys sempre aparece no Perfil. A Integração vê o passkey; a Mobile vê o Firebase Authentication, nos dois caminhos (o passkey também termina numa sessão do Firebase). Não há branch nem configuração por entrega. No Android o app roda como build de desenvolvimento nas duas apresentações. O iPhone fica para depois que o Android funcionar.
- **Cadastro é só de aluno.** Formulário: e-mail institucional, matrícula (7 dígitos), senha e confirmação da senha. A única validação do e-mail é uma expressão regular que exige o final `@edu.unifor.br` (por exemplo `/^[^\s@]+@edu\.unifor\.br$/i`); a API não consulta a base da Unifor. Depois o aluno recebe um token no e-mail e o digita no app.
- **Bibliotecário não tem cadastro.** As contas já existem no banco (dados pré-cadastrados) e o app só oferece login, com matrícula e senha, sem passkey.
- **Aluno:** depois de confirmar o e-mail, o app mostra a tela **"Entre com sua digital"** (decidido em 18/10), que recomenda o passkey: ilustração (celular com digital e escudo), três vantagens (entrar em um toque; mais seguro que senha, porque a chave fica só no celular e não vaza nem funciona em site falso; a biometria nunca sai do celular), a nota "Se trocar de celular, você entra com a senha e cria outro", o botão Criar passkey (abre a biometria na hora e leva à tela de sucesso) e o link Agora não (entra no app; o passkey pode ser criado depois em Meus passkeys). Só no Android. Depois disso, o login do dia a dia é o passkey, com a senha como alternativa. A tela de login é uma só: o passkey vem primeiro (matrícula e botão Entrar com ícone de digital) e o campo de senha fica atrás do link "Outras formas de entrar", que abre uma folha com "Entrar com matrícula e senha" e "Esqueci minha senha" (token por e-mail e nova senha); se a biometria falhar, a folha de erro oferece as mesmas saídas. Existe também um atalho pequeno que troca o formulário entre "Acessar como bibliotecário" e "Acessar como aluno" (assim o visual do app não muda por causa das cadeiras).
- Recuperação de senha: token no e-mail cadastrado, nova senha. Depois de recuperar, o aluno entra com a nova senha e pode criar um passkey neste aparelho (botão "Agora não, entrar com a senha"). Quem entra com a senha pode criar o passkey depois em Meus passkeys.
- O perfil (aluno ou bibliotecário) vem do login.
- Meus passkeys (Perfil do aluno): lista os aparelhos, cria um passkey no aparelho atual e permite remover. Criar serve para quem pulou a etapa no cadastro, trocou de celular ou usa mais de um aparelho (decidido em 18/10). Só quem está logado cria, e só para a própria conta; se o aparelho já tem passkey da conta, o celular avisa e não cria outro.
- **Decidido em 17/10/2026:** o bibliotecário recupera a senha pelo e-mail guardado na conta, do mesmo jeito que o aluno (token no e-mail e nova senha). Matrícula e e-mail são únicos: uma conta por matrícula e uma por e-mail, e a API recusa cadastro repetido. O token de e-mail (confirmação e recuperação) vale 20 minutos e é de uso único.
- **Sessão e senha pelo Firebase Authentication (decidido em 17/10/2026; grande mudança de regra).** Desde 18/10 também não há diferença de passkey entre as entregas.
  - Senha: fica só no Firebase Authentication. A API não guarda senha, nem em hash. O login com matrícula e senha é feito pelo app, com o SDK JavaScript do Firebase (roda no Expo Go); não é rota da API.
  - Sessão: o ID token do Firebase (vale 1 hora), guardado e renovado pelo SDK. O app o manda em toda chamada no cabeçalho `Authorization: Bearer`, e a API o confere com o Firebase Admin (`verifyIdToken`, inclusive a revogação) e acha o usuário e o perfil pelo `uid`. Não há token opaco nem JWT próprio. Sessão expirada leva ao login com aviso (A79).
  - Passkey: a API manda o desafio, confere a assinatura e devolve um custom token do Firebase (`createCustomToken`); o app o troca pela sessão (`signInWithCustomToken`). Para isso, a conta de serviço da API precisa do papel Service Account Token Creator.
  - "Outras formas de entrar": matrícula e senha pelo Firebase ou "Esqueci minha senha" (token por e-mail e nova senha, gravada pela API com o Firebase Admin).
  - Cadastro: a API cria a conta no Firebase desativada, com o e-mail interno e a senha, e a ativa quando o token do e-mail é confirmado.
  - Logout: o app chama `signOut()` e a API revoga os refresh tokens do usuário.
  - Risco aceito: o professor da Integração pode ler a sessão como a técnica da cadeira de Mobile. A parte própria da API é o passkey (desafio, assinatura e custom token). Se ele exigir sessão emitida pela API, volta o token opaco.
- **Matrícula no Firebase Authentication (decidido em 17/10/2026):** a conta no Firebase usa um e-mail interno montado da matrícula (ex.: `2412858@contas.uni-books.app`, que nunca recebe mensagens), para aluno e bibliotecário. O e-mail real fica no Firestore e é para onde o Resend manda os tokens. Nenhuma rota revela o e-mail de alguém pela matrícula.
- **iPhone (decidido em 17/10/2026; revisto em 18/10):** passkey e push só no Android, porque no iPhone os dois dependem da conta paga da Apple (US$ 99/ano), que o projeto não vai pagar. O arquivo `apple-app-site-association` não é criado. Como o app vai rodar no iPhone será decidido depois que o Android estiver funcionando (decisão do aluno em 18/10).

## Regras de negócio
- Login por matrícula de 7 dígitos (2 primeiros = ano de ingresso); perfil (aluno ou bibliotecário) definido no login.
- Aluno de graduação: até 10 livros simultâneos, 14 dias por empréstimo (Guia 2026.2). Um livro solicitado e ainda não retirado conta nos 10.
- Não pode pegar dois exemplares do mesmo título nem outra edição dele.
- Livro disponível sem fila: 2 dias úteis para retirar.
- Fila (reserva): só abre quando todos os exemplares da edição estão emprestados; até 7 livros em fila ao mesmo tempo, separado do limite de 10 empréstimos (página oficial). Pode esperar por várias edições do mesmo livro; a primeira devolvida é atribuída e cancela as outras reservas (página oficial). O aluno vê quantas pessoas estão na frente antes de entrar.
- Livro devolvido: 1º da fila tem 24h (horas corridas) para confirmar e, depois, 2 dias úteis para retirar. Se perder um prazo, sai da fila e o próximo é avisado.
- Cancelamento: o aluno cancela uma solicitação antes de retirar e sai de uma fila a qualquer momento (com confirmação, sem "desfazer"). O exemplar volta a ficar disponível ou segue para o próximo da fila.
- Dias úteis excluem fins de semana, feriados (nacionais, do Ceará e de Fortaleza, pela FeriadosAPI) e dias de recesso do calendário acadêmico; prazo que cai em feriado passa para o próximo dia útil. Prazos em dias úteis vencem no horário de fechamento da biblioteca no último dia (21h55 e, no sábado, 14h10).
- **Renovação: uma única por empréstimo**, de +14 dias, dentro do prazo. Não renova se o empréstimo está em atraso, se há pessoas na fila do livro ou se a renovação já foi usada. Pelo app, Unifor Online ou balcão. Quando bloqueada, o app diz o motivo.
- Multa: R$ 2,00 por dia útil de atraso, por livro (valor adotado pelo projeto; a Unifor não divulga o valor). Sem teto.
- Atraso bloqueia novos empréstimos (solicitar, entrar em fila, retirar) até a devolução.
- **Multa congelada:** na devolução a multa para de contar e fica em aberto até o bibliotecário registrar o pagamento. Com multa em aberto e sem atraso o aluno pode pegar livros (só aparece o aviso).
- **Pagamento só presencial, no balcão; o app não recebe pagamentos.** Só o bibliotecário confirma o pagamento (ação humana, sem integração de pagamento): na devolução (chave "Multa paga agora") ou depois, na aba Multas.
- Perda ou dano: o aluno responsável deve repor a obra e ainda paga a multa do atraso, se houver. **Fora do escopo do app (decidido em 17/10):** o sistema não controla perda, dano nem reposição; só informa a regra, em texto, na tela Regras da biblioteca.
- Estados: exemplar (disponível, emprestado, reservado); empréstimo (aguardando retirada, ativo, devolvido, expirado, cancelado). "Atrasado" é calculado pela data de vencimento, não é um estado salvo.
- Retirada: QR no app do aluno (funciona sem internet), com um código aleatório do pedido. O bibliotecário escaneia num leitor único, sem abas, e o QR abre a ficha do aluno, de onde ele entrega o pedido e registra devoluções; sem QR, digita a matrícula ou o código do pedido e cai na mesma ficha (decidido em 18/10).
- Fila automática, com ações manuais do bibliotecário (mudar posição, reenviar aviso, remover com motivo, adicionar aluno em qualquer posição com motivo).
- Acervo (bibliotecário): cria, edita e remove livros e atualiza um livro pelo Google Books (ISBN). Se o Google Books não acha o ISBN, o app avisa em vermelho e o bibliotecário preenche à mão. Só remove livro sem exemplar emprestado e sem fila; o histórico de empréstimos é mantido (o livro sai da busca e não pode mais ser pedido, mas os empréstimos antigos continuam no Histórico do aluno).
- **Indisponível para novos pedidos (decidido em 17/10/2026):** o bibliotecário marca (e desmarca) o livro ao editá-lo. Com a marca, ninguém solicita o livro nem entra na fila dele, mas o livro continua no catálogo, visível para os alunos, com o aviso "Indisponível para novos pedidos" e os botões Solicitar empréstimo e Entrar na fila desativados. É a saída quando o livro precisa sair do acervo e ainda tem exemplar emprestado ou fila. Pedidos, empréstimos e filas que já existem não mudam (o 1º da fila continua sendo avisado quando o livro voltar) — confirmado em 17/10.
- Assistente (IA) só para o aluno: ajuda de uso, busca com sugestão de parecidos e sugestões pelo histórico, que aparecem também no Início ("Recomendados para você"). Também solicita empréstimo e entra em fila em nome do aluno, mostrando antes o que vai fazer e esperando a confirmação; as ações seguem as mesmas regras e permissões do aluno, e quando uma regra bloqueia (atraso, limite) ele explica o motivo sem oferecer confirmação. Mostra aviso de que pode errar.
- Atendimento: Biblioteca (Praça Central), seg a sex 7h às 21h55, sáb 8h às 14h10, BiblioZap (85) 3477-3257, Empréstimo (85) 3477-3162, bibemprestimo@unifor.br.

## Stack e infraestrutura (decidido em 16/10/2026)
- App: React Native com Expo, Android e iOS, num único app para os dois perfis. API: Node, concentra regras, autenticação, permissões, Assistente e integração externa. O app só fala com a API.
- Banco: Firebase Firestore. Produção no Firebase; testes no Firebase Emulator Suite.
- Assistente: Gemini API, como módulo da própria API principal (não é serviço separado).
- API externa: Google Books (2 requisições: busca por ISBN e consulta pelo id do volume), combinada com os dados locais. O Google Books não traz CDU, Cutter, estante nem exemplares: esses dados são do projeto.
- Feriados: FeriadosAPI, com cache no banco. Busca no acervo: em memória na API.
- E-mail: Resend com domínio próprio. Push: Expo, só no Android (decidido em 17/10). Lembretes: Cloud Scheduler chamando a API. Deploy: Google Cloud Run.
- **Metas de desempenho (decidido em 17/10/2026):** busca em até 1 s e demais telas em até 2 s, com a API acordada. A primeira chamada depois de a API ficar parada (Cloud Run com zero instâncias, para gasto zero) fica de fora; a API é acordada antes da demonstração.
- **Domínio (decidido em 17/10/2026):** principal `uni-books.app`, registrado na Name.com pelo GitHub Student Developer Pack (grátis no 1º ano; a renovação é paga, então a renovação automática fica desligada até decidir se mantém). O `uni-books.me` não será registrado agora; só se o .app der problema.
  - A API responde em `api.uni-books.app` pelo Firebase Hosting na frente do Cloud Run, porque o mapeamento de domínio do próprio Cloud Run está em prévia e não existe na região de São Paulo. O Hosting corta requisições em 60 s, e a API autentica pelo cabeçalho Authorization, sem cookies.
  - O RP ID do passkey é o domínio raiz `uni-books.app`, com `/.well-known/assetlinks.json` (pacote Android e impressões SHA-256 das chaves de assinatura) servido pelo Hosting nesse domínio. Trocar o RP ID depois invalida os passkeys já criados.
  - Os e-mails do Resend saem de um subdomínio (ex.: `email.uni-books.app`), com SPF e DKIM no DNS da Name.com.
  - O endereço `*.run.app` não é usado como RP ID (muda se o serviço, o projeto ou a região mudarem); serve só para teste interno.
  - **Região (decidido em 17/10/2026):** `southamerica-east1` (São Paulo) para o Firestore e o Cloud Run. O banco `(default)` já foi criado nessa região, e o local do Firestore não pode ser trocado.
- **Projeto do Google Cloud e do Firebase (decidido em 17/10/2026):** ID `estoque-pay` (nome de exibição "Unifor-biblioteca"), na conta Google do aluno que tem os créditos grátis. O ID não muda, por isso aparece em endereços internos (ex.: `estoque-pay.web.app`); o app e o passkey usam só `uni-books.app`. Tudo fica nesse projeto: faturamento, Firestore, APIs, alerta de gasto, teto do Cloud Run e Hosting com o domínio. O projeto `unifor-biblioteca`, criado por engano na outra conta Google, será apagado. Contas, chaves e status de cada serviço: ver `infra-contas-e-chaves.md`.
- **Controle de gasto (meta: gasto zero):** alerta "alerta-zero" de R$ 1 por mês (50% e 100% do gasto real, 100% do previsto, com o nível grátis descontado) e teto de R$ 10 por mês no Cloud Run, que pausa o serviço. O teto conta o custo bruto, antes do nível grátis. O Gemini também aceita teto (criar junto com a chave). Firestore e Hosting não têm teto e ficam cobertos pelo alerta e pelas cotas grátis. No Artifact Registry (0,5 GiB grátis), o repositório guarda só as 2 imagens mais recentes.
- **Repositórios (decidido em 18/10/2026):** dois, [unifor-biblioteca-api](https://github.com/gustavuhh1/unifor-biblioteca-api) e [unifor-biblioteca-app](https://github.com/gustavuhh1/unifor-biblioteca-app), cada um só com a branch `main`. Cada tarefa vira uma branch curta com PR para a `main`. As entregas são marcadas por tag: `integration-delivery` (29/10, nos dois) e `mobile-delivery` (09/11). Não há mais as branches `integration` e `mobile`. Commits em português, README em inglês.

## Dados do acervo
- Não há acesso a dados reais da biblioteca. Livros, datas e históricos nas telas são exemplos, inclusive ISBN, Cutter e nomes de aparelhos.
- Os dados de capa, sinopse, ISBN, autores e editora vêm da Google Books API; CDU, Cutter, estante e exemplares são dados de exemplo do projeto.

## Página do livro (espelha o catálogo web da Biblioteca Unifor; sem avaliação de usuários)
- Capa, status, exemplares na estante e reservas; título, subtítulo, material/edição/editora/ano; Salvar e Compartilhar.
- Autoria, Assuntos, Fila (se emprestado), Sinopse, Disponibilidade, Onde encontrar (localização + CDU e Cutter).
- Registro completo (Material, Idioma, ISBN, CDU e Cutter, Edição, Publicação, Série quando houver), Exemplares, Do mesmo autor. Botão fixo: Solicitar empréstimo ou Entrar na fila.

## Pendente
- README da API e do app: só quando a definição do projeto estiver 100% (decisão do aluno em 18/10).
- **Datas de exemplo (decidido em 16/10):** vale a linha do tempo do Figma. Hoje é quinta 15/10/2026. Marina Castro retirou Cálculo, Vol. 1 no sábado 26/09, o livro venceu no sábado 10/10 e ela deve R$ 6,00 (3 dias úteis: 13, 14 e 15/10; 12/10 é feriado). O balcão abre aos sábados, então as duas datas são válidas. Lucas Almeida está em dia: Engenharia de Software vence amanhã (retirado 02/10, devolver até 16/10), Redes de Computadores vence 20/10 (5 dias restantes) e Estruturas de Dados vence 23/10 (8 dias restantes). Pedido feito hoje: retirar até seg 19/10.
- Datas do Figma e do canvas conferidas em 18/10: todas seguem a linha do tempo acima (Código Limpo tem 3 exemplares e 1 pessoa na fila).
- **Navegação do bibliotecário decidida em 16/10:** Multas na barra e Acervo pelo Painel, já nos dois (a tela de editar livro tem a lixeira "Remover livro" no topo).
- **Login do aluno (decidido em 16/10; vale para as duas entregas desde 18/10):** passkey como método principal e senha como alternativa, para manter a mesma interface nas duas entregas. O aluno confirmou que atende o critério de autenticação da cadeira; sem pendência com o professor.
- **E-mail para @edu.unifor.br:** mandar um e-mail de teste do Resend para o e-mail institucional do aluno e conferir se chega na caixa de entrada. Se a Unifor filtrar, o cadastro ao vivo não funciona.
- Dados e capas: BookCover com imagem real (Google Books) e capa gerada como reserva; corrigir quebra de palavras longas no título da capa M.
- Decisões de escopo: fechadas em 17/10 e ajustadas em 18/10 pela auditoria de design (seção própria). Nenhuma em aberto.
- Para a entrega aos devs: nomes acessíveis dos botões só com ícone (voltar, lápis, +, enviar, mais, sino), texto alternativo das capas ("Título, de Autor") e teste real com leitor de tela (VoiceOver/TalkBack).
- Final: separar style guide e telas em dois arquivos (publicar biblioteca); protótipo clicável; apagar o arquivo antigo da conta Gmail (aluno).
