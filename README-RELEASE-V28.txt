FOLHA DO PAIQUERÊ — RELEASE V28 / PRÉ-FIREBASE

OBJETIVO
Versão de estabilização anterior à migração para Firebase.

CORREÇÕES IMPORTANTES
- Corrigido o botão Excluir das próprias matérias do estudante: o botão agora recebe seu handler e remove rascunhos/ajustes do armazenamento persistente.
- Remoção de integrante deixou de apagar o perfil. O acesso agora é revogado com accessRevoked=true, mantendo perfil, biografia, histórico, créditos, conquistas e postagens.
- Adicionada área de Acessos revogados com restauração pelo Editor-Chefe.
- Login é bloqueado para acessos revogados.
- Perfis preservados continuam públicos; recebem indicação visual de perfil preservado.
- Seletores de créditos continuam mostrando apenas integrantes com acesso ativo.
- Normalização dos usuários passa a preservar explicitamente o estado de acesso.
- Botões de navegação do painel receberam type="button" para evitar submits acidentais.
- Botão de publicação da conquista recebeu type="submit" explícito.

AUDITORIA ESTÁTICA
- node --check: portal.js, app.js, editor.js, storage.js
- HTML principal: IDs duplicados verificados.
- Links locais: nenhum arquivo local ausente encontrado.
- Scripts locais: nenhum arquivo local ausente encontrado.
- Paleta: nenhum hexadecimal vermelho explícito encontrado.
- Painel: data-tab e data-panel correspondentes.

TESTE DE NAVEGADOR
A automação Chromium deste ambiente foi tentada, mas o ambiente bloqueou a abertura de páginas locais/HTTP com ERR_BLOCKED_BY_ADMINISTRATOR. Portanto, não foi declarado teste E2E aprovado. A validação abaixo foi feita por inspeção de código, sintaxe, estrutura HTML, ligações de IDs e fluxos de persistência.

PRÓXIMA FASE
Antes de Firebase, revisar esquema de dados e separar identidade/autorização de perfil público para que revogar acesso continue preservando o perfil sem depender de exclusão do documento de autenticação.
