# prompt-ci-dashboard

Web dashboard for [promptci](https://github.com/kibin28-glitch/prompt-ci-engine) — view shareable regression-test reports uploaded via `promptci run --upload`.

Live at [prompt-ci-dashboard.vercel.app](https://prompt-ci-dashboard.vercel.app).

## Stack

Next.js (App Router) + TypeScript + Tailwind + Supabase.

## Local setup

1. Create a [Supabase](https://supabase.com) project.
2. Run `supabase/migrations/0001_runs.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. `npm install && npm run dev`

## How it works

- `POST /api/runs` — accepts `{ token, payload }` from the CLI, rate-limited per token, stores the run in Supabase.
- `GET /r/[runId]` — renders a run's pass/fail status and per-case baseline/current diff.

## Deploy

```bash
npx vercel --prod
```

Set the same two Supabase environment variables in the Vercel project settings.
