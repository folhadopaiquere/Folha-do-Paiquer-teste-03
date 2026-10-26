# Folha do Paiquerê — migração Firebase

## Estrutura em 3 ondas

### Onda 1 — Essencial
- Firebase Authentication com e-mail/senha.
- Perfil editorial por UID.
- Cargos: Estudante, Editor e Editor-Chefe.
- Firestore para matérias.
- Fila de moderação.
- Feed público em tempo real para matérias aprovadas.
- Cloudinary para toda a mídia do portal (imagens e outros formatos suportados).
- Vídeos no portal são referenciados somente por links do YouTube; não são enviados como arquivos.
- Modo local continua como fallback até `enabled: true`.

### Onda 2 — Interatividade e perfis
Preparada nas collections/regras:
- `publicProfiles`
- `achievements`
- `comments`
- `reactions`
- `pollVotes`

A UI existente continua funcionando localmente enquanto o backend é ativado gradualmente.

### Onda 3 — Comunicação avançada
Preparada nas collections/regras:
- `chatGroups`
- `suggestions`


## Configuração

1. Crie um projeto no Firebase.
2. Ative Authentication > Email/Password.
3. Crie o Cloud Firestore.
4. Crie/configure uma conta Cloudinary e um upload preset sem assinatura (unsigned) restrito aos formatos/tamanhos do projeto.
5. Preencha `cloudinary-config.js` com o `cloudName` e o `uploadPreset`, mantendo `enabled: true`.
6. Copie a configuração Web para `firebase-config.js` e mantenha `enabled: true`.
7. Publique `firestore.rules` e `firestore.indexes.json` quando necessário; `storage.rules` não participa do armazenamento de mídia desta versão.
7. Para cadastro administrativo, publique `functions/` e mantenha as funções protegidas.

## Atenção
As regras são parte da segurança. Não use apenas verificações de cargo no JavaScript para proteger escrita/edição. O front-end é UX; o Firestore Security Rules e as Cloud Functions são a autoridade.

A configuração do Firebase Web não contém uma senha privada. Não coloque chaves privadas de Admin SDK em arquivos públicos.


## Correções da Onda 1 — v34

- Exclusão de matérias agora remove também o documento correspondente no Firestore, em vez de apenas no cache local.
- O painel/editor sincronizam as matérias editoriais diretamente do Firestore após a recuperação da autenticação. Estudantes carregam as próprias matérias; Editores e Editores-Chefe carregam a fila permitida.
- O envio para revisão e a publicação retornam ao painel por navegação explícita após salvar.
- Listagens de matérias deduplicam por ID para impedir duplicação visual.
- Cadastro de novos acessos aceita endereços de e-mail válidos em geral; a autorização continua restrita a Editor-Chefe.
- Alteração de cargo, revogação e restauração usam Cloud Functions no Firebase.
- O artigo do próprio autor pode ser lido mesmo enquanto está em Rascunho, Pendente ou Ajustes.
- Atualizações locais da área pública não tentam escrever no Firestore sem uma intenção editorial autenticada.

## Estado desta versão

A configuração Web do projeto `folha-do-paiquere` já está preenchida e `enabled` está como `true`.

Também foram aplicados estes endurecimentos:
- autores só podem criar/editar seus próprios rascunhos e matérias em ajustes;
- autores não podem mudar uma matéria para `Aprovado`;
- Editores podem trabalhar na fila `Pendente`;
- o Administrador Master não pode ter o cargo alterado nem o acesso revogado pelas Cloud Functions;
- uploads de mídia passam pelo Cloudinary, com limites de tipo/tamanho;
- imagens `data:` de matérias, perfis, conquistas e demais pontos suportados são comprimidas e enviadas ao Cloudinary antes do armazenamento principal;
- o Firestore guarda somente os dados e URLs/referências das mídias;
- novos uploads de vídeo são bloqueados no portal: vídeos são inseridos somente por URL do YouTube;
- `sobre.html` participa do runtime Firebase;
- `.firebaserc` aponta para `folha-do-paiquere`;
- Firebase Hosting já está configurado para servir o site.

## O que ainda precisa ser feito no Console Firebase

1. Authentication: ativar Email/Password.
2. Criar o banco Cloud Firestore.
3. Criar/configurar a conta e o upload preset do Cloudinary.
4. Criar a conta do Administrador Master em Authentication.
5. Criar manualmente o documento `users/{UID_DO_MASTER}` com pelo menos `uid`, `email`, `name`, `role: "Editor-Chefe"`, `accessRevoked: false`, `contributions: []` e `avatar: ""`.
6. Criar o documento correspondente em `publicProfiles/{UID_DO_MASTER}`.
7. Instalar/deployar as funções e as regras deste pacote.

## Deploy

Com o Firebase CLI autenticado na conta proprietária do projeto:

```bash
firebase use folha-do-paiquere
firebase deploy --only firestore,functions,hosting
```

Para atualizar só as regras, use:

```bash
firebase deploy --only firestore
```

O CLI suporta deploy seletivo por serviço e o deploy das regras locais substitui as regras correspondentes configuradas no Console.

## Observação de teste

Neste ambiente eu não tenho uma sessão autenticada na sua conta Firebase e o Firebase CLI não está instalado localmente. Portanto, não consigo publicar os recursos na sua conta nem confirmar a autenticação de um usuário real daqui. O pacote está preparado para isso; o teste real começa após o primeiro deploy.

## Bootstrap inicial do Editor-Chefe

O projeto foi preparado para o UID administrativo `lS9e7GzRx2XmfuPdnxNpMjNCpqe2` já criado no Firebase Authentication.
Abra `firebase-bootstrap.html` uma única vez, informe as credenciais dessa conta e inicialize o documento `users/{UID}` e `publicProfiles/{UID}` com o papel `Editor-Chefe`.

Após a inicialização, o arquivo pode ser removido do servidor. A exceção de bootstrap em `firestore.rules` também deve ser removida se esta conta já estiver persistida como administradora e não houver necessidade de recriá-la.

## Política de mídia

Imagens recebidas como Data URL são redimensionadas e convertidas preferencialmente para WebP antes do upload ao Cloudinary. O Firestore guarda os dados da matéria e somente as URLs/referências das mídias; a mídia binária não é incorporada ao documento.

Vídeos não são enviados como arquivos. O editor aceita somente URLs do YouTube, que são normalizadas para incorporação no artigo. Outros formatos de mídia suportados pelo projeto seguem a mesma regra: arquivo de mídia fica no serviço externo, enquanto o Firestore guarda apenas a referência.

## v38 — fluxo de publicação estabilizado
- Removido o botão/fluxo de “Salvar rascunho” da interface do editor.
- O fluxo normal agora é “Enviar para revisão”.
- A matéria é persistida localmente primeiro e fica marcada para sincronização com Firebase.
- A Mesa do Editor preserva visualmente matérias pendentes de sincronização, evitando que um fetch remoto imediato as faça desaparecer.
- Há nova tentativa automática em segundo plano para itens pendentes.
- Mantida a configuração Firebase Web funcional informada pelo projeto.

## v140 — janela editorial protegida

Na v140, a primeira aprovação cria `approvedAt` e `editorEditUntil` como timestamps do Firestore. Reaprovações de matérias já publicadas preservam a janela original e não podem reiniciar os sete dias. Não converta datas antigas no navegador para conceder um prazo novo; publicações legadas sem timestamps confiáveis exigem análise do Editor-Chefe. Consulte `README-V140-POLIMENTO.md` e use o conteúdo integral de `firestore.rules-v140.txt` em **Firestore Database → Regras** depois de atualizar os arquivos do site.
Na política v140, `publicationHistoryLegacy` e o campo `visible` são considerados para não transformar uma publicação legada devolvida à fila em uma primeira publicação artificial. Registros antigos sem histórico detectável continuam exigindo teste manual antes de liberar regras.

## Fluxo de revogação no plano Spark — v144

Na v144, a interface não chama a Cloud Function `deleteEditorialAccess`. Para compatibilidade com o plano Spark, o botão de conta inativa grava um tombstone revogado em `users/{uid}`, limpa os campos pessoais do perfil, remove `publicProfiles/{uid}` e tenta limpar autorizações pessoais em `profileChangeRequests`. A identidade de Firebase Authentication precisa ser excluída manualmente no Console. Use apenas `firebase.cmd deploy --only hosting --project folha-do-paiquere` para publicar o código estático; antes, publique manualmente as regras completas em `firestore.rules-v144.txt`. Não execute deploy abrangente ou Functions neste plano.
