# Folha do Paiquerê — v181
## Relatório técnico de arquitetura, funcionalidades, permissões, PWA e capacidade estimada

**Data:** 24 de outubro de 2026  
**Base:** pacote v180 recebido e verificado  
**Versão resultante:** v181  
**Projeto Firebase:** `folha-do-paiquere` — plano Spark, conforme informação do proprietário  
**Estado do Firebase remoto:** não alterado  
**Estado de publicação:** nenhum deploy realizado

> **Limites deste relatório.** Este documento descreve o que foi encontrado nos arquivos entregues e nas regras locais do Firestore. Não comprova o estado atual do projeto remoto, os dados reais armazenados, as configurações atuais do Console Cloudinary/Firebase, nem um teste integrado em navegador/dispositivo. Onde a informação não pode ser confirmada pelo pacote, isso é declarado expressamente.

---

## 1. Resumo executivo da v181

A v181 preserva a estrutura do site e faz alterações deliberadamente contidas:

1. Faz os botões de instalação PWA funcionarem também quando o botão público é criado dinamicamente depois do carregamento inicial, por delegação de eventos.
2. Não remove automaticamente o cartão de instalação ou o botão com base em uma chave antiga do `localStorage`.
3. Usa o prompt nativo quando o navegador emite `beforeinstallprompt`. Quando não existe prompt programático disponível, apresenta orientações específicas para iOS, Android ou desktop. A plataforma continua exigindo confirmação da pessoa; o site não pode criar um atalho silenciosamente em todos os dispositivos.
4. Remove os arquivos antigos `assets/branding/pwa-icon-192.png` e `assets/branding/pwa-icon-512.png`; gera versões quadradas a partir do brasão oficial: `brasao-folha-paiquere-192.png` e `brasao-folha-paiquere-512.png`. O arquivo original `brasao-folha-paiquere.png` é preservado.
5. Atualiza o manifesto, as referências de ícones Apple e a versão/cache do service worker para as novas imagens.
6. Acrescenta `fp-v181-interface-polish.css`, de propósito restrito: foco de teclado mais claro e estilo para o diálogo/status de instalação. Não reestrutura grades, cartões, margens ou tipografia existente.
7. Inclui este relatório e `firestore.rules-v181.txt`, uma cópia integral idêntica a `firestore.rules`.

### O que não foi feito

- Não houve deploy, migração de banco, alteração de regra do Firestore nem alteração de configuração remota.
- Não foi possível confirmar o comportamento final por teste visual integrado num navegador real no ambiente de trabalho. Os testes locais descritos na entrega são estáticos/estruturais.
- A v181 não promete instalar o aplicativo sem ação da pessoa: navegadores e sistemas operacionais controlam a confirmação de instalação.
- O serviço worker fornece cache/fallback básico, não uma versão offline completa de todas as matérias e módulos autenticados.

---

## 2. Mapa das páginas HTML

### 2.1 Site público

| Página | Função observada no pacote |
|---|---|
| `index.html` | Home; carrossel/destaque, avisos escolares, últimas notícias, atalhos para participar e entrar na Área do Estudante, seções públicas e rodapé. A maior parte dos conteúdos editoriais é montada por `app.js`. |
| `noticias.html` | Feed público de matérias, pesquisa, categorias, ordenação e contagem de resultados. Os cartões são montados por JavaScript. |
| `noticia-single.html` | Leitura de uma matéria; ações de curtir, comentários, leitura em voz, imprimir/salvar em PDF, compartilhar, enquetes e matérias relacionadas, conforme os dados da matéria. |
| `participar.html` | Formulário público para enviar pautas/sugestões à redação. Acesso e campos de envio são condicionados à lógica da página e às regras atuais. |
| `conquistas.html` | Mural público de conquistas, pesquisa, ordenação, filtro de ano dinâmico e visualização de detalhes/créditos. |
| `sobre.html` | Apresentação institucional e diretório da comunidade escolar, com pesquisa/classificação e links para perfis públicos. |
| `perfil.html` | Perfil público por identificador; avatar, nome, ano/cargo, biografia, histórico, redes, contribuições, atividades, conquistas e personalização visual conforme os dados salvos. |

### 2.2 Entrada e área autenticada

| Página | Função observada no pacote |
|---|---|
| `login.html` | Entrada por e-mail e senha, apresentação de erros e redirecionamento limitado à Área do Estudante ou ao editor (`painel.html`/`editor.html`). |
| `painel.html` | Painel autenticado. Inclui Meu Perfil, Minhas Matérias, Mesa do Editor e Ler Pautas conforme o cargo, além de módulos de avisos, conquistas, equipe/acessos e seção Sobre, com abas/ações condicionadas ao papel. |
| `editor.html` | Editor visual sensível, baseado em Fabric.js. Trabalha canvas/camadas, blocos de conteúdo, metadados, categorias, créditos e prévias. Não foi reestruturado na v181. |

### 2.3 Ferramentas auxiliares que vêm dentro do pacote

| Arquivo | Atenção |
|---|---|
| `firebase-bootstrap.html` | Ferramenta de inicialização/sincronização de perfil editorial; o próprio arquivo documenta uso auxiliar. |
| `cloudinary-diagnostico.html` | Teste/diagnóstico de upload; não é página normal para a comunidade. |
| `reset-demo.html` | Ferramenta de protótipo/reset local; não é página editorial normal. |
| `seed.html` | Executa preparação de dados de demonstração e chama `localStorage.clear()` no navegador que abrir a página. Não deve ficar acessível a visitantes na publicação final. |

**Risco de publicação que não foi alterado nesta versão:** `firebase.json` declara `hosting.public: "."`, com uma lista de exclusões que não nomeia essas páginas auxiliares. Se o deploy usar exatamente essa configuração, páginas auxiliares podem ser publicadas em URLs diretas. Recomenda-se revisar a lista `hosting.ignore`/a organização do diretório numa tarefa de publicação e segurança. As páginas foram preservadas no pacote para não retirar ferramentas sem autorização.

---

## 3. Módulos JavaScript e arquivos de infraestrutura

| Arquivo | Responsabilidade principal observada |
|---|---|
| `app.js` | Lógica pública: renderiza Home/feed/matéria, pesquisa e ordenação, reações/curtidas, contagem de visualizações, comentários, leitura em voz, pautas, conquistas e diretório da comunidade. Parte dos HTML dos cartões é gerada em strings JavaScript; alterações visuais nesses cartões às vezes exigem editar o renderizador, não somente HTML/CSS. |
| `portal.js` | Sessão e login legado/cache, identidade/cargo, perfil autenticado, matérias do estudante, Mesa do Editor, pautas, usuários/acessos, autorização de perfil e gestão de avisos/conquistas. |
| `editor.js` | Comportamento do editor visual, criação/edição de blocos, canvas, prévias, estado de matéria, validações e ações do fluxo editorial. |
| `firebase-client.js` | Camada `FPCloud`: Firebase Auth/Firestore, sincronização de documentos e integração de upload para Cloudinary. |
| `storage.js` | Persistência/cache do navegador e IndexedDB, normalização e sincronização de dados usados pela UI. |
| `notifications.js` | Permissão e notificações do navegador para novas matérias, conquistas e avisos enquanto há suporte e os listeners conseguem receber mudanças. |
| `pwa.js` | Botão de instalação, prompt nativo quando disponível, instruções alternativas e registro do service worker. Na v181, botões criados dinamicamente também respondem por delegação de eventos. |
| `fp-v166-public-mobile.js` | Adiciona o shell compacto público: menu de configurações, atalhos inferiores, nome anônimo, proxies de tema/fonte/notificações e o item “Baixar site” que é criado dinamicamente. |
| `fp-v168-auth-loading.js` | Loader da entrada/Área do Estudante. |
| `folha-notifications-sw.js` | Service worker; cache/fallback básico, recebe eventos `push` se algum emissor/inscrição válidos forem configurados, e trata clique em notificações recebidas. |
| `cloudinary-config.js` | Nome público da nuvem, preset de upload e limites de tamanho verificados pelo cliente. Não contém o segredo privado da API no arquivo mostrado. |
| `firebase-config.js` | Configuração cliente do projeto Firebase. A configuração cliente não substitui regras de segurança: a autorização depende das regras remotas do Firestore. |
| `manifest.webmanifest` | Nome, ícones, URL inicial, escopo e modo de exibição PWA. |
| `firebase.json` | Configura Hosting, regras/índices Firestore, Storage rules e referência para o diretório `functions`. |
| `functions/index.js` | Fonte de uma callable function `deleteEditorialAccess`, que valida o solicitante no servidor e remove autenticação/documentos pessoais de uma conta. A existência do código não comprova que a função esteja implantada; o deploy de Cloud Functions depende do plano/configuração de cobrança apropriados. |

### 3.1 Arquitetura de estilos

Há muitas folhas CSS históricas com versões v98, v126 e v130–v181, além de estilos internos nos HTMLs. Essa pilha foi acumulada para permitir polimentos incrementais. Consequência: não é seguro “limpar” ou consolidar folhas sem confirmar a precedência e os seletores usados em cada página. A folha v181 é adicional e escopada a foco de teclado e componentes de instalação/status.

### 3.2 Caminho de uma matéria

Em alto nível: editor → campos/blocos/canvas em `editor.js` → salvamento e normalização em `firebase-client.js`/`storage.js` → Firestore guarda documento/metadados/URLs de mídia → `app.js` lê cache e/ou documentos e monta feed, Home e página individual. Reação, comentário, visualização, compartilhamento, impressão/PDF e leitura em voz são ações separadas; não devem ser removidas ao ajustar um cartão.

### 3.3 Caminho de imagens

O código do cliente prepara mídias em formato de imagem e envia ao Cloudinary; a camada de matéria converte imagens locais/embutidas para URLs e rejeita salvamento quando ainda detecta mídia incorporada local, conforme o fluxo atual. Os documentos do Firestore devem guardar URLs e metadados, não o arquivo binário quando o caminho Cloudinary é concluído. Arquivos históricos ou outros formulários podem ter caminhos específicos, por isso não se deve presumir que todo registro antigo já foi migrado.

---

## 4. Papéis de usuário e acesso

Os nomes abaixo descrevem os papéis internos encontrados no código e nas regras, não apenas o rótulo visual.

### 4.1 Visitante sem login

Pode acessar páginas públicas, matérias publicadas, conquistas, diretório/perfis públicos e avisos escolares. Também pode interagir com alguns recursos públicos de acordo com as regras atuais, como criar comentários, reações, votos de enquete e enviar pautas/sugestões em caminhos específicos. Isso traz um risco de abuso/moderação descrito na seção 7.

Não deve acessar funções reservadas do painel só por conhecer a URL; a sessão e os controles de permissão continuam necessários. Ocultar uma aba via CSS/JavaScript não é segurança de servidor.

### 4.2 Estudante (`role: Estudante`)

Na interface, o estudante autenticado pode acessar seu Meu Perfil e Minhas Matérias, preparar/salvar rascunhos, enviar matérias para análise e consultar estados editoriais das próprias matérias. Pode usar os recursos de perfil permitidos depois que o fluxo de autorização exigido estiver atendido. A própria conta não pode se promover a Editor ou Editor-Chefe nem alterar campos protegidos.

As regras limitam leitura de documentos privados de outros usuários e limitam as mudanças que o dono pode fazer em `users/{uid}`. Para matérias, a conta ativa pode criar somente sob o próprio `authorUid` e status inicial permitido (Rascunho/Pendente/Ajustes, conforme a regra de criação); atualizações dependem de autoria, status e transições autorizadas.

### 4.3 Editor (`role: Editor`)

Recebe os recursos de redação exibidos pela UI, como Mesa do Editor e leitura/moderação de pautas, além dos recursos de estudante. A regra `isEditor()` inclui Editor, Editor-Chefe e Master. O Editor pode revisar matéria pendente e realizar transições editoriais autorizadas pelo servidor; não pode mudar o destaque editorial, reservado ao ramo do Editor-Chefe/Master. Para uma publicação aprovada de autoria própria existe uma janela limitada de edição prevista nas regras atuais, de sete dias após aprovação em novos casos; ela não deve ser prolongada pelo próprio Editor.

### 4.4 Editor-Chefe (`role: Editor-Chefe`)

A interface apresenta módulos extras de equipe/acessos, postagens de conquistas, avisos escolares e moderação. Nas regras do Firestore, o ramo `isChief()` permite administração mais ampla de usuários/perfis públicos e matérias, incluindo operações que os cargos inferiores não podem executar. O Editor-Chefe também é o papel usado para a revogação/remoção administrativa de acesso.

### 4.5 Administrador Master

O endereço usado pelo código e pelas regras é `folhadopaiquere@gmail.com`, e existe uma UID Master protegida no código de função administrativa. Master recebe direitos equivalentes ao ramo Chief em várias regras. Os controles de promoção/rebaixamento e exclusão de usuário isentam/protegem a conta Master nos caminhos existentes.

### 4.6 Contas revogadas

A lógica `accountActive()` verifica o campo `accessRevoked`; uma conta revogada deixa de manter privilégios de conta ativa mesmo se o campo `role` ainda estiver presente. O fluxo administrativo pode preservar/remover os dados pessoais de acordo com a operação escolhida. Não se deve substituir essa verificação por ocultação visual de abas.

### 4.7 Cargo profissional x cargo editorial

O `role` interno controla permissões (Estudante/Editor/Editor-Chefe). Campos como `assignedTitle` e `schoolYear` são dados de perfil/apresentação. O cargo profissional exibido publicamente não deve substituir o `role` no banco nem conceder permissões administrativas.

---

## 5. Coleções Firestore identificadas nas regras locais

| Coleção | Função aparente e regra de alto nível atual |
|---|---|
| `users` | Dados de conta/perfil e papel. Leitura para dono autenticado e equipe editorial; criação/alteração fortemente condicionadas ao papel e campos alterados. |
| `publicProfiles` | Espelho público de perfis, leitura pública. Escritas vinculadas ao Chief/Master ou a condições de consistência com `users`. |
| `articles` | Matérias, autoria, status editorial, publicação, destaque e contadores. Possui regras separadas para acesso por status, janela de edição e incrementos públicos de visualizações/curtidas. |
| `achievements` | Conquistas públicas, leitura pública; escrita para `isEditor()` conforme regras atuais. A UI pode apresentar a aba somente ao Chief. |
| `schoolNotices` | Avisos escolares, leitura pública e escrita para `isEditor()` nas regras locais. A UI pode reservar o módulo a Chief. Há diferença entre o filtro da interface e a regra do servidor que merece ser revista numa auditoria de autorização específica. |
| `suggestions` | Pautas/sugestões; criação permitida publicamente, leituras para equipe e autoria autenticada conforme documento, atualização por Editor e exclusão editorial ou pelo autor autenticado conforme a regra. |
| `chatMessages` | Mensagens/pautas: a regra dá leitura pública a mensagens do tipo `pauta` no canal `participar`; demais mensagens dependem de conta ativa/equipe, com exceções de autoria para alterar/apagar. |
| `comments` | Comentários: leitura, criação e exclusão públicas; atualização bloqueada. Exclusão pública significa que qualquer cliente pode tentar excluir qualquer documento de comentário usando o SDK, não apenas o autor legítimo. |
| `reactions` | Reações: leitura/criação/atualização/exclusão públicas nas regras atuais. Não existe uma prova de identidade forte do autor no nível da regra. |
| `pollVotes` | Votos: leitura e criação públicas; atualização e exclusão negadas. A proteção de voto único depende do desenho dos IDs/fluxo do cliente, não de uma garantia universal somente por esta regra. |
| `profileChangeRequests` | Solicitações de autorização/alteração de perfil; leitura limitada a equipe e solicitante/UID relacionado, criação conforme o tipo de pedido, atualização por Editor e exclusão por Chief. |

A cópia `firestore.rules-v181.txt` é byte a byte idêntica ao arquivo `firestore.rules`; ela é entregue para consulta/cópia, sem mudança de permissões.

---

## 6. PWA, instalação, uso offline e notificações

### 6.1 Instalação e barra do navegador

O manifesto declara `display: "standalone"`, `start_url` dentro da raiz e ícones quadrados de 192×192 e 512×512 derivados do brasão. Em navegadores compatíveis, depois que a pessoa confirma a instalação e abre o atalho instalado, a aplicação pode aparecer sem a barra normal de URL. Uma página aberta em uma aba comum permanece sob o controle da interface do navegador.

O evento `beforeinstallprompt` não é uniforme entre plataformas e não é suportado no fluxo de instalação do iOS conforme documentação MDN. Nesses dispositivos, a pessoa precisa usar a opção de adicionar à tela inicial no navegador. O botão da v181 chama o prompt nativo quando disponível; caso contrário, apresenta a instrução adequada. Ele não pode criar um atalho de forma silenciosa ou garantida em todos os telefones.

Referência: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt e https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing.

### 6.2 Estado offline atual

O service worker atual mantém cache com estratégia network-first e oferece fallback básico para navegação. Pré-armazena Home, painel, manifesto, brasão e scripts/folha do PWA, e pode guardar outras respostas same-origin que sejam visitadas com sucesso. Se a conexão faltar, a navegação de fallback pode devolver `index.html`. Isso **não** equivale a garantir o funcionamento offline de todas as páginas, matérias, autenticação, upload, consultas Firebase ou módulos editoriais. Recursos remotos e dados novos ainda exigem rede.

### 6.3 Notificações atuais

`notifications.js` permite que o usuário ative as notificações do navegador para mudanças recebidas pelos listeners de notícias, conquistas e avisos, enquanto a página/app está ativo e o Firebase consegue entregar os snapshots. O service worker tem os handlers para exibir e clicar em notificações recebidas por evento `push`.

Entretanto, o código revisado não mostra um fluxo completo de `PushManager.subscribe()`/salvamento de subscription no servidor nem um emissor remoto implantado que dispare push para cada publicação. Portanto, não se deve prometer que toda publicação será enviada automaticamente a quem estiver fora do site, deslogado ou offline. Isso exige uma implementação separada de inscrição e backend de envio; deploy de Cloud Functions tem requisitos de plano de cobrança, e o projeto foi declarado como Spark.

---

## 7. Riscos importantes antes da publicação pública

Esta lista documenta riscos encontrados na base sem alterá-los na v181, pois não eram necessários para o pedido de polimento e podem exigir decisões de produto/moderação.

1. **Páginas auxiliares:** `firebase.json` publica a raiz (`public: "."`) e não ignora explicitamente todas as quatro páginas auxiliares listadas na seção 2.3. Em especial, `seed.html` limpa `localStorage` no navegador em que for aberto. Antes do deploy, excluir esses arquivos do conteúdo publicado ou mover ferramentas para fora da raiz servida, preservando cópias locais.
2. **Regras abertas de interação pública:** as regras de comentários, reações, votos e criação de sugestões permitem operações públicas. Isso pode facilitar spam, alterações/exclusões indevidas ou manipulação dos contadores. Alterar essas regras exige desenhar a solução sem quebrar a experiência anônima aprovada e fornecer/revisar o arquivo integral de regras.
3. **Diferença de UI e regra de servidor:** alguns módulos podem ficar ocultos a papéis inferiores no painel, embora a regra local autorize escrita para `isEditor()` em coleções como conquistas e avisos. A regra do Firestore é a fronteira real de segurança e deve refletir exatamente a intenção de autorização.
4. **Perfil público:** `publicProfiles` tem leitura pública. É necessário garantir que o documento espelho contenha somente campos realmente apropriados para publicação; regras de leitura pública não ocultam campos individuais.
5. **Cloudinary unsigned upload preset:** o frontend contém o nome de nuvem e o preset `folhadopaiquere_preset`, que são identificadores públicos de integração, não segredos. Um preset unsigned precisa ser restrito no Console (tipo de mídia, tamanho, formatos e pastas/transformações admitidos), pois limites no cliente podem ser contornados.
6. **Cloud Functions:** `functions/index.js` contém código de função administrativa. Sua presença no ZIP não confirma implantação. Não tentar deploy de funções no plano Spark sem uma decisão explícita e revisão das exigências atuais.
7. **Backup e recuperação:** um ZIP local não é um backup da base remota Firestore nem dos ativos no Cloudinary. Mantenha cópias independentes e confirme exportação/recuperação antes de grandes mudanças ou migrações.

A v181 não modifica `firebase.json`, as regras Firestore, Cloudinary nem o backend remoto. Recomenda-se tratar segurança/publicação como uma tarefa separada antes de disponibilizar o site amplamente.

---

## 8. Estimativa de capacidade e “vida útil” no plano gratuito

**Não existe um número garantido de anos** sem medir o tamanho atual da base, índices, imagens, tráfego e uso real. A estimativa abaixo é um exercício matemático para dimensionar ordens de grandeza, não uma promessa de duração.

### 8.1 Cotas oficiais de referência

Segundo a página oficial de preços do Cloud Firestore, a cota gratuita inclui 1 GiB de dados armazenados, 50.000 leituras de documentos por dia, 20.000 gravações por dia, 20.000 exclusões por dia e 10 GiB de transferência de saída por mês. O tamanho do banco considera dados e sobrecarga/índices; um documento individual da edição padrão não pode passar de 1 MiB.

Fontes: https://firebase.google.com/docs/firestore/pricing e https://docs.cloud.google.com/firestore/quotas?hl=pt-br.

### 8.2 Ritmo de publicação usado na simulação

- **Ritmo normal indicado:** uma matéria a cada dois dias, um aviso por semana e uma conquista por semana. Aproximação anual: 183 matérias + 52 avisos + 52 conquistas = **287 itens novos por ano**.
- **Ritmo exagerado:** duas matérias por dia, um aviso por dia e uma conquista por dia. Aproximação anual: 730 matérias + 365 avisos + 365 conquistas = **1.460 itens novos por ano**.

A conta não inclui comentários, reações, votos, usuários, solicitações de perfil, pautas, índices e demais documentos.

### 8.3 Tempo teórico até 1 GiB no Firestore

| Média hipotética por item de conteúdo (com uma margem conceitual) | Ritmo normal: 287/ano | Ritmo exagerado: 1.460/ano |
|---|---:|---:|
| 25 KiB | ~146 anos | ~29 anos |
| 100 KiB | ~37 anos | ~7,4 anos |
| 250 KiB | ~15 anos | ~2,9 anos |

Os valores são limites teóricos simplificados para os itens de conteúdo citados. Na prática, outros documentos e os índices também consomem espaço; o prazo verdadeiro pode ser menor. Se houver dados codificados em Base64 dentro de documentos, os tamanhos crescem muito e o limite de 1 MiB por documento pode ser atingido antes do limite total da base. A estratégia Cloudinary de guardar URL em lugar dos bytes de imagem reduz esse risco quando o fluxo de upload é concluído corretamente.

### 8.4 Cloudinary

A documentação oficial atual informa que o plano Free inclui 25 créditos mensais, compartilhados entre armazenamento, tráfego e transformações. Um crédito corresponde, por exemplo, a 1 GB de armazenamento, ou 1 GB de tráfego de imagens, ou 1.000 transformações; não se pode pressupor que todos os 25 créditos ficam disponíveis somente para armazenamento.

Fonte: https://cloudinary.com/documentation/billing_and_plans.

Exemplo, supondo imagens com 250 KB e contando somente armazenamento: se houvesse uma imagem por item novo, o ritmo normal criaria cerca de 72 MB por ano e o exagerado cerca de 365 MB por ano. Se cada matéria tivesse três imagens e cada aviso/conquista uma, seriam aproximadamente 163 MB/ano no ritmo normal e 730 MB/ano no exagerado. Um limite teórico de 25 GB dedicado apenas ao armazenamento levaria a décadas, mas não é uma garantia do plano, porque visualizações, tráfego, transformações e outros ativos também usam a cota.

### 8.5 Firebase Hosting

A documentação oficial de Hosting indica 10 GB de armazenamento gratuito e 10 GB/mês de transferência gratuita. A pasta do site observada durante a preparação da v181 tinha aproximadamente 3,8 MiB antes de acrescentar este relatório e arquivo de regras, muito menor que a cota de armazenamento. A transferência dos visitantes é mais variável: depende do tamanho de cada carregamento, cache, quantidade de visitas e mídias servidas.

Fonte: https://firebase.google.com/docs/hosting/usage-quotas-pricing.

### 8.6 Qual limite provavelmente aparece primeiro?

Com baixa frequência de publicação, o armazenamento puro do Firestore tende a durar muito tempo se as imagens continuarem externas. Isso não determina a “vida do site”: cotas de leituras/gravações, transferência de Hosting, tráfego/transformações do Cloudinary, disponibilidade de serviços e manutenção também importam. Um site com muitas visualizações pode atingir cotas de tráfego antes de encher o armazenamento. A fonte de verdade é o painel Usage/Billing dos serviços reais, medido ao longo de pelo menos algumas semanas.

---

## 9. Alterações específicas da v181

| Área | Mudança | Preservado |
|---|---|---|
| “Baixar site” público | Eventos funcionam para o botão criado dinamicamente no menu público móvel. | O menu público, os atalhos e as demais configurações. |
| “Baixar site” na Área do Estudante | Listener delegado também atende os botões estáticos do painel. | A seção Sobre/instalação e o restante do painel. |
| Prompt nativo | Usa `beforeinstallprompt` quando emitido pelo navegador. | Confirmação explícita da pessoa. |
| Instruções | Mensagem contextual para iOS, Android e desktop quando não há prompt programático. | Nenhuma tentativa de forçar instalação ou esconder a barra de uma aba comum. |
| Ícones | Cria `brasao-folha-paiquere-192.png` e `brasao-folha-paiquere-512.png` a partir do brasão original. | `brasao-folha-paiquere.png` original, sem alteração. |
| Manifesto/service worker | Atualiza referências e cache para os novos ícones/recursos v181. | Scope, start URL, nome e display standalone existentes. |
| CSS global restrito | Foco de teclado e modal/status do PWA em tema claro/escuro. | Grades, margens, tamanho, paleta principal e estilos funcionais existentes. |
| Regras do Firestore | Nenhuma mudança. | `firestore.rules-v181.txt` é cópia idêntica de `firestore.rules`. |

---

## 10. Verificações, limitações e próximos passos

Validações estáticas planejadas/realizadas para esta entrega: integridade do ZIP, sintaxe dos JavaScripts, parsing de CSS, validação do manifesto e dimensões dos ícones, verificação dos caminhos ativos para os ícones, IDs duplicados e referências locais nas páginas HTML, além da comparação byte a byte das regras Firestore.

**Não declarar como concluído:** teste visual em celulares reais, confirmação da caixa nativa de instalação Android/desktop, adição manual à tela inicial iOS, funcionamento offline de páginas privadas, login Firebase integrado, recebimento de push remoto e testes de abuso das regras. Esses testes precisam de navegador/dispositivo e de configuração real do projeto.

Próximos passos recomendados:

1. Testar o botão “Baixar site” numa versão publicada de teste em HTTPS: Android/Chrome, iOS/Safari e desktop/Chrome ou Edge. Confirmar o ícone, o nome, a abertura em modo standalone e os estados “já instalado”/“cancelado”.
2. Antes de publicar amplamente, impedir que as ferramentas auxiliares sejam servidas ao público e revisar as regras públicas de comentários, reações, votos e sugestões sem retirar os recursos aprovados.
3. Conferir o consumo real em Firebase Usage/Billing e Cloudinary Settings/Billing; recalcular estimativas com tamanhos e tráfego observados.
4. Se a comunidade precisar de notificações automáticas quando não estiver usando o site, criar um projeto separado de push web (consentimento, subscriptions, armazenamento seguro, emissor servidor e teste de entrega), respeitando o plano Spark e a política de não expor chaves privadas.
5. Manter cópia local da v180 e anteriores; a v181 é uma nova entrega e não faz deploy remoto.

### Fontes oficiais consultadas

- Firebase Cloud Firestore pricing: https://firebase.google.com/docs/firestore/pricing
- Firestore quotas (1 MiB/document): https://docs.cloud.google.com/firestore/quotas?hl=pt-br
- Firebase Hosting quotas/pricing: https://firebase.google.com/docs/hosting/usage-quotas-pricing
- Cloudinary billing/credits: https://cloudinary.com/documentation/billing_and_plans
- MDN — PWA install prompt: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt
- MDN — Installing PWAs: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing
