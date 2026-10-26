SUPABASE — PRÓXIMA ETAPA

A v6 já inclui o esqueleto de dados para migrar do localStorage para um backend real.

Por que Supabase? Ele reúne PostgreSQL, autenticação, Storage e Realtime no mesmo projeto. Isso é adequado para este jornal porque teremos notícias, usuários/cargos, reações, visualizações, chat e arquivos de mídia.

Arquivos:
- supabase-schema.sql: tabelas iniciais.
- supabase-config.example.js: modelo da configuração pública do cliente.

IMPORTANTE:
Não coloque senhas de Gmail no site. A senha do e-mail não é necessária para configurar o Supabase. O navegador deve usar apenas a URL do projeto e a publishable key.

Para produção, a autenticação deve migrar para Supabase Auth e os arquivos grandes devem ir para Storage. As tabelas devem usar RLS.
