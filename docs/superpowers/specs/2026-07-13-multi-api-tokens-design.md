# 다중 API 토큰 관리 설계

## 배경

현재 `api_tokens` 테이블은 `user_id`가 primary key라서 사용자당 정확히 1개의 토큰만 존재할 수 있다(2026-07-07 GitHub 로그인 + 개인 대시보드 스펙에서 명시적으로 out of scope로 남겨둔 부분). 여러 환경(로컬, CI, 여러 프로젝트)에서 하나의 토큰을 공유하면 한 환경 문제로 토큰을 재발급할 때 다른 모든 환경이 같이 끊긴다. 이 스펙은 사용자당 여러 개의 이름 붙은 토큰을 발급/조회/폐기할 수 있게 한다.

## 목표

- 로그인한 사용자는 이름을 붙여 새 API 토큰을 여러 개 발급할 수 있다.
- 대시보드에서 자신의 모든 토큰(이름, 생성일, 값)을 목록으로 볼 수 있다.
- 각 토큰을 개별적으로 폐기(삭제)할 수 있다.
- 기존에 발급된 단일 토큰은 마이그레이션 시 이름 `default`로 자동 이관되어, CI 등에 이미 박혀 있는 토큰 값은 그대로 유효하다.

## 목표가 아닌 것 (out of scope)

- 사용자당 토큰 개수 제한
- 토큰 만료(expiry), "마지막 사용 시간" 추적
- 토큰 값을 해시로 저장하거나 "생성 시에만 표시"하는 방식으로 전환 — 평문 저장/상시 조회 가능한 현재 모델 유지
- 팀/조직 단위 토큰 공유
- 삭제 재확인 이상의 정교한 삭제 플로우(예: 유예 기간, 되돌리기)

## 아키텍처

### 데이터베이스 변경 (`supabase/migrations/0004_multi_api_tokens.sql`)

```sql
alter table api_tokens add column id uuid not null default gen_random_uuid();
alter table api_tokens add column name text not null default 'default';

alter table api_tokens drop constraint api_tokens_pkey;
alter table api_tokens add constraint api_tokens_pkey primary key (id);
create index api_tokens_user_id_idx on api_tokens (user_id);
```

- `token` 컬럼의 기존 `unique` 제약은 그대로 유지한다 — 검증 경로(`/api/runs`)가 `eq("token", token)`으로 단일 행을 찾는 데 계속 의존하기 때문이다.
- `user_id`는 더 이상 primary key가 아니므로 한 사용자가 여러 행을 가질 수 있다. 컬럼에 이미 선언된 `references auth.users(id) on delete cascade`는 그대로 유지된다.
- `name` 컬럼 추가 시 기존 행은 DB 기본값(`'default'`)으로 자동 백필된다 — 별도 데이터 마이그레이션 스크립트가 필요 없다.
- 애플리케이션은 신규 생성 시 항상 `name`을 명시적으로 채워 보내지만, 컬럼의 `not null default 'default'`는 예외적인 경로에서도 제약 위반이 나지 않도록 그대로 둔다.

### API 라우트

기존 `app/api/token/route.ts`(단수, upsert 방식)는 폐기하고 아래로 교체한다.

**`app/api/tokens/route.ts`**
- `GET` — 세션 쿠키로 인증(없으면 401). 현재 사용자의 모든 토큰을 `created_at` 내림차순으로 `[{id, name, token, created_at}]` 형태로 반환.
- `POST` — body `{name: string}` 필수. `name`이 없거나 공백뿐이면 400. `randomUUID()`로 토큰 값을 생성해 `insert({user_id, token, name})`(upsert 아님 — 사용자당 여러 행이 허용되므로), 생성된 행을 반환.

**`app/api/tokens/[id]/route.ts`**
- `DELETE` — `.delete().eq("id", id).eq("user_id", user.id).select()`로 소유자 검증과 삭제를 하나의 원자적 쿼리로 처리한다(TOCTOU 없음). 반환된 행이 0개면(존재하지 않거나 남의 토큰) 404, 1개면 `{success: true}`.

**검증 경로(`app/api/runs/route.ts`, `lib/rateLimit.ts`)는 변경 없음** — `token` 컬럼은 여전히 전역 유일하므로 기존 `eq("token", token)` 조회가 그대로 동작한다.

에러 응답은 기존 컨벤션대로 `NextResponse.json({error}, {status})` 형태를 유지한다.

### 프론트엔드

- `app/dashboard/page.tsx`: 기존 단일 행 조회(`.maybeSingle()`)를 `user_id`로 필터링된 배열 조회로 변경하고, 결과를 `<TokenList>`에 배열로 전달한다.
- `TokenCard.tsx` → `TokenList.tsx`로 교체. `"use client"`, 기존처럼 SWR 없이 순수 `fetch` + `useState` 사용.
  - 상단: 이름 입력 폼(텍스트 입력, 제출 시 `POST /api/tokens`) — 성공하면 목록 맨 위에 새 항목 추가.
  - 목록: 각 토큰을 행으로 표시 — 이름, 생성일, 토큰 값(현재처럼 항상 노출) + 복사 버튼, 폐기 버튼.
  - 폐기 버튼은 `confirm()`으로 오클릭을 방지한 뒤 `DELETE /api/tokens/[id]` 호출, 성공하면 목록에서 해당 항목을 제거.
  - 토큰이 0개면 "아직 발급된 토큰이 없습니다" 빈 상태 문구를 보여준다.
- 기존 `copyToken()`의 클립보드 로직(`navigator.clipboard.writeText`)은 행 단위로 재사용한다.

## 마이그레이션 후 기존 사용자 처리

기존에 토큰을 발급받은 사용자는 마이그레이션 직후 이름이 `default`인 토큰 1개를 그대로 갖게 된다. CLI/GitHub Action에 이미 설정된 토큰 값은 그대로 유효하며, 사용자가 아무 조치를 하지 않아도 된다.

## 에러 처리

| 상황 | 응답 |
|---|---|
| 미로그인 상태로 `/api/tokens` 호출 | 401 `{error: "Not authenticated"}` |
| `POST` body에 `name` 없음/공백만 | 400 `{error: "Name is required"}` |
| `DELETE`할 id가 없거나 남의 소유 | 404 `{error: "Token not found"}` |
| DB 에러(insert/delete 실패) | 500 `{error: "Failed to ..."}` |

이름 길이 제한은 별도로 두지 않는다(DB `text` 컬럼, UI는 긴 입력을 자연스럽게 줄바꿈 처리).

## 테스트/검증 계획

이 저장소는 테스트 프레임워크가 전혀 없는 상태(단일 사이드 프로젝트 MVP)이므로, 이번 기능을 위해 전체 테스트 인프라를 새로 도입하지는 않는다. 다만 `DELETE /api/tokens/[id]`의 소유권 검증 로직은 버그가 나도 조용히 넘어가고(다른 사용자의 토큰을 삭제할 수 있게 됨) 수동 테스트로 잘 드러나지 않는 유형이므로, 이 부분만 최소 단위 테스트로 좁게 커버한다(Vitest 단일 파일, `eq("id", id).eq("user_id", user.id)` 필터가 빠지면 실패하도록).

그 외는 수동으로 검증한다:
- `npm run build`로 타입체크/빌드 통과 확인
- 새 토큰 발급(이름 입력) → 목록에 표시 → 값 복사 → 폐기 → 목록에서 사라짐 확인
- 마이그레이션 후 기존 계정에 `default` 이름의 토큰이 그대로 남아있고, 그 값으로 `promptci run --upload`가 계속 동작하는지 확인
- 남의 토큰 id로 `DELETE` 시도 시 404 확인
