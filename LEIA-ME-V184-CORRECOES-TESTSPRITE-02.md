# Folha do Paiquerê — candidata v184 (correções orientadas pelo TestSprite 02)

## Escopo e cautela

Esta pasta deriva do pacote local v183 disponível para análise. **Não há confirmação de que esse pacote corresponda byte a byte ao conteúdo que o GitHub Pages serviu durante o teste**, e esta candidata não foi publicada no GitHub nem implantada no Firebase. As correções aqui são de código-fonte; não houve alteração de regras Firestore, documentos remotos, contas ou credenciais.

## Correções feitas

1. **Integração final da Área do Estudante:** o fluxo agora usa primeiro `FPCloud.saveEditorialUser`, método realmente exportado pelo cliente Firebase, mantendo fallback para `setEditorialUser`. Se nenhum método estiver disponível, a janela fecha para não bloquear a interface, mas não registra falsamente o aceite. Escape fecha visualmente a integração sem marcar aceite/conclusão e anuncia isso para acessibilidade.
2. **Boas-vindas públicas:** o botão de avanço agora se chama “Próximo”; foi incluído um botão separado “Pular” que encerra o roteiro imediatamente. Escape também encerra o roteiro público, que é opcional. O estado `aria-hidden` e o foco são restaurados ao fechar tanto o roteiro público quanto o fluxo autenticado.
3. **Navegação por função:** os itens restritos recebem tanto a classe `hidden` quanto o atributo `hidden`, e um CSS carregado depois das regras do menu impede que `display:flex` reexiba abas de Editor/Editor-Chefe. O separador editorial também fica oculto para estudantes.
4. **PWA em GitHub Pages de projeto:** manifest links, ícones e `pwa.js` deixaram de apontar para a raiz do domínio; o manifesto e o service worker agora usam caminhos relativos à pasta do projeto, e os links gerados por notificações também permanecem nessa base. O cache offline foi versionado como v184 e precacheia URLs resolvidas a partir do escopo real do service worker.
5. **Diretório público:** “Ano de cadastro” agora usa somente o ano obtido do campo real `createdAt` — não usa o ano de matéria/conquista como substituto. O ano fica visível nos cartões quando existe; na falta do dado aparece “não informado”. A ordenação coloca anos conhecidos do mais recente ao mais antigo, dados ausentes por último e usa nome como desempate.
6. **Rótulo de função de estudante:** o site deixa de inferir “Redator(a)” para contas `Estudante`. Os títulos editoriais continuam sendo mostrados para `Editor` e `Editor-Chefe`, sem separadores vazios na linha do perfil.

## Descobertas do relatório que não justificam alterar dados ou lógica sem reteste

- **Links sociais:** o próprio teste só abre o perfil público e não configura previamente um link social para a conta testada. A aplicação já renderiza links válidos a partir de `socialLinks` e o editor de perfil já tem campos para configurá-los. Não foi inserida uma URL fictícia no perfil real. Se o teste pretende validar a renderização, deve usar uma conta de teste isolada que já tenha um link HTTPS válido.
- **Comentários:** a asserção do relatório procura o texto enviado dentro do botão/controle “Abrir comentários”, não dentro de um item de comentário. O fluxo do código já acrescenta o comentário e chama a renderização da lista após a gravação retornar sucesso. A falha deve ser retestada com um seletor de item da lista (por exemplo, `.comment-item`) e confirmação separada da persistência após recarga; o teste original não é prova suficiente para uma mudança segura no código dos comentários.
- **Ordenação por cadastro:** o roteiro exportado usa `select_option("")`, ou seja, não seleciona o valor `year`. A opção e o tratamento de ordenação já existiam; a UI agora mostra o valor real para permitir uma verificação correta. O teste precisa selecionar `year` explicitamente e comparar anos reais, não exigir que contas sem `createdAt` tenham um ano inventado.
- **Paginação:** apesar do título “Paginate through a long My Articles list”, o roteiro exportado navega para a página pública `noticias.html` e espera que a URL contenha `page=2`; não abre “Minhas matérias” nem verifica um controle de paginação real. Não foi adicionada paginação nova a uma tela diferente sem um teste válido que demonstre esse requisito.
- **Ano escolar:** não foi fabricado `schoolYear` para nenhum aluno. Quando os dados não contêm esse campo, a interface continuará informando que o ano escolar não foi informado.

## Validação já realizada e pendências

- **Aprovado localmente:** `node --check app.js`, `portal.js`, `pwa.js`, `notifications.js` e `folha-notifications-sw.js` (5/5 sem erros de sintaxe).
- **Aprovado localmente:** parse do `manifest.webmanifest` como JSON, existência dos dois arquivos de ícone e verificação estática de que as páginas HTML não mantêm os três tipos de caminho PWA absoluto apontados nesta correção.
- **Não validado por navegador neste ambiente:** tentei executar interações com Playwright, mas o navegador local bloqueou tanto `file://` quanto `http://localhost` com `ERR_BLOCKED_BY_ADMINISTRATOR`. Portanto, não afirmo que os testes E2E foram executados ou aprovados aqui.
- **Obrigatório antes da publicação:** testar a candidata numa branch/cópia de teste, conferir o manifest no endereço `.../Folha-do-Paiquer-teste-02/manifest.webmanifest` e repetir os fluxos TestSprite com contas de teste isoladas. Só depois disso considerar a integração validada em produção.

## Segurança

O PDF do teste contém credenciais em texto puro dentro do código exportado. A senha exposta deve ser trocada/revogada e não deve ser reutilizada em novas execuções. Este pacote não inclui nem copia essas credenciais.
