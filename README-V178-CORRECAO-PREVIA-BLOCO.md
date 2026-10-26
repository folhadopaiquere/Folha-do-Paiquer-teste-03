# Folha do Paiquerê — v178 — correção da prévia “Bloco da Matéria”

## Base e escopo
- Base: pacote v177 enviado pelo proprietário.
- Correção pontual: somente a prévia do modo **Bloco da Matéria** dentro de `editor.html`.
- `editor.js` não foi alterado. Não houve mudança de dados, modelo do canvas, renderização publicada, Firebase ou Cloudinary.
- `firestore.rules` não foi alterado; `firestore.rules-v178.txt` é uma cópia integral idêntica para referência. Não é necessário republicar regras.

## Diagnóstico
O modo “Bloco da Matéria” é montado por `renderEditorInlinePreview()` em `editor.js`, que gera `.editor-article-card-preview`. A imagem de capa usa um `span` com as classes `fp-crop-image-window editor-card-cover-window`. A classe genérica `fp-crop-image-window` mantém um `aspect-ratio: 16/10`, portanto a altura do quadro crescia junto com a largura da coluna de prévia (aproximadamente 650 px na captura). Além disso, o cartão não tinha limite de largura, enquanto a prévia móvel restringe o site a 390 px. O resultado era um quadro de imagem muito alto e um card esticado.

## Correção aplicada
Foi criada `fp-v178-editor-card-preview.css`, incluída ao final da lista de estilos de `editor.html`. Ela: 
1. limita o cartão do modo `is-card` a 390 px e o centraliza;
2. sobrescreve o aspect-ratio genérico apenas para `.editor-card-cover-window`, usando altura fixa compacta de 9,3 rem, equivalente à altura indicada pela regra móvel existente para imagens de cards;
3. mantém a imagem recortada dentro do quadro e limita o placeholder sem imagem à mesma altura;
4. não toca nos estilos do modo `is-mobile`, no preview completo do modal, no canvas, no código de salvamento ou nas imagens finais publicadas.

## Integridade e validação
O arquivo JavaScript não foi modificado. As verificações estáticas de sintaxe, referências locais, IDs e integridade do ZIP passaram. A tentativa de renderizar a prévia em Chromium foi bloqueada pelo ambiente de execução, tanto usando o servidor local quanto um arquivo local; portanto, não foi possível confirmar uma captura de navegador real nesta sessão. A conferência final deve ser feita em `editor.html`, alternando entre “Bloco da Matéria” e “Mobile”, com uma capa com e sem recorte, para confirmar que apenas o primeiro modo ficou compacto.
