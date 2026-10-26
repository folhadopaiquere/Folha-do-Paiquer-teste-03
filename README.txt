FOLHA DO PAIQUERÊ — VERSÃO ATUALIZADA

Arquivos principais:
- index.html: Home
- noticias.html: feed e filtros
- noticia-single.html: leitura da matéria
- sobre.html: institucional
- login.html: autenticação local de demonstração
- painel.html: área do estudante e mesa editorial
- editor.html: editor Fabric.js
- app.js: conteúdo público + acessibilidade pública
- portal.js: login, painel, permissões, moderação, usuários e chat
- editor.js: Fabric.js, capa, vídeo, formatação e prévia do site

REGRAS EDITORIAIS:
- Rascunho -> Em análise -> Postar ou Solicitar ajustes.
- Matérias pendentes não aparecem no site público.
- Editor e Editor-Chefe podem revisar, editar e publicar.
- Editor pode ocultar/mostrar e apagar publicações.
- Editor-Chefe principal não pode ser removido/rebaixado.
- O Editor-Chefe pode cadastrar qualquer endereço de e-mail válido; a autorização continua controlada pelo cargo.

CONTA PRINCIPAL DE DEMONSTRAÇÃO:
- E-mail: folhadopaiquere@gmail.com
- Senha: definida diretamente no Firebase Authentication.

OBSERVAÇÃO:
Este projeto continua sendo um protótipo 100% local. Senhas e permissões são armazenadas no localStorage e NÃO devem ser usadas assim em produção. Para produção, migrar autenticação, autorização e dados para um backend seguro.


NOVIDADES DESTA VERSÃO:
- Chat da redação redesenhado em estilo de mensageiro, com grupos, fotos, vídeos e mensagens.
- Editores podem criar e apagar grupos; o grupo Geral é permanente.
- Mensagens podem ser apagadas para mim ou para todos pelo próprio autor.
- Novo título de acesso Editor-Chefe para responsáveis gerais.
- Editor de texto com somente três tamanhos: Título, Subtítulo e Padrão.
- Imagens podem ser inseridas grandes ou em layout lateral para permitir texto ao lado.
- Notícias possuem visualizações e reações de Curtir/Não gostei, persistentes por matéria no protótipo.
- Visualizações e reações usam localStorage neste protótipo; produção exige backend para contagem compartilhada entre visitantes.

V8 — novos módulos
- Cantinho Criativo e Literário: matérias podem ser classificadas como informacionais ou entretenimento, com formato criativo (poesia, conto, crônica, tirinha, arte digital ou outro).
- Caixa de Sugestões e Pautas Anônimas: formulário público; os recados aparecem no painel editorial sem nome/e-mail.
- Mural de Conquistas: editores podem cadastrar destaques com foto, e eles aparecem na Home.
- Notícias: botão Baixar PDF usa a impressão otimizada da notícia para permitir salvar como PDF sem poluir a interface.


v9: corrigidos arraste do Fabric, prévia do site, publicação, pautas e conquistas. Criadas as páginas Participar e Conquistas para manter a Home limpa.


V12 — reconstrução: fp_articles é a fonte única de verdade do fluxo editorial. Dados legados de fp_article_meta são migrados automaticamente. Avatares são resolvidos pelo e-mail do remetente nas conversas.
