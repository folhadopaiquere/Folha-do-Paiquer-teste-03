# Folha do Paiquerê — v174: polimento direcionado

## Base e limites

- Base: pacote `folha-do-paiquere-v173`, preservado sem sobrescrita.
- Esta versão trata apenas os oito pontos solicitados no polimento visual/UX.
- Não houve deploy nem conexão/escrita no Firebase remoto.
- `firestore.rules-v174.txt` é uma cópia byte a byte de `firestore.rules`; nenhuma regra/permissão mudou.
- Não foram removidos módulos, IDs, dados, listeners nem destinos de navegação.

## Alterações

### 1. Matéria — trilho “Mais histórias para a comunidade” no celular

Arquivo novo `fp-v174-targeted-polish.css`. Adiciona limites de largura/min-width aos contêineres ancestrais relacionados a `#single-container` e clipping horizontal apenas no contexto da página da matéria móvel. O trilho continua horizontal e com rolagem interna; os cards não foram transformados em pilha vertical.

### 2. Notificações de avisos e conquistas

`notifications.js`: `setup()` já não termina antecipadamente quando uma página pública não contém o botão legado `#notification-toggle`. O binding do botão é opcional, mas inicialização do service worker e listeners Firestore continuam a funcionar quando as notificações estão habilitadas. Isso corrige o caminho de páginas como `perfil.html`, onde o botão público visível é o sino do shell móvel. Não introduz um backend de push: notificações nativas ainda dependem de HTTPS/contexto seguro, permissão do navegador, ativação prévia e listener ativo para detecção em tempo real. A central móvel continua usando `FPCloud` e os dados locais.

### 3. Menu de configurações público no celular

`fp-v166-public-mobile.js`: reordenadas as duas entradas existentes, mantendo os mesmos atributos e comportamentos: “Baixar site” agora precede “Área do estudante”. Nenhuma ação foi removida.

### 4. Editor de matéria — seleção, tipo de texto e fonte

`editor.js`: `restoreRichEditorSelection()` clona a faixa salva antes de focar o `contenteditable`, evitando que um evento de foco em dispositivo touch substitua a seleção que precisa ser formatada. Os seletores `[data-block-style]` e `[data-block-font]` também salvam a faixa antes da abertura por pointer/touch, mantendo o fallback de mouse e o listener de foco. IDs, comandos, modelos e o comportamento sem seleção/cursor foram mantidos.

### 5. Conquistas — filtro de ano por dispositivo

A nova folha CSS inverte a apresentação existente: chips horizontais no celular, seletor nativo no desktop. Os chips continuam sendo gerados e sincronizados pelo `app.js` com os anos reais; não foram codificados anos manualmente nem alterados os valores dos filtros.

### 6. Perfil público — moldura/foto circular

A nova folha impõe dimensões quadradas e `aspect-ratio: 1 / 1` à moldura e à imagem, com `object-position: 50% 50%` e `object-fit: cover`. Mantém o placeholder de iniciais e os tamanhos escalonados já existentes em desktop intermediário e celular.

### 7. Perfil público — resultados de “Explorar atividade”

Somente dentro de `.fp-profile-filter-results`: duas colunas em desktop e uma coluna no celular. No celular, tamanho da tipografia e padding dos cards são restaurados para valores confortáveis. Os trilhos `Últimas contribuições` e `Mural de conquistas` não têm suas grades/tracks alterados por estas regras.

### 8. Perfil público — corte vertical do painel direito em desktop

Para `min-width: 900px`, a página volta a crescer verticalmente e usa a rolagem normal do documento, em vez de limitar a página e manter o painel direito dentro de um contêiner com altura fixa/overflow oculto. As grades horizontais internas de contribuição e mural conservam o scroll-x próprio.

### 9. Cache do service worker

`folha-notifications-sw.js`: atualizado apenas o identificador/cache de v173 para v174 para que os clientes instalem uma versão distinta do cache após a publicação. A lógica dos handlers de notificações e de navegação não mudou.

## Arquivos alterados

- `fp-v166-public-mobile.js`
- `notifications.js`
- `editor.js`
- `folha-notifications-sw.js`
- `fp-v174-targeted-polish.css` (novo)
- `firestore.rules-v174.txt` (cópia idêntica; não altera regras)
- Inclusão da folha CSS v174 somente em: `noticia-single.html`, `conquistas.html` e `perfil.html`. Os ajustes JavaScript permanecem nos arquivos compartilhados adequados.

## Verificações concluídas e limites

- `node --check`: 14 arquivos JavaScript verificados, zero falhas de sintaxe.
- Parser `tinycss2`: 41 folhas CSS analisadas, zero erros de parsing.
- HTML: 14 páginas analisadas, zero arquivos com IDs duplicados e zero referências locais de CSS/JS/imagens/iframes ausentes.
- Folha `fp-v174-targeted-polish.css`: incluída exatamente uma vez, depois de `fp-v173-verified-fixes.css`, nas nove páginas pretendidas.
- Regras do Firestore: `firestore.rules` e `firestore.rules-v174.txt` idênticos byte a byte; SHA-256 `86b95b7659c7d7f95aec4348896b178ef2a0c0bf2b37a7defb477303f1cd9c72`.
- ZIP: verificação final de integridade executada após empacotamento.
- Tentativa de abrir a página com Chromium/Playwright em servidor HTTP local: a navegação foi bloqueada pelo ambiente (`net::ERR_BLOCKED_BY_ADMINISTRATOR`). Assim, não há teste visual integrado real nem confirmação de interação por toque nesta entrega.
- Antes de publicar, conferir em navegador real nas larguras 320, 360, 390, 430 px e desktop: seleção de texto no editor touch, menu, avisos/conquistas recém-publicados, filtro de anos, ausência de overflow na matéria e o final do painel direito do perfil.
- O listener de notificações nativas no navegador não é um servidor push de fundo. Para notificar com o site completamente fechado, seria necessário um mecanismo de push/servidor que não foi adicionado por este ajuste e que está fora do escopo.

## Firebase

`firestore.rules-v174.txt` foi copiado byte a byte do `firestore.rules` da base v173. Não é necessário republicar regras por causa destes ajustes. Nenhum deploy foi executado.
