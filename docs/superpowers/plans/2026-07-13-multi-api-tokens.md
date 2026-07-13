# 다중 API 토큰 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `api_tokens`를 사용자당 1개짜리 단일 토큰에서, 이름 붙은 여러 토큰을 발급/조회/폐기할 수 있는 목록형 모델로 바꾼다.

**Architecture:** `api_tokens`에 surrogate `id` PK와 `name` 컬럼을 추가해 `user_id` PK 제약(사용자당 1행 강제)을 제거한다. `app/api/token/route.ts`(단수, upsert)를 폐기하고 `app/api/tokens/route.ts`(GET 목록/POST 생성)와 `app/api/tokens/[id]/route.ts`(DELETE 폐기)로 교체한다. DELETE의 소유권 검증(`eq(id).eq(user_id)`)만 `lib/tokens.ts`의 순수 함수로 분리해 유일하게 단위 테스트를 둔다. 프론트엔드는 `TokenCard.tsx`(단일 카드)를 `TokenList.tsx`(목록 + 생성 폼)로 교체한다. `/api/runs`의 토큰 검증 경로는 변경하지 않는다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest(신규 devDependency, 이 저장소 최초 도입).

## Global Constraints

- `token` 컬럼의 `unique` 제약은 유지한다 — `/api/runs`, `lib/rateLimit.ts`의 검증 경로는 수정하지 않는다.
- 사용자당 토큰 개수 제한 없음, 만료/마지막 사용 시간 추적 없음, 토큰 값은 해시화하지 않고 현재처럼 평문 상시 조회 가능하게 유지한다 (스펙의 out-of-scope 항목).
- 신규 토큰 생성 시 `name`은 필수 입력이며 빈 문자열/공백만 있는 값은 400으로 거부한다.
- 에러 응답은 기존 컨벤션 `NextResponse.json({ error: "..." }, { status: N })`을 그대로 따른다.
- 자동 테스트는 `lib/tokens.ts`의 소유권 검증 로직 하나로만 좁게 도입한다. 그 외 기능은 수동 검증한다.

---

### Task 1: DB 마이그레이션 — `api_tokens` 다중화

**Files:**
- Create: `supabase/migrations/0004_multi_api_tokens.sql`

**Interfaces:**
- Produces: `api_tokens` 테이블 스키마 `{ id: uuid (PK), user_id: uuid, token: text (unique), name: text, created_at: timestamptz }`. 이후 모든 Task가 이 컬럼 이름을 그대로 사용한다.

이 작업은 순수 SQL DDL이라 자동 테스트 사이클이 없다. 대신 Supabase SQL 에디터에서 직접 실행하고 결과를 조회로 확인한다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/0004_multi_api_tokens.sql
alter table api_tokens add column id uuid not null default gen_random_uuid();
alter table api_tokens add column name text not null default 'default';

alter table api_tokens drop constraint api_tokens_pkey;
alter table api_tokens add constraint api_tokens_pkey primary key (id);
create index api_tokens_user_id_idx on api_tokens (user_id);
```

- [ ] **Step 2: `.env.local`에 연결된 Supabase 프로젝트의 SQL 에디터에서 위 파일 내용을 실행**

Supabase 대시보드 → SQL Editor → 새 쿼리에 파일 내용을 붙여넣고 실행.

- [ ] **Step 3: 스키마 변경 확인**

SQL 에디터에서 실행:

```sql
select id, user_id, name, token, created_at from api_tokens;
```

Expected: 기존에 토큰이 있던 사용자라면 `name` 컬럼 값이 `'default'`로 채워진 행이 보이고, `id` 컬럼에 UUID가 채워져 있음. 토큰이 아직 없는 신규 프로젝트라면 빈 결과라도 에러 없이 반환되면 정상.

```sql
select conname, contype from pg_constraint where conrelid = 'api_tokens'::regclass;
```

Expected: `api_tokens_pkey` 행의 `contype`가 `p`(primary key)이고, 컬럼이 `id` 하나만 걸려 있어야 함(기존처럼 `user_id`에 걸려 있으면 실패).

- [ ] **Step 4: Commit**

```bash
cd /Users/kimkibin/development/prompt-ci-dashboard
git add supabase/migrations/0004_multi_api_tokens.sql
git commit -m "Add migration to allow multiple named API tokens per user"
```

---

### Task 2: 소유권 검증 로직 — `lib/tokens.ts` (TDD)

**Files:**
- Create: `lib/tokens.ts`
- Test: `lib/tokens.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `deleteOwnedToken(admin: SupabaseClient, id: string, userId: string): Promise<{ deleted: boolean }>` — Task 3의 `app/api/tokens/[id]/route.ts`가 이 함수를 그대로 호출한다.

- [ ] **Step 1: Vitest 설치**

```bash
cd /Users/kimkibin/development/prompt-ci-dashboard
npm install -D vitest
```

- [ ] **Step 2: Vitest 설정 파일 작성**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: `package.json`에 test 스크립트 추가**

`package.json`의 `"scripts"` 블록을 아래처럼 수정:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
```

- [ ] **Step 4: 실패하는 테스트 작성**

```ts
// lib/tokens.test.ts
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteOwnedToken } from "./tokens";

function createMockAdmin(rows: unknown[]) {
  const eqUserId = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: rows, error: null }),
  });
  const eqId = vi.fn().mockReturnValue({ eq: eqUserId });
  const del = vi.fn().mockReturnValue({ eq: eqId });
  const from = vi.fn().mockReturnValue({ delete: del });

  return {
    admin: { from } as unknown as SupabaseClient,
    from,
    eqId,
    eqUserId,
  };
}

describe("deleteOwnedToken", () => {
  it("scopes the delete to the given id AND user_id, and returns deleted:true when a row is removed", async () => {
    const { admin, from, eqId, eqUserId } = createMockAdmin([{ id: "tok-1" }]);

    const result = await deleteOwnedToken(admin, "tok-1", "user-1");

    expect(result).toEqual({ deleted: true });
    expect(from).toHaveBeenCalledWith("api_tokens");
    expect(eqId).toHaveBeenCalledWith("id", "tok-1");
    expect(eqUserId).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns deleted:false when no row matches (wrong owner or missing id)", async () => {
    const { admin } = createMockAdmin([]);

    const result = await deleteOwnedToken(admin, "tok-1", "someone-elses-user-id");

    expect(result).toEqual({ deleted: false });
  });
});
```

- [ ] **Step 5: 테스트 실행해서 실패 확인**

Run: `npm test`
Expected: FAIL — `lib/tokens.ts` 모듈이 없어서 `Cannot find module './tokens'` 또는 유사한 에러.

- [ ] **Step 6: 최소 구현 작성**

```ts
// lib/tokens.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function deleteOwnedToken(
  admin: SupabaseClient,
  id: string,
  userId: string,
): Promise<{ deleted: boolean }> {
  const { data } = await admin
    .from("api_tokens")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select();

  return { deleted: (data?.length ?? 0) > 0 };
}
```

- [ ] **Step 7: 테스트 실행해서 통과 확인**

Run: `npm test`
Expected: PASS — 2개 테스트 모두 통과.

- [ ] **Step 8: Commit**

```bash
git add lib/tokens.ts lib/tokens.test.ts vitest.config.ts package.json package-lock.json
git commit -m "Add deleteOwnedToken with unit test for ownership scoping"
```

---

### Task 3: API 라우트 — `/api/tokens`, `/api/tokens/[id]`

**Files:**
- Create: `app/api/tokens/route.ts`
- Create: `app/api/tokens/[id]/route.ts`
- Delete: `app/api/token/route.ts`

**Interfaces:**
- Consumes: `deleteOwnedToken(admin, id, userId)` from Task 2 (`lib/tokens.ts`); `createClient()` from `lib/supabase/server.ts`; `getSupabaseClient()` from `lib/supabase/admin.ts` (both existing, unchanged).
- Produces: `GET /api/tokens` → `{ tokens: Array<{ id: string; name: string; token: string; created_at: string }> }`. `POST /api/tokens` body `{ name: string }` → `{ id, name, token, created_at }`. `DELETE /api/tokens/:id` → `{ success: true }` or 404. Task 4의 `TokenList.tsx`가 이 세 응답 형태를 그대로 소비한다.

이 라우트들은 수동으로 검증한다 (스펙의 테스트 계획에 따라 자동 테스트 대상에서 제외).

- [ ] **Step 1: 기존 단수 토큰 라우트 삭제**

```bash
cd /Users/kimkibin/development/prompt-ci-dashboard
git rm app/api/token/route.ts
```

- [ ] **Step 2: `GET`/`POST /api/tokens` 작성**

```ts
// app/api/tokens/route.ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseClient();
  const { data, error } = await admin
    .from("api_tokens")
    .select("id, name, token, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load tokens" },
      { status: 500 },
    );
  }

  return NextResponse.json({ tokens: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const token = randomUUID();
  const admin = getSupabaseClient();
  const { data, error } = await admin
    .from("api_tokens")
    .insert({ user_id: user.id, token, name })
    .select("id, name, token, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 3: `DELETE /api/tokens/[id]` 작성**

```ts
// app/api/tokens/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/admin";
import { deleteOwnedToken } from "@/lib/tokens";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const admin = getSupabaseClient();
  const { deleted } = await deleteOwnedToken(admin, id, user.id);

  if (!deleted) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
```

> `params`가 `Promise`인 이유: 이 저장소는 Next.js 16을 쓴다 — `AGENTS.md`가 route handler 시그니처를 훈련 데이터로 추측하지 말고 `node_modules/next/dist/docs/`를 확인하라고 명시한다. 구현 전에 `node_modules/next/dist/docs/`에서 dynamic route handler의 `params` 타입(Promise 여부)을 확인하고, 다르면 이 시그니처를 그에 맞게 고친다.

- [ ] **Step 4: 타입체크/빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공 (기존 `app/api/token/route.ts` import를 참조하는 곳이 없는지도 이 단계에서 같이 드러남).

- [ ] **Step 5: 수동 확인 — curl로 라우트 동작 점검**

로컬 dev 서버(`npm run dev`)를 띄운 상태에서, 브라우저로 `/login`에서 로그인해 세션 쿠키를 얻은 뒤:

```bash
# 브라우저 devtools에서 쿠키를 복사해 -H "Cookie: ..." 로 재현하거나,
# 이 단계는 Task 4의 UI를 통해 눈으로 확인해도 무방함 (Step 6 참고)
```

Expected: 이 단계는 Task 4에서 UI로 종합 확인하므로, 여기서는 `npm run build`가 통과하는 것으로 충분하다.

- [ ] **Step 6: Commit**

```bash
git add app/api/tokens app/api/token
git commit -m "Replace single-token API route with list/create/delete routes"
```

---

### Task 4: 프론트엔드 — `TokenList.tsx` + 대시보드 연동

**Files:**
- Create: `app/dashboard/TokenList.tsx`
- Delete: `app/dashboard/TokenCard.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/tokens`, `DELETE /api/tokens/[id]` from Task 3.
- Produces: 없음 (최종 UI 계층).

- [ ] **Step 1: 기존 `TokenCard.tsx` 삭제**

```bash
cd /Users/kimkibin/development/prompt-ci-dashboard
git rm app/dashboard/TokenCard.tsx
```

- [ ] **Step 2: `TokenList.tsx` 작성**

```tsx
// app/dashboard/TokenList.tsx
"use client";

import { useState } from "react";

type Token = {
  id: string;
  name: string;
  token: string;
  created_at: string;
};

export default function TokenList({
  initialTokens,
}: {
  initialTokens: Token[];
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createToken() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setTokens((prev) => [data, ...prev]);
        setName("");
      } else {
        setError(data.error ?? "Failed to generate token.");
      }
    } catch {
      setError("Failed to generate token.");
    } finally {
      setCreating(false);
    }
  }

  async function copyToken(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
  }

  async function revokeToken(id: string) {
    if (!confirm("Revoke this token? Anything using it will stop working.")) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to revoke token.");
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="mb-2 font-semibold text-gray-900">Your API tokens</h2>
      <p className="mb-3 text-sm text-gray-600">
        Set one as{" "}
        <code className="rounded bg-gray-200 px-1">PROMPTCI_TOKEN</code> so
        that{" "}
        <code className="rounded bg-gray-200 px-1">
          promptci run --upload
        </code>{" "}
        links to your account.
      </p>

      <div className="mb-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Local CI"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={createToken}
          disabled={creating}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {creating ? "Generating…" : "Generate token"}
        </button>
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm text-gray-500">No tokens yet.</p>
      ) : (
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-gray-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">
                  {t.name}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(t.created_at).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-gray-900 px-3 py-2 text-sm text-gray-100">
                  {t.token}
                </code>
                <button
                  onClick={() => copyToken(t.id, t.token)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
                >
                  {copiedId === t.id ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => revokeToken(t.id)}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: `app/dashboard/page.tsx`의 토큰 조회를 배열로 변경**

`app/dashboard/page.tsx`에서 아래 블록을:

```ts
import TokenCard from "./TokenCard";
```

```ts
  const { data: tokenRow, error: tokenError } = await admin
    .from("api_tokens")
    .select("token")
    .eq("user_id", user.id)
    .maybeSingle();
```

```tsx
        {tokenError ? (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn&apos;t load your token. Try refreshing the page.
          </p>
        ) : (
          <TokenCard initialToken={tokenRow?.token ?? null} />
        )}
```

아래처럼 각각 교체:

```ts
import TokenList from "./TokenList";
```

```ts
  const { data: tokenRows, error: tokenError } = await admin
    .from("api_tokens")
    .select("id, name, token, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
```

```tsx
        {tokenError ? (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn&apos;t load your tokens. Try refreshing the page.
          </p>
        ) : (
          <TokenList initialTokens={tokenRows ?? []} />
        )}
```

- [ ] **Step 4: 타입체크/빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 5: 단위 테스트 재확인**

Run: `npm test`
Expected: Task 2의 2개 테스트 모두 여전히 PASS.

- [ ] **Step 6: 로컬 수동 end-to-end 확인**

`npm run dev` 실행 후 브라우저에서:

1. `/login`으로 GitHub 로그인 → `/dashboard` 진입.
2. 이름 입력창에 `Local CI` 입력 후 "Generate token" 클릭 → 목록 맨 위에 새 토큰이 이름/생성일/값과 함께 나타나는지 확인.
3. 같은 방식으로 두 번째 토큰(`Second`)을 하나 더 생성 → 두 토큰이 모두 목록에 남아있는지 확인 (이전엔 두 번째 발급이 첫 번째를 덮어썼음).
4. 임의 토큰의 "Copy" 클릭 → 버튼이 "Copied!"로 잠깐 바뀌는지, 클립보드에 실제 값이 들어갔는지 확인.
5. 하나를 "Revoke" 클릭 → 확인 다이얼로그에서 확인 → 목록에서 사라지는지 확인.
6. 마이그레이션 전에 이미 토큰을 발급받은 계정이라면, `default`라는 이름의 토큰이 목록에 남아 있고 그 값이 기존과 동일한지 확인.
7. 그 `default` 토큰 값을 `PROMPTCI_TOKEN`에 설정하고 `prompt-ci-engine` 저장소에서 `promptci run --upload` 실행 → 정상 업로드되고 대시보드의 "Your runs" 목록에 뜨는지 확인 (검증 경로 무변경 확인).
8. 존재하지 않는 id로 `curl -X DELETE http://localhost:3000/api/tokens/00000000-0000-0000-0000-000000000000 -H "Cookie: <브라우저에서 복사한 세션 쿠키>"` 호출 → 404 확인.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard
git commit -m "Replace single-token dashboard card with multi-token list UI"
```

---

## Self-Review Notes

- **Spec coverage:** 마이그레이션(Task 1), API(Task 3), 프론트엔드(Task 4), 기존 토큰 `default` 이관(Task 1 Step 3 + Task 4 Step 6.6), 에러 처리 표(Task 3의 401/400/404/500 응답), 소유권 검증 단위 테스트(Task 2) — 스펙의 모든 섹션이 태스크로 매핑됨.
- **Placeholder scan:** 없음 — 모든 스텝에 실제 코드/명령어 포함.
- **Type consistency:** `deleteOwnedToken(admin, id, userId): Promise<{ deleted: boolean }>`가 Task 2와 Task 3(`app/api/tokens/[id]/route.ts`)에서 동일한 시그니처로 사용됨. `Token` 타입(`{id, name, token, created_at}`)이 API 응답(Task 3)과 `TokenList.tsx` props(Task 4)에서 동일하게 유지됨.
