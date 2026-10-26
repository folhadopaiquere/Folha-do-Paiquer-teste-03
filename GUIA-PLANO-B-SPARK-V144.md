# Guia operacional — Plano B no Firebase Spark (v144)

## O que o botão faz

Na seção **Equipe e acessos**, o menu de contas inativas oferece **Remover perfil e dados**. O fluxo usa Firestore direto e não chama Cloud Functions:

1. valida no cliente que a sessão é Editor-Chefe/Master e bloqueia a própria conta e o Master protegido;
2. atualiza `users/{uid}` com `accessRevoked: true`, limpa os campos de perfil e mantém somente os dados mínimos necessários para identificar a identidade Firebase Authentication;
3. exclui `publicProfiles/{uid}`;
4. tenta excluir documentos pessoais de `profileChangeRequests` associados pelo ID, `studentUid` ou `uid`;
5. mantém artigos, conquistas, pautas e outros conteúdos compartilhados.

As regras Firestore continuam sendo a autoridade do servidor. Uma falha na remoção do perfil público é apresentada como operação parcial; o acesso já revogado não deve ser considerado restaurado.

## Passos seguros

1. Faça backup das regras atuais.
2. Copie e publique **todo** o arquivo `firestore.rules-v144.txt` no Firebase Console → Firestore Database → Regras.
3. Publique apenas o Hosting (não deploy de Functions):

```bat
firebase.cmd deploy --only hosting --project folha-do-paiquere
```

4. Atualize o navegador com recarga forçada e autentique-se com a conta Editor-Chefe/Master.
5. Teste com uma conta não protegida que tenha primeiro sido colocada em **Inativos**. Confirme que o perfil público e as autorizações pessoais foram removidos e que o `users/{uid}` ficou como tombstone revogado.
6. Exclua a identidade manualmente em Firebase Console → Authentication → Users. O e-mail está preservado no registro privado mínimo justamente para ajudar a localizar a conta correta.
7. Depois que Authentication confirmar a exclusão, mantenha o tombstone para registro administrativo ou exclua-o manualmente pelo Firestore Console. Não o apague antes da identidade Auth.

## Se algo falhar

- **Permissão negada ao excluir o perfil público:** confirme que as regras v144 estão publicadas no banco/projeto correto. A regra anterior negava a operação.
- **A conta não pode ser encontrada:** confirme UID e e-mail no documento `users/{uid}` e no Firebase Authentication.
- **Perfil continua aparecendo em outro navegador:** recarregue a página; a lista remota de `publicProfiles` passa a ser a fonte de verdade dos perfis com UID. Em falha de rede, o cache local pode continuar sendo exibido até a próxima sincronização.
- **A pessoa não consegue entrar após a revogação:** comportamento esperado; o documento tombstone permanece para que `firebaseSignIn` detecte `accessRevoked: true`.
- **Restauração antes de excluir a conta Auth:** use **Reativar conta**. Isso recria um perfil público vazio; os dados pessoais de perfil removidos não são recuperados.

## Limitações explícitas

O fluxo não apaga a conta Firebase Authentication por código, não tenta remover arquivos Cloudinary e não apaga matérias/conquistas/conteúdo coletivo. Ele foi escolhido para evitar a dependência de Cloud Functions no plano Spark. Não publique a pasta `functions/` com um deploy geral.
