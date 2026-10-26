# Folha do Paiquerê v169 — Polimento Direcionado

## Base e compromisso de preservação

- **Base de trabalho:** projeto completo da v168.
- **Nova entrega:** v169, em uma cópia separada. A v168 original não foi sobrescrita.
- **Escopo desta rodada:** acabamento do carrossel inicial em celulares, cards da Home, rodapé dos cards de notícias, modal de compartilhamento, ícone Configurações, brasão móvel e prevenção de transbordamento horizontal no perfil público.
- **Área do Estudante / editor:** não houve reformulação da interface nem alteração das regras de cargos. A única alteração a `app.js` no editor público é o ajuste de markup do footer dos cards da Home e os pontos públicos descritos abaixo.
- **Firebase:** não houve migração de dados, mudança de regras, deploy ou acesso ao projeto remoto. O plano Spark/gratuito continua sendo o pressuposto; não foram introduzidas Cloud Functions ou dependências pagas.

O princípio para continuar o projeto é manter tudo o que não foi explicitamente solicitado. Não remover ou reescrever funções funcionais por preferência estética, e sempre comparar a nova versão com a base antes de gerar a entrega.

## Mudanças implementadas

### 1. Home — indicadores do carrossel

- Os indicadores de posição do carrossel (`#home-feature-dots`, botões `.fp-home-dot`) voltam a aparecer no centro inferior do cartão em telas compactas.
- O visual usa pequenos pontos arredondados, fundo translúcido discreto e um indicador ativo ligeiramente mais largo.
- As setas laterais continuam ocultas no celular; o gesto horizontal e os eventos existentes dos pontos permanecem ativos.
- O temporizador já existente em `app.js` avança o carrossel a cada **5.000 ms**. Foi preservado, sem duplicar intervalos nem alterar a lógica de pausa/visibilidade/redução de movimento.
- A área de texto do destaque recebeu espaço inferior adicional para não se sobrepor aos pontos.

### 2. Home — cards de “Últimas notícias”

- A lista compacta agora fica empilhada verticalmente, uma matéria por linha, no lugar da apresentação horizontal com a imagem na lateral.
- O visual foi aproximado do feed da página Notícias: imagem de capa na largura do card, etiquetas e data, título, resumo com limite de linhas e rodapé.
- O botão “Ler matéria” aparece antes dos contadores no markup; o CSS o mantém com largura intrínseca (`max-content`) e deixa curtidas/comentários/visualizações numa linha compacta à direita.
- As etiquetas de tema e o destaque ganharam um pequeno aumento de tamanho, com `min-width: 0`, `max-width`, `overflow: hidden` e reticências para não provocar overflow horizontal.
- Os handlers e a renderização dos contadores existentes não foram substituídos.

### 3. Página Notícias — metadata, categorias e rodapé

- Data e tempo de leitura são alinhados à esquerda.
- As etiquetas de categoria/destaque são ligeiramente maiores e continuam flexíveis, com truncamento em espaços estreitos.
- O rodapé do card usa uma linha: “Ler matéria” à esquerda e contadores à direita. O link de leitura não ocupa toda a largura restante e os contadores não são comprimidos por um botão expansivo.
- Em telas muito estreitas, os elementos conservam tamanho compacto; a validação visual completa no aparelho físico ainda é necessária.

### 4. Modal de compartilhamento dentro da matéria

- O botão **“Mais opções de compartilhamento”** e seu listener foram removidos, conforme solicitado.
- Permanecem WhatsApp, E-mail e Copiar link. A cópia ainda inclui o fallback existente quando `navigator.clipboard` não estiver disponível.
- A alteração não mexe na barra de ações da matéria (curtir, comentários, áudio, baixar/ imprimir e abrir compartilhamento), nem remove o recurso geral de compartilhamento por link.

### 5. Ícone de Configurações e brasão do cabeçalho móvel

- O SVG de `icons.settings` em `fp-v166-public-mobile.js` foi substituído por um símbolo de engrenagem simétrico e centrado. A chave do ícone, o botão, o rótulo acessível, o popover e seus listeners foram mantidos.
- O brasão central do cabeçalho compacto passou de 2,55 rem para 3 rem, com altura mínima do cabeçalho e espaçamento superior do corpo ajustados em conjunto. Isso evita que o brasão aumente e colida com o conteúdo logo abaixo.

### 6. Perfil público — proteção contra overflow horizontal

A raiz do problema visual era a combinação de regras antigas de grade desktop, dimensões do cartão de fundo e contêineres de largura mínima. A correção é restrita ao modo compacto:

- O cálculo de largura do fundo personalizado passa a usar `100%` em viewport até 767 px, em vez de usar a borda da coluna lateral como largura do papel de parede.
- A coluna da página principal, `#profile-page`, `.fp-public-profile-page`, `.fp-public-profile-layout`, `.fp-profile-sidebar` e `.fp-profile-main` passam a declarar largura máxima de 100%, `min-width: 0` e `box-sizing: border-box` no modo compacto.
- O grid público força uma coluna em celular e impede que a regra residual de desktop deixe a coluna direita fora da viewport.
- A página impede rolagem horizontal global, mas os carrosséis próprios do perfil preservam seu `overflow-x: auto`; portanto, os cards horizontais internos continuam navegáveis.
- Não houve mudança em dados de perfil, papéis/cargos ou regras de autorização.

## Arquivos alterados ou adicionados

Comparação com a árvore da v168:

- `app.js` — três alterações localizadas: ordem do footer dos cards da Home, remoção do botão/listener redundante do modal e largura do fundo de perfil em viewport compacto.
- `fp-v166-public-mobile.js` — redesenho somente do SVG `icons.settings`; os handlers não mudaram.
- `index.html`, `noticias.html`, `noticia-single.html`, `perfil.html`, `sobre.html`, `conquistas.html`, `participar.html` — inclusão da nova folha no fim da cascata pública.
- `fp-v169-public-mobile-polish.css` — nova folha CSS isolada para os ajustes da v169.
- `README-V169-POLIMENTO.md` — este documento.
- `firestore.rules-v169.txt` — cópia completa do arquivo `firestore.rules` da base, sem alterações.

Não foram removidas páginas ou arquivos do projeto. `painel.html` e `editor.html` não receberam a nova folha de estilos.

## Verificações efetuadas

- **JavaScript:** 14 arquivos `.js` verificados com `node --check`, sem erros de sintaxe.
- **CSS:** 38 folhas analisadas com `tinycss2`, sem erros de parsing.
- **HTML:** 14 páginas analisadas; nenhum ID duplicado encontrado.
- **Referências locais:** não foram encontradas referências locais ausentes depois de tratar caminhos iniciados por `/` como relativos à raiz de publicação.
- **Inclusão da nova folha:** cada uma das sete páginas públicas contém exatamente uma referência a `fp-v169-public-mobile-polish.css`.
- **Compartilhamento:** a string `news-share-native` e o texto “Mais opções de compartilhamento” não existem mais em `app.js`; os três controles restantes estão presentes.
- **Carrossel:** o temporizador existente permanece configurado para 5 segundos.
- **Regras:** `firestore.rules-v169.txt` foi copiado do arquivo `firestore.rules`; as regras não foram alteradas nesta rodada.
- **ZIP:** será verificada a integridade do pacote final com `unzip -t`.

### Limitação conhecida

Tentei carregar a página local num Chromium headless por um servidor HTTP temporário, mas o navegador foi bloqueado pelo ambiente com `ERR_BLOCKED_BY_ADMINISTRATOR`. Assim, não foi possível validar a aparência da aplicação completa em navegador nem conferir os dados reais do Firebase. Os testes acima são estáticos; não equivalem a testes integrados de todas as interações.

## Roteiro de teste manual recomendado

1. Em `index.html`, conferir os pontos do carrossel no centro inferior, deslizar entre novidades e verificar a rotação automática de 5 segundos (exceto quando o usuário/sistema pausa o movimento).
2. Em “Últimas notícias”, conferir a lista vertical e comparar o card com o feed Notícias. Confirmar que “Ler matéria” conserva somente a largura necessária e que curtidas, comentários e visualizações cabem à direita.
3. Abrir uma matéria, abrir Compartilhar e conferir que existem WhatsApp, E-mail e Copiar link, sem o botão “Mais opções de compartilhamento”.
4. Conferir a simetria da engrenagem e o tamanho do brasão no cabeçalho móvel, em tema claro e escuro.
5. Em `perfil.html`, rolar o perfil até o fim e conferir que nenhuma coluna ou área vazia empurra a página horizontalmente. Confirmar que os carrosséis internos continuam aceitando gesto horizontal.
6. Repetir em 360 px, 390 px e 430 px CSS, em zoom 100% e 125% quando possível.
7. Só depois de validar localmente, fazer deploy. Nenhuma publicação foi executada durante esta atualização.

## Instrução à próxima IA

Use a v169 como base apenas depois de o responsável confirmar que os testes manuais passaram. Se for necessário ajustar algum detalhe, mantenha as mudanças localizadas e compare sempre contra a v168. Não faça mudanças nas regras Firestore por um problema puramente visual. Se, no futuro, precisar alterar regras, entregue **o arquivo completo** pronto para copiar e colar e explique por que a mudança é necessária.
