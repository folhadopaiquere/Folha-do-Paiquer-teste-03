# Folha do Paiquerê v183 — diagnóstico direcionado de persistência

## Base e cautela de implantação

Esta cópia foi preparada sobre o pacote local v182 enviado anteriormente. Ela **não foi publicada** no Firebase nem no GitHub Pages. A inspeção da listagem e dos arquivos disponíveis no repositório de teste aponta uma possível diferença entre o pacote local e a raiz publicada: as páginas HTML incluem `storage.js`, mas o arquivo não aparece na listagem Markdown anexada, que termina em `pwa.js`; na inspeção remota anterior, a URL bruta de `storage.js` retornou 404. A listagem anexada não é, por si só, um inventário completo; confirme no painel do repositório que `storage.js` realmente está na raiz publicada.

Essa confirmação é essencial: `index.html`, `editor.html` e `painel.html` incluem `storage.js`. Sem essa camada, `window.FPStore` pode não inicializar. O editor tinha um fallback que salvava apenas no navegador e retornava o artigo como se a operação tivesse sido concluída, mesmo quando a operação exigia confirmação remota. A v183 muda esse comportamento para falhar de forma explícita, em vez de indicar sucesso não confirmado.

**Atenção:** o código da v183 é um candidato baseado no pacote local v182. Como não foi possível obter uma cópia completa verificável da versão remota em um ZIP, não substitua às cegas todos os arquivos do GitHub por este pacote se houver alterações exclusivas na branch. Primeiro compare o código e mantenha o arquivo `storage.js` na raiz publicada.

## Confirmações consideradas como corretas

- O relato de acesso de estudante à área editorial foi explicado pelo papel real da conta de teste (`Editor-Chefe`); as regras e verificações de papel não foram afrouxadas.
- A página pública Sobre foi confirmada pelo usuário como funcional após atualizar a página; não foi alterada.
- Impressão/PDF, votação em enquete e leitura em voz alta foram confirmados pelo usuário como funcionais; esses caminhos não foram modificados.
- Os avisos, Minhas Matérias e a revisão editorial não foram reformulados em bloco. Somente o mecanismo compartilhado de persistência necessário à publicação recebeu tratamento defensivo.

## Arquivos-fonte alterados

### `portal.js`

- Incluída uma função local `saveUsersLocal()` que, quando `FPStore.setUsersLocal` está disponível, usa essa camada; se ela estiver ausente, atualiza o cache `fp_users` local sem tentar regravar em lote documentos remotos.
- Aplicada ao carregamento inicial do perfil a cópia local dos dados mais recentes vindos de `users/{uid}`.
- Usada após salvar perfil e fundo do perfil para que a tela não dependa silenciosamente de uma camada `FPStore` ausente para atualizar a apresentação.
- O fluxo de edição continua usando as permissões originais da sessão. Nenhum papel ou autorização foi concedido por este ajuste.

### `firebase-client.js`

- Adicionada `syncPublicProfileFromUser(uid)`: lê novamente o documento canônico `users/{uid}` e constrói o espelho público com os mesmos valores reais/defaults que as regras do Firestore comparam. Isso evita reconstruir o espelho a partir de uma sessão/cópia local possivelmente desatualizada.
- A função é chamada depois de salvar os campos do perfil e o fundo personalizado. Se o documento principal tiver sido gravado mas o espelho público falhar, a interface diferencia esses dois resultados em vez de sugerir que nada foi salvo.
- Incluída uma pré-verificação para matérias com histórico editorial legado. Se o registro não tiver uma janela de aprovação confiável e o usuário não for Editor-Chefe, a operação recebe uma mensagem explícita. Isso preserva as regras existentes de janela de edição; não amplia o prazo nem afrouxa permissões.

### `editor.js`

- O campo de URL de capa só passa a ser considerado uma capa ativa depois que o navegador confirma o carregamento real da imagem (`load`/dimensões naturais). URLs que retornam HTML, erro ou imagem inacessível são rejeitadas.
- A mensagem da prévia informa que carregar a imagem não a salva sozinho; o autor precisa salvar o rascunho ou enviar/publicar pelo fluxo editorial permitido.
- Se a camada `FPStore.upsertArticle` não tiver carregado, uma ação que exige confirmação remota agora apresenta erro explícito em vez de retornar silenciosamente um sucesso local.

### `storage.js`

- Em falha definitiva de publicação, preserva o conteúdo recém-editado quando o item anterior era um rascunho/em revisão e restaura os metadados do fluxo editorial anterior, evitando que o registro local seja apresentado indevidamente como publicado.
- Se já havia uma versão aprovada, a recuperação conserva a versão previamente armazenada em vez de substituir a publicação por conteúdo recusado pelo servidor. Para um item novo, o conteúdo permanece como rascunho não visível.
- A sincronização de perfil em lote usa a função de espelho canônico quando disponível; regras do Firestore não foram modificadas.

### `folha-notifications-sw.js`

- Atualizada somente a chave/nome do cache para que a nova versão não continue usando os arquivos estáticos antigos de um cache previamente criado.

## Regras do Firestore

`firestore.rules` **não foi alterado**. O arquivo integral `firestore.rules-v183.txt` foi copiado da versão existente e deve ser usado apenas para comparação/consulta; não publique regras por causa desta correção.

## Verificações executadas

- `node --check` nos 13 arquivos JavaScript clássicos e `node --input-type=module --check` no `firebase-client.js`: sem erros de sintaxe.
- 47 folhas CSS analisadas com o parser CSS: sem erros.
- 14 páginas HTML verificadas: sem IDs duplicados e sem referências locais ausentes ao resolver os caminhos em relação à raiz do pacote.
- Manifesto web validado como JSON.
- ZIP conferido com `unzip -t` após empacotamento.
- `firestore.rules` comparado com o arquivo v182 por hash: idêntico.

Esses são testes estáticos. Não foi possível executar uma sessão integrada no navegador com acesso ao Firebase real nesta rodada. Portanto, não se afirma que as alterações estejam comprovadas em produção.

## O que deve ser retestado no GitHub Pages

1. Confirmar que `storage.js` responde com HTTP 200 e `window.FPStore` está inicializado nas páginas `editor.html`, `painel.html` e `index.html`.
2. Alterar uma biografia e uma rede social autorizadas; salvar; recarregar; conferir `users/{uid}`, `publicProfiles/{uid}`, a tela privada e o perfil público. Verificar também a alteração do fundo/recorte.
3. Colar uma URL HTTPS de imagem direta que carregue; confirmar a prévia. Salvar a matéria/rascunho, sair do editor, reabrir e verificar a URL; depois executar o fluxo de revisão/publicação permitido e conferir o feed público.
4. Testar uma URL inválida ou não direta: deve ser rejeitada sem substituir uma capa válida já selecionada.
5. Se a publicação ainda falhar, registrar o texto exato exibido, `error.code` e os erros do Console/Network. Não afrouxar as regras para “fazer funcionar” sem diagnosticar a causa.

## Observação de hospedagem separada (não alterada nesta correção)

Há caminhos com barra inicial no HTML/manifesto (por exemplo, `/pwa.js` e os ícones em `/assets/...`). No GitHub Pages de projeto, servido sob `/Folha-do-Paiquer-teste-1/`, caminhos iniciados por `/` apontam para a raiz do domínio e podem falhar. Esse assunto corresponde aos testes do PWA/cache e foi registrado para uma correção própria, sem ampliar o escopo desta rodada.
