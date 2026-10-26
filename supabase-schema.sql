-- Folha do Paiquerê — estrutura opcional de produção no Supabase.
-- Execute no SQL Editor do Supabase depois de criar o projeto.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'Estudante' check (role in ('Estudante','Editor','Editor-Chefe')),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  title text not null,
  subtitle text,
  category text,
  author_name text,
  cover_url text,
  video_url text,
  canvas_json jsonb,
  content_type text not null default 'informacional' check (content_type in ('informacional','entretenimento')),
  creative_type text,
  status text not null default 'Rascunho',
  visible boolean not null default false,
  views integer not null default 0,
  likes integer not null default 0,
  dislikes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reactions (
  article_id uuid references public.articles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like','dislike')),
  created_at timestamptz not null default now(),
  primary key(article_id,user_id)
);

-- Chat: group_key permite continuar compatível com o identificador do protótipo local.
create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  group_key text unique,
  name text not null,
  avatar_url text,
  write_policy text not null default 'everyone' check (write_policy in ('everyone','editors','chiefs')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_key text,
  group_id uuid references public.chat_groups(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  author_email text,
  author_role text,
  avatar_url text,
  text text,
  media_url text,
  media_type text,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_group_key_created_idx on public.chat_messages(group_key,created_at);

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  subject text,
  message text not null,
  status text not null default 'Novo' check (status in ('Novo','Arquivado')),
  created_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  type text not null,
  types jsonb not null default '[]'::jsonb,
  description text,
  image_url text,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cada navegador recebe um identificador aleatório. Isso permite contagem sem
-- afirmar identidade pessoal. Para “pessoas” reais entre dispositivos, use auth.user_id.
create table if not exists public.poll_votes (
  article_id text not null,
  poll_index integer not null default 0,
  voter_id text not null,
  selections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key(article_id,poll_index,voter_id)
);

alter table public.poll_votes enable row level security;
alter table public.chat_groups enable row level security;
alter table public.chat_messages enable row level security;
alter table public.profiles enable row level security;

-- Polls: qualquer visitante pode responder; somente autenticados podem consultar a contagem.
drop policy if exists "poll votes insert" on public.poll_votes;
create policy "poll votes insert" on public.poll_votes
  for insert to anon, authenticated
  with check (length(voter_id) between 8 and 120);

drop policy if exists "poll votes editor read" on public.poll_votes;
create policy "poll votes editor read" on public.poll_votes
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('Editor','Editor-Chefe')));

-- Perfis: cada usuário lê/atualiza somente o próprio perfil.
drop policy if exists "profile own select" on public.profiles;
create policy "profile own select" on public.profiles for select to authenticated using (id=auth.uid());
drop policy if exists "profile own insert" on public.profiles;
create policy "profile own insert" on public.profiles for insert to authenticated with check (id=auth.uid());
drop policy if exists "profile own update" on public.profiles;
create policy "profile own update" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

-- Chat: usuários autenticados podem ler mensagens. A autorização fina de escrita
-- continua sendo validada no cliente e deve ser reforçada com RPC/trigger no backend em produção.
drop policy if exists "chat groups authenticated read" on public.chat_groups;
create policy "chat groups authenticated read" on public.chat_groups for select to authenticated using (true);
drop policy if exists "chat groups authenticated insert" on public.chat_groups;
create policy "chat groups authenticated insert" on public.chat_groups
  for insert to authenticated
  with check (created_by=auth.uid() and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('Editor','Editor-Chefe')));

drop policy if exists "chat messages authenticated read" on public.chat_messages;
create policy "chat messages authenticated read" on public.chat_messages for select to authenticated using (true);
drop policy if exists "chat messages authenticated insert" on public.chat_messages;
create policy "chat messages authenticated insert" on public.chat_messages
  for insert to authenticated
  with check (
    author_id=auth.uid()
    and exists (
      select 1
      from public.chat_groups g
      join public.profiles p on p.id=auth.uid()
      where g.group_key=chat_messages.group_key
        and (
          g.write_policy='everyone'
          or (g.write_policy='editors' and p.role in ('Editor','Editor-Chefe'))
          or (g.write_policy='chiefs' and p.role='Editor-Chefe')
        )
    )
  );
drop policy if exists "chat messages own delete" on public.chat_messages;
create policy "chat messages own delete" on public.chat_messages for delete to authenticated using (author_id=auth.uid());

-- Storage: crie os buckets avatars, article-media e chat-media como públicos somente
-- quando essa política fizer sentido para o projeto. Em produção, prefira buckets privados
-- + signed URLs para conteúdo não público.
--
-- A política abaixo assume que os buckets foram criados manualmente com esses nomes.
drop policy if exists "chat media authenticated upload" on storage.objects;
create policy "chat media authenticated upload" on storage.objects
  for insert to authenticated
  with check (bucket_id='chat-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "chat media authenticated read" on storage.objects;
create policy "chat media authenticated read" on storage.objects
  for select to authenticated
  using (bucket_id='chat-media');

drop policy if exists "chat media own delete" on storage.objects;
create policy "chat media own delete" on storage.objects
  for delete to authenticated
  using (bucket_id='chat-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- Migração para instalações que já possuem poll_votes sem poll_index.
alter table public.poll_votes add column if not exists poll_index integer not null default 0;
alter table public.poll_votes drop constraint if exists poll_votes_pkey;
alter table public.poll_votes add primary key (article_id,poll_index,voter_id);

-- Migração para instalações antigas do chat.
alter table public.chat_groups add column if not exists group_key text;
alter table public.chat_groups add column if not exists write_policy text not null default 'everyone';
alter table public.chat_messages add column if not exists group_key text;
alter table public.chat_messages add column if not exists author_name text;
alter table public.chat_messages add column if not exists author_email text;
alter table public.chat_messages add column if not exists author_role text;
alter table public.chat_messages add column if not exists avatar_url text;

-- Comentários das notícias: comentários podem ter uma resposta (parent_id).
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  author_email text,
  avatar_url text,
  body text not null check (char_length(body) between 1 and 1200),
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists comments_article_created_idx on public.comments(article_id,created_at);
alter table public.comments enable row level security;
drop policy if exists "comments public read" on public.comments;
create policy "comments public read" on public.comments for select to anon, authenticated using (visible=true);
drop policy if exists "comments authenticated insert" on public.comments;
create policy "comments authenticated insert" on public.comments for insert to authenticated with check (author_id=auth.uid());
drop policy if exists "comments own delete" on public.comments;
create policy "comments own delete" on public.comments for delete to authenticated using (author_id=auth.uid());
drop policy if exists "comments editor moderate" on public.comments;
create policy "comments editor moderate" on public.comments for update to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('Editor','Editor-Chefe'))) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('Editor','Editor-Chefe')));

-- Resultado público da enquete sem expor identificadores de quem votou.
create or replace function public.get_poll_results(p_article_id text, p_poll_index integer default 0)
returns table(option_index integer, vote_count bigint)
language sql
security definer
set search_path = public
as $$
  select x.option_index, count(*)::bigint as vote_count
  from public.poll_votes v
  cross join lateral jsonb_array_elements_text(v.selections) with ordinality as x(value, ord)
  cross join lateral (select (x.value)::integer as option_index) as parsed
  where v.article_id = p_article_id and v.poll_index = p_poll_index
  group by parsed.option_index
  order by parsed.option_index;
$$;
revoke all on function public.get_poll_results(text,integer) from public;
grant execute on function public.get_poll_results(text,integer) to anon, authenticated;

-- Permite que Editores-Chefe alterem a permissão de fala de grupos existentes.
drop policy if exists "chat groups chief update" on public.chat_groups;
create policy "chat groups chief update" on public.chat_groups for update to authenticated
  using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Editor-Chefe'))
  with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Editor-Chefe'));

drop policy if exists "comments editor delete" on public.comments;
create policy "comments editor delete" on public.comments for delete to authenticated
  using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('Editor','Editor-Chefe')) or author_id=auth.uid());
