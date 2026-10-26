# Folha do Paiquerê — v173: correções pontuais verificadas

## Base e regra de trabalho

A v173 foi criada a partir do pacote de rollback `v172-rollback-v170`, que restaura o código da v170. A folha corretiva que provocou regressões na v171 não foi reutilizada. A v170 original/rollback deve ser mantida como cópia de segurança.

O escopo desta rodada é somente: biografia integral do perfil, formatação e rolagem dos blocos de texto no editor, prévia que acompanha a rolagem no desktop, prevenção de overflow horizontal na matéria publicada, preenchimento correto de capas, e filtros/ordenação de Conquistas. Nenhuma regra remota do Firebase foi alterada e nenhum deploy foi executado.

## Diagnóstico baseado em evidência do código

### 1. Imagens de capa e áreas vazias

A comparação documentada entre v170 e v171 mostrou que a v171 introduziu `object-fit: contain !important` em seletores das imagens públicas. Isso faz a imagem inteira caber na caixa, mas deixa faixas vazias quando a proporção da imagem não coincide com a proporção do card. Essa regra não foi carregada na v170 restaurada e não é incluída na v173.

Também havia dois problemas independentes no caminho do recorte:

- O editor aceita recortes tão pequenos quanto 1% da imagem. Os renderizadores antigos limitavam os tamanhos calculados a 1250% ou 2500%, embora um recorte de 1% precise de 10000% para ocupar integralmente sua janela. O limite artificial fazia o enquadramento ficar incompleto.
- As dimensões e posições dos recortes eram emitidas como estilos inline normais. Regras CSS preexistentes com `!important` (`width`, `height` e `object-fit` nas imagens de cards) podiam substituí-las, anulando a geometria do recorte.

A v173 usa uma validação comum para coordenadas normalizadas, rejeita retângulos inválidos e volta à imagem original com `object-fit: cover` quando o metadado não é utilizável. Em recortes válidos, remove os limites artificiais de porcentagem e aplica a geometria como estilo inline `!important`. O mesmo foi alinhado entre card público, capa da matéria, imagem dentro do conteúdo e prévias do editor. A janela de recorte de uma capa publicada também passa a preencher a caixa 16:9 em vez de conservar acidentalmente a proporção genérica 16:10.

Isso identifica causas concretas no caminho de renderização. Não significa que todos os registros históricos tenham metadados incorretos; por isso, quando um recorte não passa nas verificações, o site não tenta deslocar a imagem com valores inválidos.

### 2. Biografia do perfil

As folhas antigas aplicavam `-webkit-line-clamp` de cinco linhas e uma regra mais específica de três linhas no cartão de identidade em desktop. A v173 desativa o limite, libera `height`/`max-height`/`overflow` e permite quebra de palavras longas dentro da largura do cartão.

### 3. Formatação do editor

O seletor Normal/Título/Subtítulo do editor de blocos chamava o caminho de estilo-base e re-renderizava o HTML do bloco; isso podia apagar seleção/cursor e fazia uma alteração em uma seleção atuar como estilo do bloco inteiro. A formatação por trechos também podia ser anulada por estilos inline antigos em spans aninhados.

A v173 separa as situações:

- Com texto selecionado, aplica o estilo somente ao trecho selecionado e sincroniza o conteúdo com o modelo.
- Com cursor sem seleção, registra o estilo como formatação pendente para a próxima digitação ou colagem.
- Sem seleção/cursor no editor, preserva o comportamento de mudar o estilo-base do bloco inteiro.
- A colagem em formato texto respeita os estilos pendentes, sem colar HTML arbitrário do clipboard.

O mecanismo mantém os IDs, os botões e o modelo de conteúdo existentes. A interação completa ainda precisa ser confirmada em navegador real, porque a sessão de validação não conseguiu inicializar o Chromium corretamente.

### 4. Rolagem dos blocos e prévia

Os campos `contenteditable` tinham um limite/overflow próprio e `overscroll-behavior: contain`, o que podia consumir a rolagem do mouse enquanto ele estava sobre o texto. Na v173 os blocos crescem com o conteúdo e deixam a rolagem chegar à página.

No desktop amplo, o grid utiliza proporções 65/35, o painel de dados permanece no fluxo normal da página e apenas `#editor-preview-panel` fica `position: sticky` dentro da segunda coluna, com 90dvh de altura e rolagem interna da prévia. Assim o painel acompanha a rolagem até o fim do conteúdo do editor sem cobrir os campos. Abaixo de 1100px volta a uma coluna para evitar sobreposição/compressão.

### 5. Matéria publicada e overflow horizontal

`#single-container`, a página do artigo, seus cabeçalhos/conteúdo e mídias receberam limites de largura e `min-width: 0`. Texto e links podem quebrar, imagens/vídeos/iframes/audio não ampliam o viewport, e tabelas/pre mantêm rolagem dentro de seus próprios limites. O recorte de capa permanece dentro da moldura do artigo.

### 6. Filtros de Conquistas

O seletor de anos é preenchido dinamicamente a partir das conquistas existentes; o mesmo estado alimenta os chips para desktop. A v173 mostra a lista `Todos os anos` + anos apenas em celular e conserva os chips no desktop. O seletor de ordenação contém somente `Mais recentes` e `Menos recente`. A comparação usa os timestamps disponíveis; registros que só possuem o ano continuam legíveis e não recebem uma data inventada.

## Arquivos alterados

- `app.js`: validação de metadados de recorte, renderização das imagens/capas com a geometria correta e ordenação de Conquistas.
- `editor.js`: estilos por trecho/cursor/colagem e geometria das prévias recortadas.
- `conquistas.html`: opções de ordenação e seletor de ano visível para a regra responsiva.
- `index.html`, `noticias.html`, `noticia-single.html`, `perfil.html`, `sobre.html`, `conquistas.html`, `painel.html`, `participar.html` e `editor.html`: inclusão da folha corretiva no fim da pilha de estilos.
- `folha-notifications-sw.js`: versão de cache atualizada para `v173`, para descartar o cache da versão anterior após a atualização.
- `fp-v173-verified-fixes.css`: regras corretivas isoladas, carregadas por último.
- `firestore.rules-v173.txt`: cópia integral de `firestore.rules`, sem mudanças de permissão.

Nenhum arquivo de função/página foi removido. O projeto não recebe migração de dados.

## Validações concluídas

- `node --check`: os 14 arquivos JavaScript passaram.
- Parser CSS (`tinycss2`): 40 folhas CSS, zero erros de parsing.
- HTML: 14 páginas analisadas; nenhum ID duplicado e nenhuma referência local de CSS/JS/imagem ausente.
- A folha `fp-v173-verified-fixes.css` é incluída exatamente uma vez nas nove páginas pretendidas.
- Testes de unidade do helper de recorte: recorte completo aceito; recorte mínimo de 1% aceito; recorte fora dos limites, largura zero, altura > 1 e recorte ausente rejeitados.
- Confirmado que os limites artificiais de 1250%/2500% não permanecem nos renderizadores `app.js` e `editor.js`.
- `firestore.rules-v173.txt` comparado byte a byte com `firestore.rules` da base; são idênticos.
- O ZIP passou na verificação de integridade.

## Limitações explícitas

Foi tentada uma captura com Chromium headless em servidor local, mas o navegador não concluiu a inicialização e terminou por falha de comunicação com o zygote. Portanto, a v173 tem validação estática e testes do helper, mas não uma validação visual integrada do site nem teste de interação real com Fabric/Firebase. É necessário testar em Edge/Chrome/Firefox, especialmente: seleção de trechos, caret e colagem após mudar estilo; uma capa com recorte normal e outra com recorte mínimo; e o último campo do editor enquanto a prévia permanece visível.

## Firebase

Não publicar regras novas: as regras são idênticas às da base. Nenhum deploy foi executado, e nada foi gravado no Firebase remoto.
