# Folha do Paiquerê v177 — correção visual do perfil público

## Causa identificada

Na v176, a regra de `.fp-profile-topbar` adicionou fundo semitransparente, borda inferior e `backdrop-filter`. Porém, esse elemento segue como irmão de largura total da grade de duas colunas (`.fp-public-profile-layout`). Por isso, a faixa pintava tanto a área do papel de parede do perfil quanto a área escura do conteúdo à direita, criando a barra horizontal visível na captura.

## Correção aplicada

- Criada a folha isolada `fp-v177-profile-visual-fix.css`, carregada somente em `perfil.html` e depois da camada v176.
- No desktop (largura de 900 CSS px ou mais), removidos fundo, borda, sombra e desfoque da faixa, e limitada sua largura à coluna esquerda.
- Preservados o posicionamento `sticky` do botão Voltar, o `sticky` da coluna de identidade, seus offsets, os dados do perfil, o painel direito, as grades, os filtros e os listeners existentes.
- A regra também neutraliza explicitamente o fundo que a v176 define para o tema escuro.
- Nenhuma alteração foi feita ao `app.js`, à estrutura HTML, ao comportamento mobile ou a outras páginas.

## Regras e publicação

`firestore.rules-v177.txt` é uma cópia de `firestore.rules`. Não houve alteração de permissões nem deploy remoto.

## Validações

- ZIP testado com `unzip -t`.
- JavaScript verificado com `node --check`.
- CSS verificado com parser estático.
- IDs HTML duplicados e referências locais ausentes verificados.
- Inclusão da folha v177 verificada uma única vez e apenas em `perfil.html`.

A verificação visual integrada em navegador não pôde ser concluída nesta execução; conferir a vista desktop com tema claro/escuro e rolagem antes de publicar.
