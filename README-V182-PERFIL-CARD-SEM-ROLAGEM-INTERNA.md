# Folha do Paiquerê v182 — perfil público sem rolagem interna no cartão

## Base
- Criada a partir do pacote completo v181.
- A v181 e todos os pacotes anteriores permanecem preservados.

## Correção solicitada
No perfil público em computadores, remover a rolagem interna da coluna que contém o botão Voltar e o cartão de identidade. O botão e a coluna continuam com posicionamento `sticky`, mas o cartão tem altura natural conforme seu conteúdo; a rolagem ocorre na página, não dentro da coluna/cartão.

## Implementação
- Adicionado `fp-v182-profile-no-inner-scroll.css`.
- A nova folha é carregada somente em `perfil.html` e depois das folhas anteriores.
- As regras aplicam-se somente a `min-width: 900px`.
- `.fp-profile-sidebar`: mantém `position: sticky`, elimina `max-height` e define `overflow: visible` nos eixos.
- `.fp-profile-identity-card`: mantém altura natural e não usa overflow de rolagem/clipping.
- Nenhum JavaScript, seletor de conteúdo, campo de dados, regra de autorização, regra Firestore ou serviço externo foi alterado.
- O comportamento móvel foi deixado intocado.

## Regras do Firestore
`firestore.rules-v182.txt` é uma cópia integral de `firestore.rules`. Os hashes devem ser idênticos; não é necessário publicar novas regras.

## Validação e limites
Foram executadas verificações estáticas de sintaxe dos scripts/estilos, IDs HTML, referências locais e integridade do ZIP. Não houve teste visual integrado em navegador real nesta execução. Recomenda-se confirmar em desktop com janela alta e baixa, e rolar a página: o cartão não deve exibir barra de rolagem interna; o conteúdo deve fluir naturalmente.
