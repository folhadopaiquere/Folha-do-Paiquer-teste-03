# Folha do Paiquerê — v175: rolagem do perfil, filtros de conquistas e cargo no perfil público

## Base e limites

- Base: pacote completo `Folha-do-Paiquere-v174-reenvio.zip` (v174).
- A v174 original foi preservada; a v175 é uma cópia separada.
- Nenhum deploy foi realizado e não houve escrita no Firebase/Firestore remoto.
- `firestore.rules-v175.txt` é uma cópia byte a byte de `firestore.rules`. As regras não foram alteradas.
- Não foram removidos arquivos, funções, listeners, IDs, dados, campos de perfil ou destinos de navegação.

## Alterações realizadas

### 1. Perfil público em computadores: rolagem normal

- Adicionada a folha isolada `fp-v175-targeted-polish.css`, carregada somente por `perfil.html` e `conquistas.html`.
- Em telas com largura de 900 CSS px ou mais, o botão `Voltar` permanece no fluxo normal da página e a coluna lateral do perfil deixa de ser `sticky` e deixa de criar uma área de rolagem própria.
- O cartão de identidade e suas informações acompanham a rolagem normal do documento.
- A moldura/foto continua a usar a coluna lateral como referência de posicionamento (`position: relative`), preservando a foto sobreposta.
- As regras de rolagem móvel e os trilhos horizontais de “Últimas contribuições” e “Mural de conquistas” não foram alterados nesta versão.

### 2. Conquistas: largura da pesquisa e ordem dos filtros

- A ordem existente continua a ser: pesquisa, ordenação (“Mais recentes”) e ano (“Todos os anos”). Portanto, no computador o filtro de ano aparece à direita do seletor “Mais recentes”.
- A grade desktop reserva menos proporção para a pesquisa e mais largura para os dois seletores, reduzindo o risco de os filtros ficarem apertados.
- Em larguras de 601 a 900 px, a pesquisa fica na linha superior e os dois seletores ocupam a linha seguinte; em larguras até 600 px, a apresentação compacta existente continua empilhada.
- A lógica dinâmica em `app.js` permanece sendo a fonte dos anos; não foi introduzida uma lista de anos fixa nem foi alterado o comportamento dos filtros.

### 3. Perfil público: cargo profissional no lugar do aviso de ano escolar

- O renderizador do perfil público em `app.js` agora reconhece os valores profissionais já suportados pelo campo `assignedTitle`: `Professor(a)`, `Pedagogo(a)`, `Diretor(a)`, `Secretário(a)` e `Secretário(a) e Pedagogo(a)`.
- Para esses valores, o cartão exibe o cargo em vez de “Ano escolar não informado” e não repete o mesmo cargo em uma segunda posição.
- Para estudantes, o ano escolar continua a ser exibido como antes; se não existir, o texto “Ano escolar não informado” permanece. Outros valores não profissionais mantêm o comportamento anterior.
- Os dados gravados, `schoolYear`, `assignedTitle`, o cargo editorial (`Estudante`/`Editor`/`Editor-Chefe`) e as permissões não são modificados. A mudança só altera como a linha de identificação é composta no perfil público.
- `portal.js` e os formulários da Área do Estudante não foram editados.

## Arquivos alterados em relação à v174

- `app.js` — renderização da linha de identificação do perfil público.
- `perfil.html` — inclusão da folha v175 após a folha v174.
- `conquistas.html` — inclusão da folha v175 após a folha v174.
- `fp-v175-targeted-polish.css` — nova camada CSS isolada.
- `README-V175-POLIMENTO.md` — este relatório.
- `firestore.rules-v175.txt` — cópia integral idêntica das regras atuais.

## Validações concluídas

- `node --check` executado nos 14 arquivos JavaScript: sem erros de sintaxe.
- Parser CSS (`tinycss2`) executado nas 42 folhas CSS: nenhum erro de parsing.
- 14 documentos HTML analisados: nenhum ID duplicado nem referência local ausente detectada.
- Confirmado que `perfil.html` e `conquistas.html` carregam a nova folha uma única vez, depois de `fp-v174-targeted-polish.css`.
- Confirmado por comparação byte a byte que `firestore.rules-v175.txt` corresponde a `firestore.rules`.
- Diferença em relação à v174 limitada aos arquivos listados acima.

## Limitação de teste

Não foi possível confirmar a renderização por teste visual integrado em navegador nesta execução. As validações descritas são estáticas; antes da publicação, testar o perfil desktop com rolagem longa e diferentes alturas de janela, a linha de pesquisa/filtros em larguras próximas de 900–1200 px e os cargos profissionais/estudantis com dados reais de teste.
