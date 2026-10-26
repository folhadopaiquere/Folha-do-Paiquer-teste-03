FOLHA DO PAIQUERÊ — V45 — MÍDIA NO CLOUDINARY

Esta versão remove o Firebase Storage do fluxo do portal. Firebase Auth e Firestore continuam sendo usados para autenticação, permissões e dados.

Mídia
- Imagens de matérias (capa, miniatura e imagens no editor): Cloudinary.
- Fotos de perfil e grupos: Cloudinary.
- Fotos de conquistas e avisos: Cloudinary.
- Anexos de pautas (imagens/PDF/DOC/DOCX/TXT): Cloudinary.
- Fotos do chat: Cloudinary.
- Vídeos de matérias: somente link do YouTube; não há upload de vídeo local.
- Firestore/localStorage não devem receber novos Base64 de mídia persistente.

Configuração
1. Crie um ambiente no Cloudinary.
2. Crie um Upload Preset UNSIGNED para navegador.
3. Restrinja o preset: formatos permitidos, tamanho máximo e bloqueio de public_id fornecido pelo usuário.
4. Preencha cloudinary-config.js com cloudName e uploadPreset e troque enabled para true.
5. Abra cloudinary-diagnostico.html e confirme “UPLOAD OK”.

Segurança
- Não coloque API Secret no código do site.
- O preset unsigned fica visível no navegador; proteja-o por limites de tamanho/formato e troque o nome se houver abuso.

Compatibilidade
- Artigos sem novas mídias continuam podendo ser editados/publicados.
- Uma falha no Cloudinary impede apenas a persistência nova da mídia, preservando o rascunho local da matéria.


--- v46: limpeza de mídia e correção do editor ---

O editor não usa mais canvas.toDataURL() para gerar miniatura durante a edição. Isso evita o erro 'Tainted canvases may not be exported' quando o Fabric carrega imagens externas do Cloudinary.

As matérias agora registram mediaRefs para permitir a limpeza de arquivos substituídos ou excluídos. A exclusão definitiva do asset no Cloudinary ocorre por uma Cloud Function, nunca expondo API Secret no navegador.

Para habilitar a limpeza no ambiente Firebase, configure no Functions os segredos: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET e publique as Functions. A API Secret deve permanecer somente no ambiente servidor.

A contagem de visualizações usa a callable incrementArticleView e continua sendo acionada uma vez por navegador por matéria, conforme a chave local fp_viewed_articles.


Para ativar a exclusão física dos assets e a contagem global de visualizações no Firebase, publique as Functions e associe os segredos do servidor (sem colocar os valores no site):

  firebase functions:secrets:set CLOUDINARY_CLOUD_NAME
  firebase functions:secrets:set CLOUDINARY_API_KEY
  firebase functions:secrets:set CLOUDINARY_API_SECRET
  firebase deploy --only functions

O Cloud Name e a API Key podem ser fornecidos ao comando quando o Firebase solicitar. A API Secret deve ficar somente nos segredos do Firebase Functions.


--- v47 — OPÇÃO A, SEM BACKEND ---

Esta versão não depende de Firebase Secret Manager/Cloud Functions para mídia.

- Uploads continuam indo diretamente para o Cloudinary por preset unsigned.
- API Secret continua fora do navegador.
- Ao editar e substituir mídia, ou excluir uma matéria, os assets antigos NÃO são apagados automaticamente.
- Em vez disso, suas referências são registradas localmente em `fp_cloudinary_orphans` para limpeza manual posterior na Media Library do Cloudinary.
- A contagem de visualizações foi movida para uma atualização controlada diretamente no Firestore: somente `views` pode mudar e cada operação soma exatamente 1 em artigos aprovados e visíveis.
- As correções da v46 para duplicação de salvamento e `Tainted canvases may not be exported` permanecem.

IMPORTANTE PARA O LANÇAMENTO
Antes de hospedar/publicar o site, implementar a OPÇÃO B: um backend seguro para excluir automaticamente os assets do Cloudinary sem expor o API Secret no navegador.

Nenhum comando de `firebase functions:secrets:set` é necessário para a opção A.
