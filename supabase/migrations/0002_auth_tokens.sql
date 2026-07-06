-- supabase/migrations/0002_auth_tokens.sql
alter table runs add column user_id uuid references auth.users(id);

create table api_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
