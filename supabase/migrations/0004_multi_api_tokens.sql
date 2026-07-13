-- supabase/migrations/0004_multi_api_tokens.sql
alter table api_tokens add column id uuid not null default gen_random_uuid();
alter table api_tokens add column name text not null default 'default';

alter table api_tokens drop constraint api_tokens_pkey;
alter table api_tokens add constraint api_tokens_pkey primary key (id);
create index api_tokens_user_id_idx on api_tokens (user_id);
