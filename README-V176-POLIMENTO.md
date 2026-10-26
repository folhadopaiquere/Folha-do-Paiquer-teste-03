# Folha do Paiquerê — v176: perfil desktop fixo, cargos no diretório e filtro mais limpo

## Base e preservação

- Base: pacote `Folha-do-Paiquere-v175.zip` recebido/produzido na etapa anterior.
- A pasta e o ZIP da v175 foram preservados; esta entrega é uma versão separada.
- Nenhum deploy foi realizado e não houve alteração no Firebase/Firestore remoto.
- `firestore.rules-v176.txt` é uma cópia integral, byte a byte, de `firestore.rules`; as regras não precisaram mudar.
- Não foram removidos arquivos da versão anterior, funcionalidades, IDs de controle ou listeners.

## Alterações desta versão

### 1. Perfil público no computador: manter botão Voltar e identidade visíveis durante a rolagem

- A v175 tinha definido `position: static` para `.fp-profile-topbar` e `position: relative` para `.fp-profile-sidebar`, o que fazia o botão e o cartão saírem da área visível durante a rolagem. Esta versão corrige esse sentido.
- Em telas com largura de 900 CSS px ou mais, o botão Voltar fica em uma faixa `position: sticky` logo abaixo do cabeçalho público fixo.
- A coluna de identidade (avatar e cartão com nome, cargo, biografia e redes) também usa `position: sticky`, posicionada abaixo do botão, de modo que ambos permaneçam visíveis enquanto o conteúdo longo da coluna direita rola.
- Em telas de menor altura, o bloco da identidade tem altura máxima relativa à viewport e rolagem interna como proteção contra corte de conteúdo. A rolagem principal da página e os rails horizontais da direita continuam independentes.
- O CSS é escopado a `min-width: 900px`; o comportamento móvel não foi alterado.

### 2. Diretório “Sobre”: mostrar cargo profissional no lugar de “Ano escolar não informado”

- O renderizador de `initAboutDirectory()` em `app.js` agora utiliza a mesma lista de posições profissionais que o perfil individual: `Professor(a)`, `Pedagogo(a)`, `Diretor(a)`, `Secretário(a)` e `Secretário(a) e Pedagogo(a)`.
- Para esses cargos, a posição é apresentada como primeira informação da linha e não repetida numa segunda etiqueta.
- Para estudantes e outros valores, a apresentação anterior é mantida.
- Nenhum dado salvo foi reescrito. `schoolYear`, `assignedTitle` e `role` continuam separados; o cargo editorial continua visível como antes.

### 3. Conquistas: reduzir poluição visual do filtro em computadores

- Em telas desktop (a partir de 901 CSS px), o painel de filtro recebe superfície mais simples, sombra mais suave, espaçamento mais contido e campos com alturas/bordas consistentes.
- A pesquisa, o seletor “Mais recentes” e o seletor “Todos os anos” mantêm seus IDs, ordem, valores e listeners atuais.
- A regra não altera chips, filtro móvel, carregamento dinâmico de anos, dados de conquistas nem renderização dos cartões.

## Arquivos modificados em relação à v175

- `app.js` — renderização dos cartões do diretório “Sobre”.
- `perfil.html` — carrega a folha v176 depois das folhas anteriores.
- `conquistas.html` — carrega a folha v176 depois das folhas anteriores.
- `fp-v176-targeted-polish.css` — nova camada isolada para sticky desktop e acabamento do filtro.
- `README-V176-POLIMENTO.md` — este relatório.
- `firestore.rules-v176.txt` — cópia integral das regras existentes, para consulta; não é necessário republicar regras.

## Validações feitas

- Verificação sintática com `node --check` em todos os arquivos JavaScript do pacote.
- Parsing das folhas CSS com `tinycss2`.
- Verificação estática dos IDs HTML duplicados e referências locais.
- Confirmada a inclusão da folha v176 uma única vez em `perfil.html` e `conquistas.html`.
- Confirmado que `firestore.rules-v176.txt` é idêntico a `firestore.rules` por comparação de hash.
- Confirmado que nenhum arquivo da v175 foi removido e que as diferenças de conteúdo estão limitadas aos arquivos listados acima.

## Limitações

Não foi concluído um teste visual integrado em navegador nesta execução. Antes de publicar, conferir com dados reais: rolagem longa no perfil desktop (incluindo janela baixa), comportamento de scroll interno do cartão quando a biografia é longa, filtro de conquistas em larguras de 901–1200 px e apresentação de perfis profissionais na página “Sobre”.

## Observações para evolução futura (não implementadas nesta versão)

- **Google Sheets dentro de uma matéria:** é possível implementar um bloco de incorporação dedicado, mas o editor visual atual não deve aceitar HTML/iframe arbitrário. A implementação deve validar a origem e gerar o iframe no renderizador público e na prévia do editor; o proprietário deve publicar no Google Sheets somente as abas/dados destinados a serem vistos publicamente.
- **Notificações web mesmo com o site fechado/deslogado:** o pacote já possui manifest PWA, registro de service worker e um listener `push` que exibe notificações, mas a entrega remota ainda precisa de inscrição/consentimento por navegador/dispositivo e um emissor confiável. FCM não tem custo por si só, mas a automação por gatilho do Firestore usando Cloud Functions não está disponível no plano Spark. Isso requer uma decisão de arquitetura separada e não foi incluído no polimento.
