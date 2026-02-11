-- ============================================================
-- HiveCAD — Supabase SQL Schema
-- ============================================================
-- Tables required by SupabaseMetaService.
-- Run this migration in your Supabase SQL Editor or via CLI:
--   supabase db push
-- ============================================================

-- ─── Projects ─────────────────────────────────────────────────

create table if not exists public.projects (
    id            text primary key,
    name          text not null default '',
    owner_id      text not null,
    owner_email   text not null default '',
    description   text not null default '',
    visibility    text not null default 'private'
                     check (visibility in ('private', 'public', 'unlisted')),
    tags          jsonb not null default '[]'::jsonb,
    folder        text not null default '',
    thumbnail     text not null default '',
    last_modified timestamptz not null default now(),
    created_at    timestamptz not null default now(),
    remote_provider text not null default 'github',
    remote_locator  text not null default '',
    locked_by     text,
    updated_at    timestamptz not null default now()
);

-- Index for owner lookups
create index if not exists idx_projects_owner on public.projects(owner_id);

-- Index for public project search
create index if not exists idx_projects_visibility on public.projects(visibility)
    where visibility = 'public';

-- Enable RLS
alter table public.projects enable row level security;

-- Policies: owner can do anything, public visibility readable by all
create policy "Owner full access" on public.projects
    for all
    using (auth.uid()::text = owner_id)
    with check (auth.uid()::text = owner_id);

create policy "Public projects readable" on public.projects
    for select
    using (visibility = 'public');

-- ─── Extensions ──────────────────────────────────────────────

create table if not exists public.extensions (
    id            text primary key,
    name          text not null default '',
    description   text not null default '',
    icon          text not null default 'Package',
    version       text not null default '1.0.0',
    category      text not null default 'general',
    author_id     text not null,
    author_email  text not null default '',
    status        text not null default 'development'
                     check (status in ('development', 'published')),
    remote_provider text not null default 'github',
    remote_owner    text not null default '',
    remote_repo     text not null default '',
    downloads     integer not null default 0,
    likes         integer not null default 0,
    dislikes      integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists idx_extensions_author on public.extensions(author_id);
create index if not exists idx_extensions_status on public.extensions(status);

alter table public.extensions enable row level security;

create policy "Author full access" on public.extensions
    for all
    using (auth.uid()::text = author_id)
    with check (auth.uid()::text = author_id);

create policy "Published extensions readable" on public.extensions
    for select
    using (status = 'published');

-- Allow anyone to update download/vote counts
create policy "Anyone can increment stats" on public.extensions
    for update
    using (true)
    with check (true);

-- ─── Extension Votes ────────────────────────────────────────

create table if not exists public.extension_votes (
    extension_id  text not null references public.extensions(id) on delete cascade,
    user_id       text not null,
    vote_type     text not null check (vote_type in ('like', 'dislike')),
    created_at    timestamptz not null default now(),
    primary key (extension_id, user_id)
);

alter table public.extension_votes enable row level security;

create policy "Users manage own votes" on public.extension_votes
    for all
    using (auth.uid()::text = user_id)
    with check (auth.uid()::text = user_id);

-- ─── User Tags ──────────────────────────────────────────────

create table if not exists public.user_tags (
    user_id    text primary key,
    tags       jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.user_tags enable row level security;

create policy "Users manage own tags" on public.user_tags
    for all
    using (auth.uid()::text = user_id)
    with check (auth.uid()::text = user_id);

-- ─── User Folders ───────────────────────────────────────────

create table if not exists public.user_folders (
    user_id    text primary key,
    folders    jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.user_folders enable row level security;

create policy "Users manage own folders" on public.user_folders
    for all
    using (auth.uid()::text = user_id)
    with check (auth.uid()::text = user_id);
