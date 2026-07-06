-- supabase/migrations/0003_runs_user_id_on_delete_set_null.sql
-- runs.user_id had no ON DELETE action, unlike api_tokens' ON DELETE CASCADE.
-- If a user is ever deleted, their past runs should become anonymous
-- (user_id -> null) rather than being blocked or silently orphaned.
alter table runs drop constraint runs_user_id_fkey;
alter table runs add constraint runs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
