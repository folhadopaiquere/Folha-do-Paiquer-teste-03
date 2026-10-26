# Folha do Paiquerê — v170 (polimento direcionado)

## 1. Objetivo e limites desta versão

A v170 parte da v169 e aplica as correções pedidas para as áreas públicas, o editor de matérias, perfis, conquistas, identidade visual e carregamento de autenticação. A regra central foi preservar os caminhos de funcionamento existentes e mudar somente o necessário. Não foi feito deploy, não houve acesso de escrita ao Firebase remoto e não houve migração de dados.

O projeto usa Firebase no plano gratuito Spark. As alterações desta versão não acrescentam Cloud Functions, serviço pago ou nova dependência de backend. O arquivo `firestore.rules-v170.txt` é uma cópia integral de `firestore.rules`; as regras não foram alteradas.

## 2. Alterações por fluxo

### 2.1 Notificações da área pública

- O sino público abre uma central própria para notícias, avisos escolares e conquistas.
- A central combina os itens locais disponíveis com os dados obtidos por `FPCloud`, quando o cliente Firebase está disponível; também assina atualizações dos métodos de escuta já presentes.
- Os itens são ordenados por data, limitados aos 18 mais recentes e conduzem para a página correspondente. Avisos usam `index.html#aviso-ID`, notícias usam `noticia-single.html?id=ID` e conquistas usam `conquistas.html#achievement-ID`.
- A ativação de push pelo navegador é opcional e separada da central. A interface não deve afirmar que o push foi ativado quando o navegador não confirmou a permissão/ativação.
- No plano Spark, a central continua capaz de usar dados existentes sem exigir Cloud Functions.

### 2.2 Perfil anônimo, teclado móvel e configurações

- O campo de nome público anônimo usa fonte de 16 px para evitar zoom automático do navegador móvel, considera `visualViewport`, atualiza a altura do modal quando o teclado aparece e tenta trazer o campo para a área visível.
- O menu de configurações fecha quando se toca/clica fora, quando a página rola ou quando Escape é pressionado.
- A opção **Área do estudante** foi incluída imediatamente após **Editar perfil**, apontando para `login.html`.
- A engrenagem e a campainha públicas usam as mesmas silhuetas SVG do cabeçalho móvel do painel do estudante; o comportamento foi mantido separado.

### 2.3 Texto e imagem no editor de matérias

- O seletor de bloco Normal/Título/Subtítulo define a tipografia-base do bloco e sincroniza canvas, editor de texto e prévia. Seleção parcial continua disponível para formatação de trechos; selecionar todo o conteúdo é tratado como aplicação de estilo ao bloco inteiro.
- Trocar a fonte aplica a fonte ao trecho selecionado, ao texto futuro na posição do cursor ou ao bloco inteiro, conforme o estado atual do editor. A intenção é evitar o erro anterior em que o seletor mostrava Título enquanto o conteúdo continuava com o tamanho do estilo anterior.
- O comando **+ Imagem** oferece primeiro **Deste dispositivo** e **HTML**, encaminhando cada escolha para os fluxos de upload ou inserção por URL/tag que já existiam.
- As regras de recorte mantêm o arquivo original e aplicam o enquadramento à apresentação. O alinhamento central do bloco da imagem aplica margens automáticas ao elemento renderizado e à prévia, independentemente do recorte.
- A prévia fica fixa à direita em telas amplas, reservando aproximadamente 35% do espaço útil do editor; o painel interno tem altura de 90% do viewport e rolagem própria. Abaixo do limite responsivo, o editor passa a uma coluna para evitar sobreposição.

### 2.4 Capas, categorias e contadores

- As funções de apresentação das capas mantêm os recortes em quadros que preenchem a área do card em telas compactas.
- As categorias são reunidas a partir dos campos usados pelo formulário, incluindo categorias personalizadas do campo Outro. Os cards usam essa lista, evitando omitir o terceiro tema ou o valor personalizado.
- Os cards de últimas notícias e o destaque da Home exibem contagem de comentários como informação. A área de destaque não reintroduz os botões de like/comentar que haviam sido pedidos para retirar na apresentação compacta.
- Nos cards da Home, a linha de ações conserva “Ler matéria” com largura do próprio conteúdo, deixando os contadores à direita quando houver espaço.

### 2.5 Datas das conquistas e mural

- A data da conquista é exibida como `DD/MM/AAAA` nos lugares em que a conquista é apresentada.
- O ano de filtro continua derivado da data exata e é atualizado a partir das conquistas efetivamente disponíveis. Se houver dados antigos só com `year`, eles permanecem legíveis e não recebem uma data inventada; a apresentação indica que a data não foi informada.
- O formulário contém a data completa e deriva `year` a partir dela, mantendo compatibilidade com o filtro de ano já usado.
- Foram adicionados limites de apresentação aos cards de conquistas do mural/perfil para reduzir desproporção, overflow e conteúdo espremido.

### 2.6 Perfil público e página Sobre

- Avatar e contêiner da imagem são limitados a uma proporção quadrada e `object-fit: cover`, mantendo a imagem selecionada dentro do círculo.
- A página pública do perfil é forçada a uma coluna em telas compactas e evita overflow horizontal do layout principal; carrosséis internos ainda podem rolar horizontalmente.
- O texto “Conta ativa/inativa” foi removido da apresentação do perfil; a lógica de revogação e as regras de acesso não foram removidas.
- A seção “Conheça quem faz a Folha” usa controles com largura responsiva para evitar um cabeçalho apertado em celulares. A ordenação por conquistas, contribuições, ano de cadastro e nome permanece; o “ano de cadastro” é ordenação e não um filtro de ano.

### 2.7 Navegação pública móvel, Home, Notícias, Conquistas e Sobre

- Cabeçalho público compacto: configurações à esquerda, brasão central e campainha à direita.
- Barra inferior pública com Início, Notícias, Conquistas e Sobre. Os atalhos da Área do Estudante não foram copiados para essa navegação.
- Home: o destaque tem pontos indicadores, muda automaticamente a cada cinco segundos e aceita gesto horizontal; os cartões de acesso rápido permanecem específicos ao site público; últimas notícias aparecem numa coluna vertical em celulares.
- Home: “Pular para o conteúdo principal” continua disponível para navegação por teclado, mas não aparece como botão colorido sem foco.
- Home: o rodapé institucional longo é ocultado em telas compactas; permanece em telas amplas.
- Notícias: data e tempo de leitura ficam abaixo do subtítulo; os contadores ficam ao lado direito da ação “Ler matéria”. Etiquetas de tema usam truncamento para proteger a largura.
- Conquistas: busca/ordenação ficam depois da descrição, e os classificadores de ano refletem os anos existentes nos dados.
- Sobre: remove-se o filtro de anos; a busca e o seletor de ordenação são mantidos.
- Artigo individual: “Mais histórias da comunidade” passa a ser “Mais histórias para a comunidade”; em telas compactas os cards relacionados formam uma faixa horizontal de tamanho médio. O botão redundante “Mais opções de compartilhamento” não é necessário; Copiar link e as opções suportadas permanecem.
- As páginas públicas incluem um véu de carregamento com o brasão; o login e as páginas protegidas possuem o indicador de autenticação com o mesmo brasão.

### 2.8 Identidade visual e PWA

- O código/HTML/manifest/service worker passa a referenciar apenas `assets/branding/brasao-folha-paiquere.png` para a marca da Folha, incluindo favicon, Apple touch icon, cabeçalho, carregamento, instalação e notificações.
- As imagens `assets/branding/pwa-192.png` e `assets/branding/pwa-512.png` foram retiradas do pacote de trabalho após confirmar que os pontos de entrada de runtime já não as referenciavam. O arquivo do brasão escolar (`brasao-escola.jpeg`) é uma marca de uma entidade diferente e permanece apenas nos contextos escolares próprios, não como logotipo da Folha.
- O cache do service worker foi versionado para `fp-paiquere-pwa-v170`, para que as alterações de recursos sejam percebidas na próxima atualização do worker.

### 2.9 Limpeza de documentos redundantes

A pedido explícito, foram retirados do pacote de trabalho documentos antigos e cópias redundantes que não são carregados pelo site: READMEs e relatórios de cada versão antiga, snapshots de regras versionadas e diagnósticos históricos repetidos. Foi mantido `README-V169-POLIMENTO.md` como documentação imediata de origem, além dos guias operacionais de Firebase/Cloudinary/persistência/Supabase e de recuperação dos planos Spark. As regras atuais continuam em `firestore.rules`, com cópia íntegra em `firestore.rules-v170.txt`.

A limpeza afeta somente o pacote novo. As versões ZIP anteriores não foram modificadas, então os arquivos históricos continuam recuperáveis a partir delas.

## 3. Arquivos alterados em relação à v169

Arquivos existentes modificados:

- `app.js`
- `cloudinary-diagnostico.html`
- `conquistas.html`
- `editor.html`
- `editor.js`
- `firebase-bootstrap.html`
- `folha-notifications-sw.js`
- `fp-v166-public-mobile.js`
- `index.html`
- `login.html`
- `manifest.webmanifest`
- `noticia-single.html`
- `noticias.html`
- `painel.html`
- `participar.html`
- `perfil.html`
- `portal.js`
- `pwa.js`
- `reset-demo.html`
- `seed.html`
- `sobre.html`

Arquivos novos:

- `fp-v170-polish.css`
- `firestore.rules-v170.txt`
- `README-V170-POLIMENTO.md`

Os HTMLs recebem a nova folha de estilos em posição posterior às folhas existentes, para limitar as substituições e evitar reescrever CSS legado. `painel.html` e `editor.html` recebem apenas o necessário para o carregamento e a escolha de imagem; não houve redesign dos painéis.

## 4. Firebase e segurança

- Nenhum deploy ou gravação foi realizado no projeto Firebase remoto.
- `firestore.rules-v170.txt` é byte a byte idêntico a `firestore.rules`.
- Nenhuma regra precisou mudar nesta rodada, e nenhuma Cloud Function foi adicionada.
- As permissões públicas preexistentes para comentários, reações e votos continuam como estavam; esta rodada não é uma auditoria nem uma correção geral das regras.
- Os novos campos de data da conquista são armazenados no documento de conquista já existente; `year` é derivado da data completa para compatibilidade.

## 5. Verificações executadas

- 14 arquivos JavaScript passaram em `node --check`.
- 39 folhas CSS passaram no parser CSS.
- 14 páginas HTML foram analisadas: nenhum ID duplicado foi encontrado.
- Cada HTML inclui exatamente uma referência a `fp-v170-polish.css`.
- As referências locais das páginas foram verificadas contra a raiz do site: nenhuma referência ausente foi encontrada.
- `manifest.webmanifest` foi lido como JSON válido e a imagem indicada existe.
- Não restaram referências de runtime a `pwa-192.png` ou `pwa-512.png`.
- `firestore.rules-v170.txt` foi comparado byte a byte com `firestore.rules`.

## 6. Testes ainda pendentes / limites

As verificações acima são estáticas. Não foi possível completar uma execução visual integrada com Chromium neste ambiente, pois o navegador não iniciou (falha de inicialização/zygote). Por isso, não afirmamos que o layout final ou os fluxos completos estão visualmente validados em navegadores reais.

Antes de publicar, testar no browser local e em celular real:

1. Notificações públicas: abrir a central, ver notícia/aviso/conquista, navegar para o item, testar com e sem permissão de push.
2. Nome anônimo: abrir o modal, focar o input com teclado virtual e salvar nome.
3. Editor: Normal/Título/Subtítulo com bloco vazio, bloco existente, seleção parcial e seleção de todo o texto; salvar e reabrir rascunho.
4. Inserir imagem por arquivo e por HTML; testar alinhamentos esquerdo/centro/direito com e sem recorte.
5. Testar capa recortada em cards de 360, 390 e 430 px e verificar que a imagem preenche o quadro.
6. Criar uma notícia com categorias conhecidas + “Outro”, verificar tema nos cards, busca e comentários.
7. Registrar conquista com data completa, verificar `DD/MM/AAAA`, classificação por ano e atualização dos chips ao editar/remover o único item de um ano.
8. Perfil público: avatar circular, nenhuma palavra “Conta ativa/inativa”, rolagem vertical completa e ausência de scroll horizontal da página.
9. Mural de conquistas: imagem, título longo, data, descrição e créditos sem overflow.
10. Testar o véu ao carregar, ao autenticar com sucesso e ao receber erro de login; garantir que o indicador desaparece em ambos os resultados.
11. Verificar instalação PWA e cache do service worker nos navegadores alvo. O manifesto agora usa a única imagem da marca conforme solicitado; compatibilidade de instalação deve ser conferida no navegador real.
12. Testar modos claro/escuro e zoom 100%/125%/150% em desktop e mobile.

## 7. Orientação para a próxima versão

A base a usar depois desta rodada é **v170**. Não restaurar antigos READMEs ou regras versionadas da raiz do projeto apenas por histórico: os ZIPs das versões anteriores são a cópia de segurança. Antes de alterar qualquer fluxo, reproduzir o problema, localizar o handler/renderizador/persistência correspondente e mudar o mínimo possível. Não fazer deploy nem publicar regras sem solicitação explícita.
