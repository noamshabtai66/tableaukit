-- TableauKit Phase 1 schema
-- Created: 2026-05-22
-- Tables: tk_profiles, tk_templates, tk_favorites
-- Storage: bucket `templates` (public read)
-- All tables prefixed `tk_` to coexist with tableau-cli on the same Supabase instance.

-- =========================
-- Tables
-- =========================

-- profiles: 1:1 with auth.users (created on signup via trigger or app-level)
create table if not exists tk_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- templates: the gallery content (admin-managed via service role)
create table if not exists tk_templates (
  slug text primary key,
  name text not null,
  subtitle text not null,
  chart_type text not null,
  difficulty text not null check (difficulty in ('beginner','intermediate','advanced')),
  build_time_min int not null,
  tableau_public_url text not null,
  twbx_storage_path text not null,
  sample_csv_storage_path text,
  preview_image_url text,
  annotation_md text not null,
  tags text[] not null default '{}',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists tk_templates_published_idx
  on tk_templates (is_published, published_at desc);

-- favorites: user-saved templates
create table if not exists tk_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  template_slug text not null references tk_templates(slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, template_slug)
);

create index if not exists tk_favorites_user_idx on tk_favorites (user_id);

-- =========================
-- Row Level Security
-- =========================

alter table tk_profiles  enable row level security;
alter table tk_templates enable row level security;
alter table tk_favorites enable row level security;

-- Templates: public read for published rows; writes via service role only (no policy = no anon write).
drop policy if exists "tk_templates_public_read" on tk_templates;
create policy "tk_templates_public_read" on tk_templates
  for select
  using (is_published = true);

-- Profiles: each user manages only their own row.
drop policy if exists "tk_profiles_self_select" on tk_profiles;
create policy "tk_profiles_self_select" on tk_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "tk_profiles_self_insert" on tk_profiles;
create policy "tk_profiles_self_insert" on tk_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "tk_profiles_self_update" on tk_profiles;
create policy "tk_profiles_self_update" on tk_profiles
  for update using (auth.uid() = user_id);

-- Favorites: each user manages only their own rows.
drop policy if exists "tk_favorites_self" on tk_favorites;
create policy "tk_favorites_self" on tk_favorites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================
-- Storage bucket
-- =========================

insert into storage.buckets (id, name, public)
values ('templates', 'templates', true)
on conflict (id) do nothing;

-- Public read on the templates bucket (downloads from gallery).
drop policy if exists "templates_public_read" on storage.objects;
create policy "templates_public_read" on storage.objects
  for select
  using (bucket_id = 'templates');
