> **Nota de continuidade — v144:** este documento descreve o diagnóstico da v143 e está mantido apenas como histórico. Como o projeto está no plano Spark e o deploy de Cloud Functions exige Blaze, o caminho operativo agora é o **Plano B** documentado em `GUIA-PLANO-B-SPARK-V144.md`. Não tente implantar `deleteEditorialAccess` para usar o fluxo v144.

# Correção operacional do CORS — deleteEditorialAccess (v143)

## Diagnóstico baseado no código

O código entregue na v142 já contém:

```js
exports.deleteEditorialAccess = onCall(
  { region: 'us-central1', cors: true, invoker: 'public', enforceAppCheck: false },
  async request => { /* handler atual */ }
);
```

O cliente inicializa Firebase Functions na mesma região (`us-central1`) e chama a função com `httpsCallable`. De acordo com a documentação oficial do Firebase, callable functions têm CORS habilitado por padrão; `cors: true` é válido. Portanto, acrescentar mais cabeçalhos no JavaScript do navegador não corrige uma resposta OPTIONS bloqueada antes de chegar ao handler.

Quando `Access-Control-Allow-Origin` está ausente especificamente no preflight, as hipóteses prioritárias são: a função atualizada ainda não foi implantada; o endpoint/projeto/região realmente chamado não corresponde ao pacote; ou a política IAM do serviço Cloud Run/Functions Gen 2 bloqueia a invocação antes da resposta CORS. O relatório do navegador sozinho não distingue esses casos. É necessário executar o deploy e inspecionar o endpoint remoto.

## Passo 1 — implantar apenas a função

Abra o terminal na raiz do projeto, na pasta que contém `firebase.json` e `functions/`, confirme a conta Google e execute:

```bat
firebase.cmd deploy --only functions:deleteEditorialAccess --project folha-do-paiquere
```

Não publique apenas o Hosting esperando que isso altere a função. Aguarde a confirmação de que `deleteEditorialAccess` foi implantada em `us-central1`. Se o comando falhar, guarde a mensagem completa; não considere o problema corrigido.

## Passo 2 — validar a permissão de invocação do Cloud Run

Se o deploy terminar com sucesso e o preflight ainda vier sem CORS:

1. Abra Google Cloud Console → Cloud Run.
2. Selecione o projeto `folha-do-paiquere` e a região `us-central1`.
3. Localize o serviço correspondente à função `deleteEditorialAccess` (confirme pelo nome/URL e não altere outro serviço).
4. Em **Security/Permissions**, confirme que o endpoint permite invocação pública no nível HTTP. Quando permitido pela política da organização, isso normalmente significa ativar **Allow public access** ou conceder `allUsers` a função **Cloud Run Invoker** (`roles/run.invoker`) somente nesse serviço.
5. Salve a alteração e repita o teste de preflight abaixo.

`invoker: 'public'` no código expressa essa intenção para o deploy, mas não prova que a política IAM remota já foi alterada com sucesso. Se a organização bloquear o acesso público, pare e peça ao administrador do projeto que escolha uma arquitetura autorizada; não contorne a política.

**Limite de segurança:** tornar o transporte HTTP acessível não dá autorização para excluir contas. O handler callable continua exigindo autenticação Firebase e validando no servidor o cargo de Editor-Chefe/Master, a proibição de autoexclusão e a proteção da conta Master. Não remova essas verificações. Ainda assim, acesso público ao transporte pode receber chamadas que serão negadas, então mantenha autenticação e monitore os logs.

## Passo 3 — testar o preflight do endereço correto

Use o endereço de origem real mostrado na barra do navegador. O exemplo abaixo usa o domínio padrão do Hosting; substitua o valor `Origin` se o site estiver usando outro domínio. Envie como uma linha no Prompt de Comando ou PowerShell:

```bat
curl.exe -i -X OPTIONS "https://us-central1-folha-do-paiquere.cloudfunctions.net/deleteEditorialAccess" -H "Origin: https://folha-do-paiquere.web.app" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
```

Esperado: resposta HTTP de sucesso (2xx) e um cabeçalho `Access-Control-Allow-Origin` válido; com a configuração `cors: true`, normalmente o valor será `*`. Verifique também `Access-Control-Allow-Methods` e `Access-Control-Allow-Headers` na resposta. Não use `mode: no-cors`: isso esconderia a resposta e não corrigiria a operação.

Interpretação:

- **401/403 sem `Access-Control-Allow-Origin`:** o pedido continua sendo bloqueado na camada de acesso; confira a permissão do serviço Cloud Run e as políticas da organização.
- **404:** a função pode não estar implantada nesse projeto/região ou a URL não corresponde ao endpoint publicado.
- **2xx com CORS válido, mas o botão falha:** abra Network e confira a requisição POST subsequente, o código/ mensagem do Firebase, a URL exata e os logs da função. Nesse caso, o preflight não é mais o problema principal.

## Passo 4 — teste funcional controlado

Após o preflight funcionar, use uma conta de teste não protegida. Entre como Editor-Chefe/Master, exclua a conta de teste e confirme a remoção da identidade no Firebase Authentication, de `users/{uid}`, de `publicProfiles/{uid}` e de autorizações de perfil associadas. Confirme também que matérias, conquistas, pautas e outros conteúdos compartilhados continuam preservados. Não use uma conta real importante como primeiro teste.

## O que este pacote não consegue executar

Este ambiente de edição não tem Firebase CLI nem Google Cloud CLI instalados, nem uma sessão administrativa conectada ao projeto. Assim, não é possível alterar IAM, implantar a função ou inspecionar a resposta remota em nome do usuário. O código-fonte entregue está preparado, mas o CORS só pode ser considerado corrigido depois dos passos de implantação e do teste HTTP real.

## Referências oficiais

- Firebase callable functions e CORS: https://firebase.google.com/docs/functions/callable
- Opções HTTPS de 2ª geração (`cors` e `invoker`): https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.https.httpsoptions.md
- IAM das Cloud Functions de 2ª geração: https://docs.cloud.google.com/functions/docs/securing/managing-access-iam
- Acesso público ao Cloud Run: https://docs.cloud.google.com/run/docs/securing/managing-access
