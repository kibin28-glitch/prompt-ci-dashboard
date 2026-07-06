create table runs (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index runs_token_created_at_idx on runs (token, created_at);
