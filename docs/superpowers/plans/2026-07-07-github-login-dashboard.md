# GitHub Login + Personal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign in with GitHub, get a personal API token, and see their own `promptci run --upload` history at `/dashboard`, without breaking existing anonymous uploads or the public `/r/[runId]` share page.

**Architecture:** Supabase Auth (GitHub OAuth provider) handles login and session cookies via `@supabase/ssr`. The existing service-role ("admin") Supabase client continues to do all `runs`/`api_tokens` table reads/writes, filtered explicitly by the logged-in `user.id` — no RLS policies are introduced. The CLI (`prompt-ci-engine`) is unchanged; it already sends whatever string is in `PROMPTCI_TOKEN`, and the server now resolves that string to a `user_id` if it matches a row in `api_tokens`.

**Tech Stack:** Next.js 16 (App Router), `@supabase/supabase-js`, `@supabase/ssr` (new dependency), Tailwind, Supabase Postgres + Auth.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-github-login-dashboard-design.md`
- No RLS policies — all `runs`/`api_tokens` access goes through the service-role admin client, filtered by `user_id` in application code.
- One API token per user (`api_tokens.user_id` is the primary key). Regenerating overwrites the existing row.
- `runs.user_id` is nullable — anonymous uploads (token not registered to any account) keep working exactly as before, and never appear on `/dashboard`.
- Zero changes to `prompt-ci-engine` (the CLI repo).
- This Next.js version renames `middleware.ts` → `proxy.ts`, and the exported function must be named `proxy` (not `middleware`). Do not create a `middleware.ts` file.
- `cookies()` from `next/headers` is async — always `await cookies()`.
- Use `supabase.auth.getUser()` (server-verified) for authorization decisions, never `getSession()` (unverified, spoofable from cookies alone).
- This repo has no automated test framework (no Jest/Vitest, just `eslint`). Verify each task with `npm run build` (typecheck + build) and the manual check described in that task, matching how earlier work in this repo was verified.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/0002_auth_tokens.sql` | Create | `runs.user_id` column + `api_tokens` table |
| `lib/supabase/admin.ts` | Create (moved from `lib/supabase.ts`) | Service-role client, used for all `runs`/`api_tokens` queries |
| `lib/supabase.ts` | Delete | Replaced by `lib/supabase/admin.ts` |
| `lib/supabase/client.ts` | Create | Browser (anon-key) client, used only for `supabase.auth.*` calls |
| `lib/supabase/server.ts` | Create | Server (cookie-based) client, used only for `supabase.auth.*` calls |
| `lib/rateLimit.ts` | Modify | Update import path to `./supabase/admin` |
| `proxy.ts` | Create | Refreshes the Supabase session cookie on every navigation |
| `app/login/page.tsx` | Create | "Sign in with GitHub" button |
| `app/auth/callback/route.ts` | Create | Exchanges the OAuth `code` for a session |
| `app/api/token/route.ts` | Create | Issues/regenerates the current user's API token |
| `app/api/runs/route.ts` | Modify | Resolve `token` → `user_id` before inserting a run |
| `app/dashboard/page.tsx` | Create | Lists the current user's runs; renders `TokenCard` |
| `app/dashboard/TokenCard.tsx` | Create | Client component: show/generate/copy the API token |
| `app/r/[runId]/page.tsx` | Modify | Update import path to `@/lib/supabase/admin` |
| `app/page.tsx` | Modify | Add a "Dashboard" / "Sign in with GitHub" link |
| `package.json` | Modify | Add `@supabase/ssr` dependency |

---

### Task 1: Database migration — `user_id` and `api_tokens`

**Files:**
- Create: `supabase/migrations/0002_auth_tokens.sql`

**Interfaces:**
- Produces: `runs.user_id` (nullable `uuid`), `api_tokens` table (`user_id uuid primary key`, `token text unique not null`, `created_at timestamptz`)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_auth_tokens.sql
alter table runs add column user_id uuid references auth.users(id);

create table api_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
```

`token text ... unique` already creates a unique index Postgres uses for the token→user_id lookup in Task 6, so no separate index is needed.

- [ ] **Step 2: Run it against the Supabase project**

Open the Supabase dashboard for this project → SQL Editor → paste the contents of `supabase/migrations/0002_auth_tokens.sql` → Run.

- [ ] **Step 3: Verify**

In the SQL Editor, run:

```sql
select column_name from information_schema.columns where table_name = 'runs' and column_name = 'user_id';
select table_name from information_schema.tables where table_name = 'api_tokens';
```

Expected: first query returns one row (`user_id`), second returns one row (`api_tokens`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_auth_tokens.sql
git commit -m "Add user_id column and api_tokens table for GitHub login"
```

---

### Task 2: Add `@supabase/ssr` and split the Supabase client into admin/client/server

**Files:**
- Modify: `package.json`
- Create: `lib/supabase/admin.ts` (content moved from `lib/supabase.ts`)
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Delete: `lib/supabase.ts`
- Modify: `lib/rateLimit.ts`
- Modify: `app/r/[runId]/page.tsx`
- Modify: `app/api/runs/route.ts` (import path only in this task; behavior changes in Task 6)

**Interfaces:**
- Produces: `getSupabaseClient()` from `@/lib/supabase/admin` (same signature as before, just relocated), `createClient()` (browser) from `@/lib/supabase/client`, `createClient()` (async, server) from `@/lib/supabase/server`

- [ ] **Step 1: Install the dependency**

```bash
npm install @supabase/ssr@^0.12.0
```

- [ ] **Step 2: Create `lib/supabase/admin.ts` with the existing content**

```ts
// lib/supabase/admin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client. Uses the service role key because the API route
// needs insert access and the report page reads rows directly.
export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 3: Delete the old file**

```bash
rm lib/supabase.ts
```

- [ ] **Step 4: Create the browser client**

```ts
// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 5: Create the server client**

```ts
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — safe to ignore because
            // proxy.ts refreshes the session cookie on every navigation.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 6: Update `lib/rateLimit.ts`'s import**

In `lib/rateLimit.ts`, change:

```ts
import { getSupabaseClient } from "./supabase";
```

to:

```ts
import { getSupabaseClient } from "./supabase/admin";
```

- [ ] **Step 7: Update `app/r/[runId]/page.tsx`'s import**

Change:

```ts
import { getSupabaseClient } from "@/lib/supabase";
```

to:

```ts
import { getSupabaseClient } from "@/lib/supabase/admin";
```

- [ ] **Step 8: Update `app/api/runs/route.ts`'s import**

Change:

```ts
import { getSupabaseClient } from "@/lib/supabase";
```

to:

```ts
import { getSupabaseClient } from "@/lib/supabase/admin";
```

- [ ] **Step 9: Add the anon key to your local env**

In the Supabase dashboard → Settings → API, copy the `anon` `public` key. Add it to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key here>
```

Also add it to `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 10: Build to verify**

Run: `npm run build`
Expected: builds successfully with no type errors, no remaining references to `@/lib/supabase` or `./supabase` (the old path).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Split Supabase client into admin/browser/server variants"
```

---

### Task 3: `proxy.ts` — refresh the session on every request

**Files:**
- Create: `proxy.ts` (project root, next to `app/`)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
- Produces: nothing consumed by other tasks directly — this only keeps session cookies fresh

- [ ] **Step 1: Write `proxy.ts`**

```ts
// proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session if it's expired — required so Server Components see
  // a valid user on the next request.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: builds successfully. (`proxy.ts` isn't exercised by the build itself, but this confirms no type errors.)

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "Add proxy.ts to refresh Supabase session cookies"
```

---

### Task 4: Login page + OAuth callback

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/client` (browser), `@/lib/supabase/server` (server)
- Produces: `/login` route, `/auth/callback` route (used as the OAuth `redirectTo`)

- [ ] **Step 1: Write the login page**

```tsx
// app/login/page.tsx
"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function handleSignIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
      <p className="mt-2 text-gray-600">
        Sign in to see your promptci run history.
      </p>
      <button
        onClick={handleSignIn}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Sign in with GitHub
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Write the OAuth callback route**

```ts
// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: builds successfully, `/login` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx app/auth/callback/route.ts
git commit -m "Add GitHub login page and OAuth callback route"
```

---

### Task 5: Token generation API route

**Files:**
- Create: `app/api/token/route.ts`

**Interfaces:**
- Consumes: `createClient()` (server) from `@/lib/supabase/server`, `getSupabaseClient()` from `@/lib/supabase/admin`
- Produces: `POST /api/token` → `{ token: string }` on success, `401` if not authenticated

- [ ] **Step 1: Write the route**

```ts
// app/api/token/route.ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = randomUUID();
  const admin = getSupabaseClient();
  const { error } = await admin
    .from("api_tokens")
    .upsert({ user_id: user.id, token }, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }

  return NextResponse.json({ token });
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add app/api/token/route.ts
git commit -m "Add API route to issue/regenerate a personal API token"
```

---

### Task 6: Attach `user_id` when a run is uploaded

**Files:**
- Modify: `app/api/runs/route.ts`

**Interfaces:**
- Consumes: `api_tokens` table (from Task 1)
- Produces: `runs.user_id` populated on insert when `token` matches a registered `api_tokens.token`

- [ ] **Step 1: Update the insert logic**

In `app/api/runs/route.ts`, replace the existing insert block:

```ts
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("runs")
    .insert({ token, payload })
    .select("id")
    .single();
```

with:

```ts
  const supabase = getSupabaseClient();

  const { data: tokenRow } = await supabase
    .from("api_tokens")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();

  const { data, error } = await supabase
    .from("runs")
    .insert({ token, payload, user_id: tokenRow?.user_id ?? null })
    .select("id")
    .single();
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Manual check (anonymous upload still works)**

```bash
curl -s -X POST https://prompt-ci-dashboard.vercel.app/api/runs \
  -H "content-type: application/json" \
  -d '{"token":"plan-task6-smoke-test","payload":[{"promptName":"x","timestamp":"2026-07-07T00:00:00.000Z","threshold":0.7,"passed":true,"cases":[]}]}'
```

Expected: `{"runId":"<uuid>"}` — this can only be run after Task 6 is deployed, so treat this as a post-deploy check, not a pre-commit gate.

- [ ] **Step 4: Commit**

```bash
git add app/api/runs/route.ts
git commit -m "Attach user_id to uploaded runs when the token is registered"
```

---

### Task 7: Dashboard page

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/TokenCard.tsx`

**Interfaces:**
- Consumes: `createClient()` (server) from `@/lib/supabase/server`, `getSupabaseClient()` from `@/lib/supabase/admin`, `RunResult` type from `@/lib/types`, `POST /api/token` from Task 5
- Produces: `/dashboard` route

- [ ] **Step 1: Write `TokenCard.tsx`**

```tsx
// app/dashboard/TokenCard.tsx
"use client";

import { useState } from "react";

export default function TokenCard({
  initialToken,
}: {
  initialToken: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generateToken() {
    setLoading(true);
    try {
      const res = await fetch("/api/token", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="mb-2 font-semibold text-gray-900">Your API token</h2>
      <p className="mb-3 text-sm text-gray-600">
        Set this as{" "}
        <code className="rounded bg-gray-200 px-1">PROMPTCI_TOKEN</code> so
        that{" "}
        <code className="rounded bg-gray-200 px-1">
          promptci run --upload
        </code>{" "}
        links to your account.
      </p>
      {token ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded bg-gray-900 px-3 py-2 text-sm text-gray-100">
            {token}
          </code>
          <button
            onClick={copyToken}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No token yet.</p>
      )}
      <button
        onClick={generateToken}
        disabled={loading}
        className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? "Generating…" : token ? "Regenerate token" : "Generate token"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/dashboard/page.tsx`**

```tsx
// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/admin";
import TokenCard from "./TokenCard";
import type { RunResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = getSupabaseClient();

  const { data: tokenRow } = await admin
    .from("api_tokens")
    .select("token")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: runs } = await admin
    .from("runs")
    .select("id, created_at, payload")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="mt-6">
        <TokenCard initialToken={tokenRow?.token ?? null} />
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Your runs
        </h2>
        {!runs || runs.length === 0 ? (
          <p className="text-sm text-gray-500">
            No runs yet. Set{" "}
            <code className="rounded bg-gray-200 px-1">PROMPTCI_TOKEN</code>{" "}
            to the token above and run{" "}
            <code className="rounded bg-gray-200 px-1">
              promptci run --upload
            </code>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => {
              const results = run.payload as RunResult[];
              const allPassed = results.every((r) => r.passed);
              return (
                <li key={run.id}>
                  <a
                    href={`/r/${run.id}`}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-900">
                      {results.map((r) => r.promptName).join(", ")}
                    </span>
                    <span className="flex items-center gap-3 text-sm text-gray-500">
                      <span
                        className={
                          allPassed
                            ? "font-semibold text-green-700"
                            : "font-semibold text-red-700"
                        }
                      >
                        {allPassed ? "PASSED" : "FAILED"}
                      </span>
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: builds successfully, `/dashboard` appears in the route list as dynamic (ƒ).

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/TokenCard.tsx
git commit -m "Add personal dashboard with run list and API token card"
```

---

### Task 8: Landing page nav link

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `createClient()` (server) from `@/lib/supabase/server`

- [ ] **Step 1: Add the session check and nav link**

At the top of `app/page.tsx`, change:

```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900">
```

to:

```tsx
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-8 flex justify-end">
        <a
          href={user ? "/dashboard" : "/login"}
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          {user ? "Dashboard →" : "Sign in with GitHub →"}
        </a>
      </div>

      <h1 className="text-3xl font-bold text-gray-900">
```

(The closing tags for `<main>` and the component don't change — only the opening section gains the nav link and the function becomes `async`.)

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "Add sign-in/dashboard link to landing page"
```

---

### Task 9: Manual GitHub OAuth setup and end-to-end verification

This task has no code changes — it's account configuration plus a full manual test. Do this after Tasks 1–8 are committed and deployed (`npx vercel --prod`).

**Files:** none

- [ ] **Step 1: Create the GitHub OAuth App**

Go to https://github.com/settings/developers → "New OAuth App":
- Application name: `promptci dashboard` (or any name)
- Homepage URL: `https://prompt-ci-dashboard.vercel.app`
- Authorization callback URL: `https://riwxuyjoyqajcpoxjfai.supabase.co/auth/v1/callback`

Generate a client secret. Copy the Client ID and Client Secret.

- [ ] **Step 2: Enable the GitHub provider in Supabase**

Supabase dashboard → Authentication → Providers → GitHub → toggle on → paste Client ID and Client Secret → Save.

- [ ] **Step 3: Register redirect URLs in Supabase**

Supabase dashboard → Authentication → URL Configuration → add to "Redirect URLs":
- `https://prompt-ci-dashboard.vercel.app/auth/callback`
- `http://localhost:3000/auth/callback`

- [ ] **Step 4: Add the anon key to Vercel and redeploy**

```bash
cd prompt-ci-dashboard
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# paste the same anon key used in .env.local
npx vercel --prod --yes
```

- [ ] **Step 5: Manual end-to-end test**

1. Visit `https://prompt-ci-dashboard.vercel.app` → click "Sign in with GitHub" → approve on GitHub → confirm you land on `/dashboard`.
2. On `/dashboard`, click "Generate token" → confirm a token appears and "Copy" works.
3. Locally, set `PROMPTCI_TOKEN=<copied token>` in `prompt-ci-engine/.env`.
4. Run `npm run dev -- run --upload` in `prompt-ci-engine`.
5. Refresh `/dashboard` → confirm the new run appears in the list, linking to a working `/r/[runId]` page.
6. In a private/incognito window, upload a run with an unregistered token (e.g. `curl` command from Task 6 Step 3) → confirm it does **not** appear on the logged-in dashboard, but `/r/{runId}` for it still loads.

- [ ] **Step 6: Update PROJECT_STATUS.md**

In `prompt-ci-engine/PROJECT_STATUS.md`, add a new dated section recording that GitHub login + personal dashboard shipped, following the format of the existing "완료된 것" sections.

```bash
cd prompt-ci-engine
git add PROJECT_STATUS.md
git commit -m "Record GitHub login and dashboard feature in PROJECT_STATUS.md"
git push
```
