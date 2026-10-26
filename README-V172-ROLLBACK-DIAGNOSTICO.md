# Folha do Paiquerê — v172 (rollback controlado para a base v170)

## Objetivo

Esta entrega restaura exatamente o código da v170, a versão anterior à v171. Foi criada depois de comparar os ZIPs v170 e v171. A implementação da v171 não foi mantida, porque introduziu mudanças em estilos de imagens, fluxo de formatação de texto, layout do editor e ordenação de Conquistas sem validação visual integrada suficiente.

## Diagnóstico confirmado: imagens com espaços vazios nos cards

A causa direta foi encontrada em `fp-v171-targeted-polish.css`. A v171 acrescentou `object-fit: contain !important` aos seletores de imagens diretas em `.fp-public-article-media`, `.fp-home-public-card-media`, `.fp-home-feature-image`, `.achievement-media` e `.school-notice-card`.

A base v170 define imagens de cards com `object-fit: cover` e contêineres com proporções fixas (por exemplo, 16:9 ou aproximadamente 16:8.7). Na função `publicCoverMediaMarkup()` de `app.js`, quando `coverCrop` não é válido ou não existe, o HTML resultante contém uma imagem `<img>` como filha direta do contêiner. Essa imagem recebe o novo `contain` da v171: ela preserva a imagem inteira, mas, quando a proporção da fonte não corresponde à proporção do cartão, deixa faixas vazias. Isso corresponde diretamente ao sintoma relatado.

Quando há um recorte válido, o HTML usa um elemento de enquadramento (`.fp-crop-image-window`), então os seletores `> img` não atingem essa mesma imagem. Isso cria comportamento diferente entre cartões recortados e não recortados. A causa confirmada para as lacunas gerais é, portanto, a substituição global de `cover` por `contain` para imagens diretas — não há evidência suficiente para culpar o editor de recorte por todas as lacunas. Dados de recorte malformados/ausentes fazem a função voltar ao caminho de imagem direta, mas o espaço vazio vem da regra `contain`.

## Outros riscos encontrados na comparação v170 → v171

1. `editor.js` foi alterado em vários pontos de lógica de interação: retenção/restauração da seleção, formatação parcial do texto em canvas, estilos pendentes para digitação/colagem e eventos de `text:changed`. Esses são caminhos centrais e mais extensos do que uma alteração de CSS. A inspeção estática prova que o comportamento mudou, mas **não prova sozinha qual bug visual/funcional específico ocorreu em execução**. O rollback restaura a lógica anterior, permitindo retestar separadamente.
2. `fp-v171-targeted-polish.css` também alterou o overflow dos campos de texto ricos e o posicionamento/altura da prévia no editor. Esses overrides podem alterar o modelo de rolagem e a área de contenção do painel; sem uma reprodução integrada não é responsável afirmar que uma regra isolada é a causa de cada sintoma. O rollback remove o conjunto de overrides e devolve a configuração da v170.
3. `app.js` e `conquistas.html` mudaram a ordenação de Conquistas: a v171 substituiu as opções `Ano`, `Nome` e `Mais participantes` pela ordenação temporal `Menos recente`. O rollback restaura o comportamento anterior da v170 porque a prioridade imediata solicitada foi voltar à base anterior com menos problemas.
4. As sete páginas públicas, `editor.html` e `painel.html` receberam uma referência à folha `fp-v171-targeted-polish.css`. A v170 não contém essa referência. O rollback remove a folha do caminho de execução, em vez de tentar compensar suas regras com mais overrides.

## O que foi revertido

- `app.js`: retorna exatamente à v170.
- `editor.js`: retorna exatamente à v170.
- `conquistas.html`: retorna exatamente à v170.
- `index.html`, `noticias.html`, `noticia-single.html`, `perfil.html`, `painel.html` e `editor.html`: removida a referência à CSS exclusiva da v171, retornando aos conteúdos exatos da v170.
- Não inclui `fp-v171-targeted-polish.css`.
- `firestore.rules` permanece idêntico à v170.

## Integridade e limites

Todos os arquivos que já existiam no ZIP v170 foram preservados byte a byte. Este pacote adiciona apenas este relatório e `firestore.rules-v172.txt` (uma cópia exata das regras). Não foram feitas migrações, deploys nem alterações no Firebase remoto.

A validação compara conteúdo de arquivos e sintaxe estática; não substitui testes reais do navegador. Próximo passo: testar a base recuperada e reproduzir um problema de cada vez, registrando página, viewport, tipo de imagem (com/sem recorte) e resultado. Só então corrigir o menor trecho que for comprovadamente responsável.
