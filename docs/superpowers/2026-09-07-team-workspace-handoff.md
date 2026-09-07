# 팀 워크스페이스 — 인수인계

작성 2026-09-07 · 대상: `feat/ad-master-plan` 에서 작업 중인 쪽

두 작업이 같은 저장소에서 나란히 돌았습니다. 이 문서는 **팀 워크스페이스 쪽이
무엇을 바꿨고, 그쪽 작업과 어디서 만나는지**를 적은 것입니다.

---

## 1. 지금 상태 한눈에

| | 상태 |
|---|---|
| PR #27 (기능 전체) | **master 에 머지됨** (`7bcaa84`) |
| PR #29 (디자인 정렬 + 로컬 버그) | **열려 있음.** 머지 대기 |
| 마이그레이션 3건 | **운영 DB 에 적용 완료** (2026-09-07) |
| EC2 배포 | **안 함.** 서버는 아직 옛 코드 |

**중요: DB 는 이미 새 스키마이고 코드는 아직 옛 버전입니다.** 그래도 문제가
없습니다 — 더한 칸·트리거·함수가 전부 「팀이 없으면 지금과 같다」로
동작하도록 만들어져 있습니다.

---

## 2. 무엇을 만들었나

한 문장: **한 사람이 한 팀에 속하고, 같은 팀끼리 작업물을 보며, 크레딧을
팀 단위로 나눠 쓴다.**

### 화면

`/team` 한 곳입니다. 네 탭이고 주소(`?tab=`)로 오갑니다.

| 탭 | 무엇 | 누가 |
|---|---|---|
| 팀원 | 명단 · 배정 · 팀장 지정 | 운영자 = 전부, 팀장 = 자기 팀 |
| 프로젝트 | 갈래 만들기 · 이름 · 차례 · 접기 | 〃 |
| 크레딧 | 팀 잔량 막대 · 팀원별 사용량 · 개인 상한 | 〃 |
| 작업물 | 팀이 만든 것 전부 · 갈래로 넣기 | 〃 |

사이드바에 **팀** 메뉴(소속 있는 사람·운영자만)와 **프로젝트 목록**이 붙습니다.
프로젝트를 고르면 라이브러리·카드뉴스·이미지가 그 갈래만 보여 줍니다.

### 보이는 범위 규칙

| 대상 | 팀 없음 | 팀 있음 | 운영자 |
|---|---|---|---|
| 작업물(카드뉴스·이미지·상세페이지) | 만든 사람만 | 같은 팀 | 전부 |
| 참고 이미지 | **누구나** (공용 창고) | 같은 팀 + 내 것 | 전부 |
| 캐릭터 | 만든 사람만 | 같은 팀 | 전부 |

참고 이미지만 다른 이유: 「따라 그릴 본보기」라 공유가 이득입니다. 팀에 묶인
것만 그 팀 안으로 좁힙니다.

### 크레딧

```
팀 없음        개인 상한 그대로
팀 한도 0      개인 상한 그대로   ← 「아직 안 정했다」는 뜻
그 밖          min(개인 상한, 팀 한도 − 팀원들이 이미 쓴 것)
```

---

## 3. 바뀐 파일 — 그쪽과 겹치는 곳

### 새로 생긴 것 (겹칠 일 없음)

```
apps/web/app/team/**              화면 8개
apps/web/lib/teams/**             규칙·저장소 9개 + 시험 9개
supabase/migrations/2026090700{04,05,06}_*.sql
```

### 기존 파일을 고친 것 — **여기를 보세요**

| 파일 | 무엇을 했나 | 그쪽과 |
|---|---|---|
| `lib/server-library.ts` | 읽기 범위를 팀까지 넓힘, 자식은 부모로 판정 | **겹칩니다** ↓ |
| `lib/poster/supabase-store.ts` | 목록에 팀·프로젝트 조건 | 안 겹침 |
| `lib/characters.ts` | 목록·한 명 찾기에 팀 조건 | 안 겹침 |
| `lib/reference-images.ts` | 목록에 팀 조건 | 안 겹침 |
| `lib/membership/api.ts` | `team_quota_exceeded` 메시지 추가 | 안 겹침 |
| `app/api/sns/projects/{route,project-store,project-service}.ts` | 프로젝트 필터 | 안 겹침 |
| `app/api/library/route.ts` | 세션에서 팀·프로젝트를 꺼내 넘김 | 안 겹침 |
| `app/api/{characters,pdp/images,pdp/images/batch,redesign/generate}/route.ts` | 팀 캐릭터를 쓸 수 있게 | 안 겹침 |
| `app/_components/studio-layout.tsx` | 팀 메뉴·프로젝트 목록 | 안 겹침 |
| `packages/ui/src/components/app-shell.tsx` | 팀 메뉴, 프로젝트 목록, 현재 갈래 알림줄 | 안 겹침 |
| `app/create/PdpEditor.tsx` | `team_quota_exceeded` 도 배치 중단 사유 | 안 겹침 |
| `lib/access/**`, `lib/storage/signing.ts` | 권한 판단 한 곳으로, 서명을 서버 권한으로 | 안 겹침 |

---

## 4. 충돌 — 지금 알려진 두 자리

`git merge-tree origin/master feat/ad-master-plan` 이 두 자리에서 충돌합니다.

```
apps/web/lib/server-library.ts
apps/web/app/api/poster/projects/[id]/images/[index]/file/route.ts
```

**두 자리 모두 팀 작업 때문에 생긴 것이 아닙니다.** 재 봤습니다.

```
master ↔ feat/ad-master-plan       → 2건
feat/team-workspace ↔ 같은 브랜치  → 같은 2건. 늘지 않음
```

`feat/ad-master-plan` 이 **옛 master(`91888b3`) 위에 서 있어서** 그렇습니다.
그 사이에 master 로 들어간 것이 두 뭉치입니다.

1. `e52e0e7 refactor(access)` — 흩어져 있던 권한 판단을 `lib/access/core.ts` 로 모음
2. 팀 작업 7개 커밋

### `lib/server-library.ts` 충돌 푸는 법

그쪽은 `libraryScope(viewer, action)` 에 `"export"` 를 더하고 있습니다.
master 에서는 그 함수가 이렇게 바뀌었습니다.

```ts
// 전 (그쪽 기준)
export function libraryScope(viewer, action: "read" | "delete"): string | null {
  if (viewer.role === "admin") return null;
  return viewer.userId;
}

// 후 (master)
export function libraryScope(viewer: LibraryViewer, action: ScopeAction): string | undefined {
  return ownerFilter(viewer, action);   // lib/access/core.ts 가 판단한다
}
```

**바뀐 것 둘.** 판단이 `lib/access/core.ts` 로 옮겨 갔고, 못 찾을 때 `null` 이
아니라 `undefined` 를 줍니다(`null` 을 `.eq()` 에 넘기면 한 줄도 안 지우면서
오류도 안 나는 함정이 있었습니다).

그래서 `"export"` 를 더할 자리는 `lib/access/core.ts` 의 `ScopeAction` 과
`ownerFilter()` 입니다. 「관리자여도 자기 것만」이라는 그쪽 판단은 그대로
살릴 수 있습니다 — `ownerFilter` 안에서 `action === "export"` 를 먼저 보면
됩니다.

`getLibraryImageFile()` 도 바뀌었습니다. 자식 표(`library_images`)에서
`user_id` 조건을 떼고, 대신 **부모(`library_items`)가 보이는지 먼저 확인**
합니다. 그쪽이 이 함수에 `purpose` 인자를 더하는 중이면, 부모 확인 쪽에
그 인자를 넘기면 됩니다.

### 다른 한 자리

`poster/projects/[id]/images/[index]/file/route.ts` 는 팀 작업이 손대지 않은
파일입니다. master 쪽 변경과 그쪽 변경이 만난 것이라 그쪽이 판단하시면 됩니다.

### 권하는 순서

```
git fetch origin
git merge origin/master        # 또는 rebase
# 위 두 자리를 풀고
pnpm -r test && pnpm --filter web typecheck
```

---

## 5. 배포할 때 — 마이그레이션은 이미 끝났습니다

**추가로 돌릴 SQL 이 없습니다.** 세 건 모두 2026-09-07 에 적용했고 확인했습니다.

| 마이그레이션 | 확인 |
|---|---|
| `202609070004_team_stamp.sql` | 도장 트리거 6개 |
| `202609070005_team_credit.sql` | `max_reserve_units()` = 60, 표 check 가 함수를 봄 |
| `202609070006_reference_team_scope.sql` | `reference_visible()` 동작 확인 |

### 배포해도 오늘 아무 일이 안 일어납니다

- 팀이 하나도 없어서 모든 `team_id` 가 비어 있습니다
- 팀 한도가 0 이라 크레딧 계산이 지금과 같습니다
- 참고 이미지는 팀이 붙어야 좁아집니다

**실제로 달라지는 것은 첫 팀을 만들고 사람을 배정하는 순간부터입니다.**
배정 창이 「이 사람이 올린 참고 이미지가 팀 것이 됩니다」를 미리 알려 줍니다.

---

## 6. 6단계에서 함께 고친 옛 사고

2026-09-04 에 예약이 전량 실패한 원인은 **같은 값(60)이 두 곳에 있었던 것**
입니다. 함수만 10 → 60 으로 올리고 표의 `check` 는 10 그대로였습니다.

이번에 `max_reserve_units()` 하나를 두고 함수와 표의 `check` 가 그것을
부르게 했습니다. 시험이 **「숫자 60 이 파일에 한 번만 나온다」**를 붙잡습니다.

> 앞으로 상한을 올릴 때는 `202609070005_team_credit.sql` 의
> `max_reserve_units()` **한 곳만** 고치면 됩니다.

---

## 7. 아직 안 된 것 — 넘겨 드리는 목록

### 팀 작업이 일부러 물린 것

**광고 규격 뽑기의 팀 범위.** `api/ad/export/route.ts` 와 그 시험을 그쪽이
고치고 있어서, 충돌을 피하려고 물렸습니다.

지금 상태: 팀원의 그림을 라이브러리에서 **보고 열 수는 있지만**, 광고 규격으로
뽑을 때는 자기 것만 됩니다. 그쪽 작업이 병합된 뒤에 한 줄이면 이어집니다.

```ts
// api/ad/export/route.ts — getLibraryImageFile 에 넘기는 viewer 에
teamId: await teamIdOf(auth.member.userId),
```

다만 그쪽이 「export 는 관리자여도 자기 것만」으로 좁히는 중이라면, **팀까지
넓힐지는 그쪽 판단이 우선입니다.** 뽑기는 서비스 밖으로 파일이 나가는 일이라
보기와 무게가 다릅니다.

### 확인하지 못한 것

**팀을 실제로 만들어 본 적이 없습니다.** 지금까지 팀을 만든 사람이 아무도
없어서, 아래는 코드와 시험으로만 확인된 상태입니다.

- 팀 만들기 → 사람 배정 → 작업물이 실제로 팀에 붙는지
- 팀원이 서로의 작업물을 보는지
- 팀 한도를 정했을 때 크레딧이 실제로 나뉘는지
- 참고 이미지가 팀 밖에서 실제로 안 보이는지

되돌릴 수 있게 만들어 두었습니다 — 팀에서 빼면 `team_id` 가 다시 비고 전부
개인 것으로 돌아옵니다.

### 원래 있던 것 (팀 작업과 무관)

- **`/admin` 은 로컬 모드에서 500 입니다.** `createSupabaseAdminClient()` 를
  안전장치 없이 부릅니다. 팀 작업이 건드린 파일이 아닙니다
- 라이브러리 참고 이미지 탭에 작은 사본이 안 붙습니다

---

## 8. 검증 기록

| | |
|---|---|
| 타입 | `tsc --noEmit` exit 0 |
| 시험 | 웹 **939건** · 패키지 전부 통과 |
| 빌드 | 성공 |
| 로컬 실행 | 여섯 화면 200 (`/library` `/sns` `/poster` `/team` `/settings` `/characters`) |
| 마이그레이션 | Red-Green 3회 — 일부러 망가뜨려 시험이 잡는 것을 확인 |

### 로컬 실행에서 잡힌 버그 하나

셸이 모든 화면에서 팀을 묻는데, 로컬은 Supabase 환경변수를 비워 둡니다.
그래서 **팀과 무관한 화면까지 전부 500** 이 났습니다. 타입 검사도 시험 930건도
빌드도 못 잡았고, 서버를 띄워서야 드러났습니다. PR #29 에서 고쳤습니다.

> 셸(`studio-layout`)에 뭔가를 더할 때는 로컬 모드를 꼭 확인하세요.
> `LOCAL_STORE=1 LOCAL_AUTH_BYPASS=1` 로 띄우면 됩니다.

---

## 9. 설계 문서와 다르게 한 것

| 설계 | 실제 | 왜 |
|---|---|---|
| 배정 창을 두 열 이동 모달로 | 오른쪽 슬라이드 | 이 앱의 다른 창이 전부 오른쪽 슬라이드다 |
| 팀원 탭 주인 = 팀장 | 팀 만들기는 운영자, 팀 안 꾸리기는 팀장 | 팀을 만드는 건 회사 구조를 정하는 일이다 |
| 팀 없는 사람은 참고 이미지도 자기 것만 | 팀 안 붙은 것은 누구나 | 그대로 하면 배포일에 전원이 공용 창고를 잃는다 |
| 팀 한도 = 팀원 상한의 합으로 자동 설정 | 0(=안 정함)으로 두고 화면이 제안만 | 팀을 만든 순간 쓸 수 있는 양이 줄면 사고다 |
