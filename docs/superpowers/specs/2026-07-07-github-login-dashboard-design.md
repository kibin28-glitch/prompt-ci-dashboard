# GitHub 로그인 + 개인 대시보드 설계

## 배경

`prompt-ci-dashboard`는 현재 `promptci run --upload`가 올린 결과를 `/r/{runId}` 공유 링크로만 볼 수 있다. 업로드는 `PROMPTCI_TOKEN`(임의 문자열)으로 rate-limit만 걸려 있고, 계정 개념이 없어서 "내가 과거에 올린 run들"을 모아볼 방법이 없다.

이 스펙은 GitHub OAuth 로그인과 개인 대시보드(`/dashboard`)를 추가해서 이 문제를 해결한다. 기존 `/r/{runId}` 익명 공유 링크와 익명 업로드는 그대로 유지된다 — 로그인은 선택 사항이다.

## 목표

- GitHub 계정으로 로그인할 수 있다.
- 로그인한 사용자는 대시보드에서 자신의 개인 API 토큰을 확인/발급받을 수 있다.
- 그 토큰을 `PROMPTCI_TOKEN`에 설정하고 `promptci run --upload`를 실행하면, 업로드된 run이 자동으로 그 계정에 연결된다.
- `/dashboard`에서 로그인한 사용자의 run 목록을 최신순으로 볼 수 있다.

## 목표가 아닌 것 (out of scope)

- CLI의 `promptci login` 같은 OAuth 플로우 (CLI 코드 변경 없음)
- 여러 개의 API 토큰 관리 (사용자당 토큰 1개만)
- 팀/조직 단위 공유, 권한 관리
- GitHub Actions/PR 자동 코멘트 연동 (별도 스펙으로 분리)
- Row-Level Security(RLS) 정책 — 서버 코드에서 세션 기반으로 직접 필터링

## 아키텍처

### 인증
Supabase Auth의 GitHub OAuth Provider를 사용한다. 별도 인증 서버 없이 Supabase가 세션(쿠키)을 관리한다.

- 브라우저 클라이언트: `NEXT_PUBLIC_SUPABASE_ANON_KEY` 사용, `signInWithOAuth({ provider: 'github' })` 호출
- 서버(App Router): `@supabase/ssr`의 쿠키 기반 서버 클라이언트로 현재 세션의 `user`를 읽음
- 콜백: Supabase가 OAuth 코드를 처리한 뒤 `/auth/callback`으로 리다이렉트, 여기서 세션 쿠키를 굽는다(bake)

### 데이터베이스 변경 (`supabase/migrations/0002_auth_tokens.sql`)

```sql
alter table runs add column user_id uuid references auth.users(id);

create table api_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
```

- `runs.user_id`는 nullable — 익명 업로드는 계속 null로 남는다.
- `api_tokens`는 사용자당 정확히 1행. 재발급은 `token` 컬럼을 새 값으로 update.

### 업로드 흐름 변경 (`app/api/runs/route.ts`)

기존 흐름(token 검증 → rate limit 체크 → insert)에 한 단계만 추가:

1. `api_tokens`에서 `token`으로 조회해 `user_id` 획득 (없으면 `null`)
2. `runs` insert 시 `user_id` 컬럼에 포함

CLI(`prompt-ci-engine`) 코드는 변경 없음 — 이미 토큰을 그대로 서버에 보내고 있다.

### 새 페이지/라우트

| 경로 | 역할 |
|---|---|
| `app/login/page.tsx` | "Sign in with GitHub" 버튼 하나짜리 페이지 |
| `app/auth/callback/route.ts` | Supabase OAuth 콜백, 세션 쿠키 굽고 `/dashboard`로 리다이렉트 |
| `app/dashboard/page.tsx` | 서버 컴포넌트. 세션 없으면 `/login`으로 리다이렉트. 있으면 본인 run 목록(최신순, `user_id` 필터) + 토큰 카드 렌더링 |
| `app/api/token/route.ts` | `POST`: 현재 세션의 `user_id`로 `api_tokens` upsert(신규 발급/재발급), 새 토큰 반환 |

### 코드 구조 변경
- 기존 `lib/supabase.ts`(service-role 클라이언트)는 `lib/supabase/admin.ts`로 이동
- 신규 `lib/supabase/server.ts` — 쿠키 기반 서버 세션 클라이언트 (`@supabase/ssr`)
- 신규 `lib/supabase/client.ts` — 브라우저용 클라이언트 (anon key)
- `middleware.ts` — Supabase SSR 표준 패턴대로 세션 쿠키 갱신

### 토큰 표시 UI
`app/dashboard/page.tsx`는 서버 컴포넌트로 목록을 그리고, 토큰 카드 부분만 클라이언트 컴포넌트(`TokenCard.tsx`)로 분리해 "발급/재발급" 버튼 인터랙션과 클립보드 복사를 처리한다.

### 랜딩 페이지 변경
`app/page.tsx` 상단에 로그인 상태에 따라 "Dashboard" 또는 "Sign in with GitHub" 링크를 추가해 `/dashboard` 진입 경로를 만든다 (서버 컴포넌트에서 세션 유무만 확인해 링크 텍스트/경로 분기).

## 권한/보안

- `/dashboard`, `/api/token`은 서버에서 세션 유무를 확인한 뒤에만 동작 (미로그인 시 `/login` 리다이렉트 또는 401)
- DB 접근은 계속 service-role 키(admin 클라이언트)로 하되, 쿼리에 항상 로그인된 `user.id`를 조건으로 명시 — RLS는 도입하지 않는다 (서버 라우트가 신뢰된 코드이므로 MVP 범위에서는 충분)
- `api_tokens.token`은 추측 불가능한 랜덤 문자열(`crypto.randomUUID()` 등)로 생성

## 사용자가 직접 해야 하는 설정 (계정/브라우저 작업)

1. GitHub에서 OAuth App 생성 (github.com/settings/developers → New OAuth App)
   - Homepage URL: `https://prompt-ci-dashboard.vercel.app`
   - Authorization callback URL: Supabase 프로젝트의 콜백 URL (`https://<project-ref>.supabase.co/auth/v1/callback`)
2. Supabase 대시보드 → Authentication → Providers → GitHub 활성화, Client ID/Secret 입력
3. Supabase 대시보드 → Authentication → URL Configuration에 `https://prompt-ci-dashboard.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` 등록

## 에러 처리

- `/api/runs`에서 토큰이 `api_tokens`에 없으면 (익명 토큰) — 기존처럼 정상 업로드, `user_id`만 null
- `/dashboard` 접근 시 세션 만료/없음 — `/login`으로 리다이렉트
- `/api/token` 미인증 호출 — 401 반환
- GitHub OAuth 실패/취소 — Supabase가 에러 쿼리 파라미터와 함께 콜백 호출, `/login?error=...`로 리다이렉트해 메시지 표시

## 테스트/검증 계획

- `npm run build`로 타입체크/빌드 통과 확인
- 로컬에서 GitHub OAuth 로그인 → 토큰 발급 → `PROMPTCI_TOKEN`에 설정 → `promptci run --upload` → `/dashboard`에 해당 run이 뜨는지 수동 end-to-end 확인
- 익명 토큰(계정 미연결)으로 업로드 시 기존처럼 `/r/{runId}`는 정상 동작하고 `/dashboard`에는 안 뜨는지 확인
