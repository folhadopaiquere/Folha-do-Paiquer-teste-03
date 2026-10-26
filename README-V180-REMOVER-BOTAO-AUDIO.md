# Folha do Paiquerê v180 — remoção do botão “+ Áudio”

## Escopo
- Base: v179.
- Removido somente o botão visível “+ Áudio” da seção/painel “Adicionar bloco” no editor desktop.
- Removidas as referências desse botão da lista que move os controles para o painel de inserção e da lista de rótulos compactos.
- Os demais controles de inserção foram preservados.

## Preservação do suporte a áudio
- O pedido foi interpretado como remover o botão específico “+ Áudio”, não apagar suporte a blocos de áudio já existentes.
- O bloco/diálogo de áudio, a prévia, o salvamento e a opção “Áudio” do menu de inserção móvel permanecem no código.
- O listener opcional para `#add-audio` permanece inofensivo se o elemento não existir; não foi necessário alterar `editor.js`.

## Firestore e publicação
- `firestore.rules-v180.txt` é uma cópia byte a byte de `firestore.rules`.
- Nenhuma regra, dado remoto ou configuração Firebase foi alterada.
- Nenhum deploy foi realizado.

## Validações
- Confirmado que o botão HTML `id="add-audio"` e o texto “+ Áudio” não permanecem no `editor.html`.
- Confirmado que as opções Texto, Imagem, Enquete e Vídeo continuam na lista do painel de inserção.
- Confirmado que a opção móvel de áudio e o código para abrir/editar blocos de áudio permanecem.
- O HTML foi verificado para confirmar o desaparecimento do controle e a preservação das demais opções.
- Não foi feito teste visual integrado em navegador nesta etapa.
