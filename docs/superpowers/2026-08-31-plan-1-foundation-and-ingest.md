# 계획 1 — 기반과 수집 시스템

> **작업자에게:** 태스크를 순서대로 **하나씩** 합니다. 각 태스크의 Step 을 순서대로 지키세요 —
> 테스트 먼저 → 실패 확인 → 최소 구현 → 통과 확인 → 커밋. 진행은 체크박스(`- [ ]`)로 표시합니다.
>
> Claude Code 로 실행한다면 `superpowers:subagent-driven-development` 또는
> `superpowers:executing-plans` 스킬을 쓰세요. **다른 환경이면 위 순서를 그대로 따르면 됩니다 —
> 스킬은 필수가 아닙니다.**

**Goal:** `detail-page-studio` 를 새 저장소 `Fixup Image Agent` 로 복제해 새 EC2 에 올리고, 스텝 UI 를 통일한 뒤, 수집 미디어 · 수집함 · 참고 이미지 라이브러리를 더한다.

**Architecture:** pnpm 모노레포를 그대로 유지한다. `packages/ingest-core` 를 새로 만들어 수집 도메인을 담고, `apps/worker` 를 systemd 서비스로 따로 돌린다. Supabase 는 상세페이지 것을 그대로 쓰되 **새 테이블만 추가**한다. 화면은 기존 `packages/ui` 의 shadcn 컴포넌트로 만든다.

**Tech Stack:** pnpm 모노레포 · Next.js App Router · TypeScript · Tailwind + shadcn/ui · Radix · lucide-react · zod · vitest · Supabase(PostgreSQL/RLS) · Caddy + systemd

**Spec:** `docs/2026-08-31-sns-integration-design.md`

## Global Constraints

- **같은 Supabase 를 개인 배포와 공유한다.** 새 테이블만 추가한다. **기존 테이블의 컬럼을 바꾸거나 지우지 않는다.** 어기면 개인 배포(`detail-page-studio`)가 죽는다.
- 마이그레이션 파일명은 `YYYYMMDDNNNN_name.sql`. **우리는 `202608` 부터 쓴다.** 기존 저장소는 `202607` 까지 썼다.
- **컬럼 권한은 회수가 아니라 허용 목록으로 쓴다.** `revoke update on <table>` 을 먼저 하고 `grant update (col, ...)` 를 준다. 테이블 GRANT 뒤의 컬럼 REVOKE 는 아무 일도 하지 않는다.
- **씨앗 저장소의 스키마 규약을 따른다.** 소유자 칸은 `user_id`, 참조는 `public.profiles(id)`,
  RLS 는 `(select auth.uid()) = user_id`, 정책 이름은 `"members manage own <대상>"`.
  `owner_id` 나 `auth.users` 직접 참조를 쓰지 않는다. 팀 개념을 만들지 않는다.
- **이미지는 Supabase Storage 버킷 `library` 에 넣는다.** 로컬 디스크에 쓰지 않는다.
  경로 첫 칸이 `{user_id}` 여야 기존 Storage RLS 가 적용된다 — **새 정책을 만들 필요가 없다.**
  참고 이미지는 `{user_id}/references/{id}.{ext}`.
- CardForge(`instargram automation`) 코드는 **복사**한다. `import` 로 연결하지 않는다. 복사한 파일은 새 프로젝트의 것이다.
- 화면 컴포넌트는 `packages/ui` 의 shadcn 을 쓴다. 새 CSS 클래스를 손으로 만들지 않는다.
- **쉬운 화면 원칙 6가지**를 모든 화면에 적용한다 — 한 화면에 한 결정 · 선택하면 결과를 그 자리에서 · 돈 드는 버튼에 금액 · AI 가 정한 건 회색 · 기다릴 때 무엇을 하는 중인지 문장으로 · 되돌리기가 항상 있음.
- 명령: `pnpm typecheck` · `pnpm test` · `pnpm build`
- 기준 상태: 씨앗을 복제한 직후의 테스트가 전부 통과해야 한다. Task 1 에서 그 수를 기록하고, 이후 모든 태스크가 그 수 이상이어야 한다.

---

# Phase 1 — 씨앗

## Task 1: 새 저장소를 만들고 씨앗을 심는다

**Files:**
- Create: 저장소 전체 (`detail-page-studio` 복제)
- Modify: `package.json` · `README.md` · `apps/web/package.json`
- Test: 없음 (복제 검증은 기존 테스트로 한다)

**Interfaces:**
- Consumes: 없음
- Produces: `junginsu-make/fixup-image-agent` 저장소. 로컬 `C:\Users\PC\Desktop\coding\fixup-image-agent`

- [ ] **Step 1: 원본을 클론해 새 폴더로 옮긴다**

```bash
cd "C:/Users/PC/Desktop/coding"
gh repo clone junginsu-make/detail-page-studio fixup-image-agent
cd fixup-image-agent
rm -rf .git
```

`.git` 을 지우는 것이 요점이다. **원본의 이력을 가져오지 않는다.** 새 제품이고, 원본이 개인 것이라 이력이 섞이면 안 된다.

- [ ] **Step 2: 이름을 바꾼다**

`package.json`:

```json
{
  "name": "fixup-image-agent",
  "private": true
}
```

`apps/web/package.json` 의 `name` 을 `@fixup/web` 으로, `packages/*/package.json` 의 `@detail-page/*` 를 `@fixup/*` 으로 바꾼다. 참조하는 곳도 함께 바꾼다:

```bash
grep -rl "@detail-page/" --include=*.json --include=*.ts --include=*.tsx . | xargs sed -i 's|@detail-page/|@fixup/|g'
```

`README.md` 첫 줄을 `# Fixup Image Agent` 로 바꾸고, 아래에 한 문단을 넣는다:

```markdown
상세페이지 · 리디자인 · 카드뉴스 · 포스터를 한 곳에서 만든다.
`detail-page-studio` 를 씨앗으로 복제했으나 이후로는 별개 제품이다. 원본을 참조하지 않는다.
```

- [ ] **Step 3: 설치하고 기존 테스트가 통과하는지 본다**

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

**여기서 통과한 테스트 수를 기록한다.** 이후 모든 태스크가 이 수 이상이어야 한다.
하나라도 실패하면 이름 바꾸기에서 놓친 참조가 있다. `pnpm typecheck` 의 오류를 따라간다.

- [ ] **Step 4: 설계 문서를 저장소 안으로 옮긴다**

계획서가 저장소 밖에 있으면 이력이 갈라지고, 나중에 왜 그렇게 만들었는지 찾을 수 없다.

```bash
mkdir -p docs/superpowers
cp "C:/Users/PC/Desktop/coding/content-studio/docs/2026-08-31-sns-integration-design.md" docs/superpowers/
cp "C:/Users/PC/Desktop/coding/content-studio/docs/2026-08-31-plan-1-foundation-and-ingest.md" docs/superpowers/
cp "C:/Users/PC/Desktop/coding/content-studio/docs/2026-08-31-plan-2-cardnews.md" docs/superpowers/
cp "C:/Users/PC/Desktop/coding/content-studio/docs/2026-08-31-poster-studio-design.md" docs/superpowers/
cp "C:/Users/PC/Desktop/coding/content-studio/docs/2026-08-31-poster-studio.md" docs/superpowers/
```

**이후로는 저장소 안의 문서가 정본이다.** 밖의 사본은 참조하지 않는다.

- [ ] **Step 5: 새 GitHub 저장소에 올린다**

```bash
git init
git add -A
git commit -m "chore: detail-page-studio 를 씨앗으로 Fixup Image Agent 를 시작한다"
gh repo create junginsu-make/fixup-image-agent --private --source=. --push
```

- [ ] **Step 6: 확인**

```bash
gh repo view junginsu-make/fixup-image-agent --json name,isPrivate
git log --oneline
```

Expected: 커밋 1개, private 저장소

---

## Task 2: 새 EC2 에 올린다

**Files:**
- Modify: `deploy/ec2/Caddyfile.template` · `deploy/ec2/app.env.example` · `deploy/ec2/*.service`
- Create: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: Task 1 의 저장소
- Produces: 도는 웹 서비스. 기존 상세페이지와 **다른 인스턴스**

- [ ] **Step 1: 서비스 이름을 바꾼다**

`deploy/ec2/detail-page-studio.service` 를 `fixup-image-agent.service` 로 옮기고 안의 이름·경로를 바꾼다.
`deploy-release.sh` · `rollback-release.sh` · `install-host.sh` 안의 서비스명도 함께 바꾼다.

```bash
grep -rn "detail-page-studio" deploy/ scripts/
```

**남는 것이 없어야 한다.** 하나라도 남으면 개인 배포의 서비스를 건드릴 수 있다.

- [ ] **Step 2: 환경변수 표를 만든다**

`deploy/ec2/app.env.example` 에 아래를 더한다. **값은 넣지 않는다.**

```
# 이미지 생성
FAL_KEY=

# 기획·원고 (메인)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5

# 기획·원고 백업 · 검수 · 웹 검색
OPENAI_API_KEY=
OPENAI_DRAFT_MODEL=gpt-5.6-sol
OPENAI_RESEARCH_MODEL=
OPENAI_VISION_REVIEW_MODEL=

# 유튜브 자막 우회 (EC2 IP 차단 때문에 필수)
APIFY_TOKEN=
APIFY_YOUTUBE_ACTOR=automation-lab~youtube-transcript
```

**Supabase 값은 기존 상세페이지와 같은 것을 넣는다.** 같은 DB 를 쓴다.

- [ ] **Step 3: 새 EC2 인스턴스를 만들고 설치한다**

`docs/DEPLOY.md` 에 절차를 적는다:

```markdown
# 배포

## 처음 한 번
1. EC2 인스턴스 생성 (t3.small 이상 — 워커가 함께 돈다)
2. 탄력적 IP 할당
3. 보안 그룹: 22(내 IP) · 80 · 443
4. `deploy/ec2/install-host.sh` 실행 — Node · Caddy · systemd 설치
5. `/etc/fixup-image-agent/app.env` 에 환경변수 기록
6. Caddy 에 도메인 등록 (HTTPS 자동)

## 매 배포
```bash
node scripts/prepare-ec2-release.mjs
bash deploy/ec2/deploy-release.sh
```

## 되돌리기
```bash
bash deploy/ec2/rollback-release.sh
```
```

**개인 배포와 다른 인스턴스여야 한다.** 같은 서버에 두 서비스를 올리지 않는다.

- [ ] **Step 4: 확인**

```bash
curl -s -o /dev/null -w "%{http_code}" https://<도메인>/login
```

Expected: 200. 그리고 **상세페이지 계정으로 로그인이 된다.** 같은 Supabase 를 보기 때문이다.

- [ ] **Step 5: 커밋**

```bash
git add deploy scripts docs/DEPLOY.md
git commit -m "chore(deploy): 새 EC2 배포 설정을 만든다"
```

---

# Phase 2 — 스텝 UI 통일

## Task 3: 공용 StepBar 를 만든다

지금 `/create` 와 `/redesign` 이 서로 다른 스텝 UI 를 쓴다. 07-21 개편 때 각자 따로 고쳐 갈라졌다.

**Files:**
- Create: `packages/ui/src/components/step-bar.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/components/__tests__/step-bar.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `StepBar` · `StepDefinition { id: string; label: string; desc?: string }` · `stepState(steps, current, id): "done" | "active" | "todo"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/ui/src/components/__tests__/step-bar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stepState, canJumpTo } from "../step-bar";

const steps = [
  { id: "a", label: "내용" },
  { id: "b", label: "이미지" },
  { id: "c", label: "규격" },
];

describe("단계 상태", () => {
  it("지난 단계는 done, 현재는 active, 남은 것은 todo", () => {
    expect(stepState(steps, "b", "a")).toBe("done");
    expect(stepState(steps, "b", "b")).toBe("active");
    expect(stepState(steps, "b", "c")).toBe("todo");
  });

  it("모르는 단계는 todo 로 본다", () => {
    expect(stepState(steps, "b", "없음")).toBe("todo");
  });
});

describe("이동 가능 여부", () => {
  it("지난 단계로는 돌아갈 수 있다", () => {
    // 리디자인은 대시보드로 돌아가야 한다. 막으면 막다른 길이 생긴다.
    expect(canJumpTo(steps, "c", "a")).toBe(true);
  });

  it("현재 단계는 눌러도 아무 일이 없다", () => {
    expect(canJumpTo(steps, "b", "b")).toBe(false);
  });

  it("안 지난 단계로는 갈 수 없다", () => {
    // 업로드 없이 분석으로 가면 빈 화면이 나온다.
    expect(canJumpTo(steps, "a", "c")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/ui test`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`packages/ui/src/components/step-bar.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * 진행 단계 표시 — 세 도구가 같이 쓴다.
 *
 * 07-21 개편 때 /create 는 StepBar 를, /redesign 은 인라인 버튼을 각자 만들어
 * 모양과 동작이 갈라졌다. 같은 앱에서 하나는 진행 막대, 하나는 탭처럼 보였다.
 *
 * 클릭 정책은 두 쪽의 절충이다. /create 는 전부 막았고 /redesign 은 전부 열었는데,
 * **지난 단계만 여는 것**이 두 요구를 다 만족한다 — 되돌아갈 수는 있고,
 * 앞 단계를 건너뛰어 빈 화면에 도달하지는 않는다.
 */

export interface StepDefinition {
  id: string;
  label: string;
  desc?: string;
}

export type StepState = "done" | "active" | "todo";

export function stepState(steps: StepDefinition[], current: string, id: string): StepState {
  const currentIndex = steps.findIndex((step) => step.id === current);
  const index = steps.findIndex((step) => step.id === id);
  if (index < 0 || currentIndex < 0) return "todo";
  if (index < currentIndex) return "done";
  return index === currentIndex ? "active" : "todo";
}

export function canJumpTo(steps: StepDefinition[], current: string, id: string): boolean {
  return stepState(steps, current, id) === "done";
}

export function StepBar({ steps, current, onJump }: {
  steps: StepDefinition[];
  current: string;
  /** 없으면 어느 단계도 누를 수 없다. */
  onJump?: (id: string) => void;
}) {
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-lg bg-card p-2.5 shadow-[var(--shadow-ring)]">
      {steps.map((step, index) => {
        const state = stepState(steps, current, step.id);
        const jumpable = Boolean(onJump) && canJumpTo(steps, current, step.id);
        return (
          <li key={step.id} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!jumpable}
              onClick={() => jumpable && onJump?.(step.id)}
              aria-current={state === "active" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
                state === "active" && "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]",
                jumpable && "hover:bg-muted",
                !jumpable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-bold",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "active" && "bg-primary text-primary-foreground",
                  state === "todo" && "border border-border bg-background text-subtle-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="flex flex-col leading-tight">
                <span className={cn("text-sm font-bold", state === "todo" && "text-muted-foreground")}>
                  {step.label}
                </span>
                {step.desc ? <span className="text-[11px] text-subtle-foreground">{step.desc}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
```

`packages/ui/src/index.ts` 에 다음을 더한다:

```ts
export { StepBar, stepState, canJumpTo, type StepDefinition, type StepState } from "./components/step-bar";
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/ui test` · `pnpm typecheck`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add packages/ui/src/components/step-bar.tsx packages/ui/src/index.ts packages/ui/src/components/__tests__/step-bar.test.ts
git commit -m "feat(ui): 세 도구가 함께 쓸 StepBar 를 만든다"
```

---

## Task 4: create 와 redesign 을 공용 StepBar 로 갈아 끼운다

**Files:**
- Delete: `apps/web/app/create/StepBar.tsx`
- Modify: `apps/web/app/create/PdpMakerClient.tsx` · `apps/web/app/redesign/redesign-wizard.tsx`
- Test: 없음 (기존 테스트가 회귀를 잡는다)

**Interfaces:**
- Consumes: `StepBar` (Task 3)
- Produces: 없음

- [ ] **Step 1: create 를 바꾼다**

`apps/web/app/create/StepBar.tsx` 를 지우고, `PdpMakerClient.tsx` 에서 공용 것을 쓴다:

```tsx
import { StepBar, type StepDefinition } from "@fixup/ui";

const CREATE_STEPS: Record<"image" | "text", StepDefinition[]> = {
  image: [
    { id: "upload",   label: "이미지 업로드", desc: "상품 사진 1장" },
    { id: "analyze",  label: "AI 분석",      desc: "구성 초안 생성" },
    { id: "sections", label: "섹션 생성",     desc: "이미지 만들기" },
    { id: "edit",     label: "편집 · 내보내기", desc: "문구 · 레이어" },
  ],
  text: [
    { id: "upload",   label: "텍스트 입력",   desc: "무엇을 파는지" },
    { id: "analyze",  label: "시나리오 · 대표 이미지", desc: "확인하고 수정" },
    { id: "sections", label: "섹션 생성",     desc: "이미지 만들기" },
    { id: "edit",     label: "편집 · 내보내기", desc: "문구 · 레이어" },
  ],
};
```

`<StepBar mode={...} current={...} />` 를 `<StepBar steps={CREATE_STEPS[startMode]} current={...} />` 로 바꾼다.
**`onJump` 를 넘기지 않는다** — 지금도 클릭을 막고 있었다. 동작이 바뀌지 않는다.

- [ ] **Step 2: redesign 을 바꾼다**

`redesign-wizard.tsx` 의 인라인 단계 표시줄(약 818~850행)을 지우고 공용 것으로 바꾼다:

```tsx
const REDESIGN_STEPS: StepDefinition[] = [
  { id: "dashboard", label: "대시보드",     desc: "지난 작업" },
  { id: "workspace", label: "리디자인 작업", desc: "섹션 고치기" },
  { id: "results",   label: "결과 확인",     desc: "내보내기" },
];

<StepBar steps={REDESIGN_STEPS} current={view} onJump={(id) => setView(id as View)} />
```

**여기만 동작이 바뀐다.** 전에는 아무 단계나 누를 수 있었는데 이제 **지난 단계만** 열린다.
대시보드로 돌아가는 길은 그대로 열려 있다.

- [ ] **Step 3: 확인**

Run: `pnpm typecheck` · `pnpm test` · `pnpm build`
Expected: 전부 통과. Task 1 에서 기록한 테스트 수 이상

- [ ] **Step 4: 눈으로 확인한다**

`/create` 와 `/redesign` 을 열어 **두 스텝 막대가 같은 모양인지** 본다.
원형 배지 · 완료 체크 · 라벨+부제 · 카드 배경.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/create apps/web/app/redesign
git commit -m "refactor(ui): create 와 redesign 이 같은 StepBar 를 쓴다"
```

---

# Phase 3 — 수집 미디어

## Task 5: 수집 테이블을 만든다

**Files:**
- Create: `supabase/migrations/202608310001_ingest.sql`
- Test: `packages/ingest-core/src/__tests__/migration.test.ts`

**Interfaces:**
- Consumes: 기존 `auth.users`
- Produces: `ingest_sources` · `ingest_candidates`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/ingest-core/src/__tests__/migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "../../supabase/migrations/202608310001_ingest.sql"),
  "utf8",
);

describe("수집 마이그레이션", () => {
  it("두 테이블을 만든다", () => {
    expect(sql).toContain("create table public.ingest_sources");
    expect(sql).toContain("create table public.ingest_candidates");
  });

  it("기존 테이블을 건드리지 않는다", () => {
    // 같은 DB 를 개인 배포와 공유한다. alter/drop 이 있으면 그쪽이 죽는다.
    expect(sql).not.toMatch(/alter table public\.(profiles|library|characters|usage)/);
    expect(sql).not.toMatch(/drop table/);
  });

  it("RLS 를 켜고 소유자 기준으로 막는다", () => {
    expect(sql).toContain("alter table public.ingest_sources enable row level security");
    expect(sql).toContain("alter table public.ingest_candidates enable row level security");
    expect(sql).toContain("(select auth.uid()) = user_id");
  });

  it("컬럼 권한을 회수 먼저, 허용 목록 나중에 준다", () => {
    // 테이블 GRANT 뒤의 컬럼 REVOKE 는 아무 일도 하지 않는다.
    for (const table of ["ingest_sources", "ingest_candidates"]) {
      const revokeAt = sql.indexOf(`revoke update on public.${table}`);
      const grantAt = sql.indexOf("grant update (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });

  it("user_id 는 수정 대상 컬럼에 들어가지 않는다", () => {
    for (const grant of sql.match(/grant update \(([^)]+)\)/g) ?? []) {
      expect(grant).not.toContain("user_id");
    }
  });

  it("워커가 쓸 스케줄 칸이 있다", () => {
    for (const column of ["last_checked_at", "next_poll_at", "lease_until", "last_error"]) {
      expect(sql).toContain(column);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/ingest-core test`
Expected: FAIL — 파일 없음

- [ ] **Step 3: 최소 구현**

`supabase/migrations/202608310001_ingest.sql`:

```sql
-- 수집 미디어와 수집함.
-- 같은 DB 를 개인 배포(detail-page-studio)와 공유한다. 새 테이블만 추가하고
-- 기존 테이블은 건드리지 않는다.

create table public.ingest_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('youtube_video','youtube_channel','rss','community','naver_news','official_ai')),
  name text not null,
  url text not null,
  interval_hours int not null default 12 check (interval_hours between 1 and 168),
  enabled boolean not null default true,
  -- 워커가 쓰는 칸. 리스로 중복 실행을 막는다.
  last_checked_at timestamptz,
  next_poll_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingest_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid references public.ingest_sources(id) on delete set null,
  external_id text not null,
  title text not null,
  url text,
  body text,
  summary text,
  thumbnail_url text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','picked','requested','archived')),
  -- 같은 소스에서 같은 글을 두 번 담지 않는다.
  unique (source_id, external_id)
);

create index ingest_sources_poll_idx on public.ingest_sources(next_poll_at) where enabled;
create index ingest_sources_user_idx on public.ingest_sources(user_id, created_at desc);
create index ingest_candidates_user_idx on public.ingest_candidates(user_id, collected_at desc);

alter table public.ingest_sources enable row level security;
alter table public.ingest_candidates enable row level security;

create policy "members manage own ingest sources" on public.ingest_sources for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ingest_sources_insert on public.ingest_sources for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy ingest_sources_update on public.ingest_sources for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ingest_sources_delete on public.ingest_sources for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "members manage own ingest candidates" on public.ingest_candidates for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ingest_candidates_insert on public.ingest_candidates for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy ingest_candidates_update on public.ingest_candidates for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 컬럼 권한은 회수 먼저, 허용 목록 나중에.
grant select, insert, delete on public.ingest_sources to authenticated;
revoke update on public.ingest_sources from authenticated;
grant update (name, url, interval_hours, enabled, updated_at) on public.ingest_sources to authenticated;

grant select, insert on public.ingest_candidates to authenticated;
revoke update on public.ingest_candidates from authenticated;
grant update (status) on public.ingest_candidates to authenticated;
```

**사용자는 `last_error` 나 `next_poll_at` 을 바꿀 수 없다.** 워커가 service_role 로 쓴다.

- [ ] **Step 4: 통과 확인 후 실제 DB 에 적용한다**

Run: `pnpm --filter @fixup/ingest-core test`
그다음:

```bash
supabase db push
```

**적용 전에 개인 배포가 살아 있는지 확인한다.** 새 테이블만 더하므로 영향이 없어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/202608310001_ingest.sql packages/ingest-core
git commit -m "feat(ingest): 수집 소스와 후보 테이블을 만든다"
```

---

## Task 6: 수집 어댑터를 복사해 온다

**Files:**
- Create: `packages/ingest-core/src/adapters/youtube.ts` · `youtube-apify.ts` · `youtube-channel.ts` · `rss.ts` · `community.ts` · `naver-news.ts` · `official-ai.ts` · `web.ts` · `topic.ts`
- Create: `packages/ingest-core/src/types.ts`
- Test: `packages/ingest-core/src/__tests__/adapters.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `IngestAdapter { fetch(source): Promise<RawCandidate[]> }` · `RawCandidate { externalId; title; url?; body?; publishedAt?; thumbnailUrl? }`

- [ ] **Step 1: 원본에서 복사한다**

CardForge 저장소의 아래 파일들을 **읽어서 새 파일로 옮긴다.** `import` 로 연결하지 않는다.

```
instargram automation/src/lib/ingest/youtube.ts          → adapters/youtube.ts
instargram automation/src/lib/ingest/youtube-apify.ts    → adapters/youtube-apify.ts
instargram automation/src/lib/ingest/youtube-channel*.ts → adapters/youtube-channel.ts
instargram automation/src/lib/ingest/rss*.ts             → adapters/rss.ts
instargram automation/src/lib/ingest/community*.ts       → adapters/community.ts
instargram automation/src/lib/ingest/naver-news*.ts      → adapters/naver-news.ts
instargram automation/src/lib/ingest/official-ai*.ts     → adapters/official-ai.ts
instargram automation/src/lib/ingest/web.ts              → adapters/web.ts
instargram automation/src/lib/ingest/topic.ts            → adapters/topic.ts
```

옮기면서 고칠 것:

- CardForge 의 타입(`ContentCandidate` 등)을 참조하는 부분을 `RawCandidate` 로 바꾼다
- 사용 기록 호출을 새 프로젝트의 것으로 바꾼다
- **로직은 바꾸지 않는다.** 실측으로 다듬은 것이다

- [ ] **Step 2: 테스트도 함께 옮긴다**

CardForge 의 `tests/youtube-*.test.ts` · `rss-adapter.test.ts` · `naver-news-adapter.test.ts` ·
`web-ingest.test.ts` · `readable-candidate-text.test.ts` 를 새 위치로 옮긴다.

**테스트를 먼저 옮기고 통과시키는 것이 복사가 제대로 됐다는 증거다.**

- [ ] **Step 3: 유튜브 3단계가 유지됐는지 확인하는 테스트를 더한다**

```ts
describe("유튜브 자막 3단계", () => {
  it("직접 자막이 실패하면 apify 로 넘어간다", async () => {
    const calls: string[] = [];
    const result = await fetchTranscript("https://youtu.be/x", {
      direct: async () => { calls.push("direct"); throw new Error("Transcript is disabled"); },
      apify: async () => { calls.push("apify"); return "자막 내용"; },
      stt: async () => { calls.push("stt"); return "받아쓰기"; },
    });
    expect(calls).toEqual(["direct", "apify"]);
    expect(result).toBe("자막 내용");
  });

  it("셋 다 실패하면 단계별 이유를 전부 남긴다", async () => {
    // 마지막 단계 오류만 남기면 진짜 원인(자막 차단)이 가려진다. 실제로 그랬다.
    await expect(fetchTranscript("https://youtu.be/x", {
      direct: async () => { throw new Error("Transcript is disabled"); },
      apify: async () => { throw new Error("토큰 없음"); },
      stt: async () => { throw new Error("fetch failed"); },
    })).rejects.toThrow(/Transcript is disabled[\s\S]*토큰 없음[\s\S]*fetch failed/);
  });
});
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @fixup/ingest-core test` · `pnpm typecheck`
Expected: 옮긴 테스트 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add packages/ingest-core
git commit -m "feat(ingest): 수집 어댑터를 CardForge 에서 복사해 온다"
```

---

## Task 7: 수집 워커를 만든다

**Files:**
- Create: `apps/worker/package.json` · `apps/worker/src/index.ts` · `apps/worker/src/poll.ts`
- Create: `deploy/ec2/fixup-image-agent-worker.service`
- Test: `apps/worker/src/__tests__/poll.test.ts`

**Interfaces:**
- Consumes: `IngestAdapter` (Task 6) · `ingest_sources` (Task 5)
- Produces: `pollOnce(deps): Promise<PollResult>` · `PollResult { checked: number; collected: number; failed: number }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/worker/src/__tests__/poll.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { pollOnce, nextPollAt } from "../poll";

const source = (patch: Record<string, unknown> = {}) => ({
  id: "s1", userId: "u1", kind: "rss" as const, name: "테스트",
  url: "https://example.com/feed", intervalHours: 6, enabled: true,
  lastCheckedAt: null, nextPollAt: "2026-08-31T00:00:00Z", leaseUntil: null, lastError: null,
  ...patch,
});

describe("다음 확인 시각", () => {
  it("주기만큼 뒤로 민다", () => {
    expect(nextPollAt(new Date("2026-08-31T00:00:00Z"), 6))
      .toEqual(new Date("2026-08-31T06:00:00Z"));
  });
});

describe("한 번 돌기", () => {
  it("수집한 후보를 저장하고 다음 시각을 민다", async () => {
    const saved: unknown[] = [];
    const result = await pollOnce({
      now: new Date("2026-08-31T01:00:00Z"),
      claimDue: async () => [source()],
      fetchFor: async () => [{ externalId: "a1", title: "글", url: "u", body: "본문" }],
      saveCandidates: async (rows) => { saved.push(...rows); return rows.length; },
      markChecked: async () => undefined,
      markFailed: async () => undefined,
    });
    expect(result).toEqual({ checked: 1, collected: 1, failed: 0 });
    expect(saved).toHaveLength(1);
  });

  it("한 소스가 실패해도 나머지는 계속한다", async () => {
    const failures: string[] = [];
    const result = await pollOnce({
      now: new Date("2026-08-31T01:00:00Z"),
      claimDue: async () => [source({ id: "s1" }), source({ id: "s2" })],
      fetchFor: async (entry) => {
        if (entry.id === "s1") throw new Error("차단됨");
        return [{ externalId: "b1", title: "글2" }];
      },
      saveCandidates: async (rows) => rows.length,
      markChecked: async () => undefined,
      markFailed: async (id, message) => { failures.push(`${id}:${message}`); },
    });
    expect(result).toEqual({ checked: 2, collected: 1, failed: 1 });
    expect(failures).toEqual(["s1:차단됨"]);
  });

  it("가져올 것이 없으면 아무 일도 하지 않는다", async () => {
    const result = await pollOnce({
      now: new Date(), claimDue: async () => [],
      fetchFor: async () => { throw new Error("불려서는 안 된다"); },
      saveCandidates: async () => 0, markChecked: async () => undefined, markFailed: async () => undefined,
    });
    expect(result).toEqual({ checked: 0, collected: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/worker test`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`apps/worker/src/poll.ts`:

```ts
import type { RawCandidate } from "@fixup/ingest-core";

export interface PollSource {
  id: string;
  userId: string;
  kind: string;
  name: string;
  url: string;
  intervalHours: number;
}

export interface PollResult { checked: number; collected: number; failed: number }

export function nextPollAt(from: Date, intervalHours: number): Date {
  return new Date(from.getTime() + intervalHours * 60 * 60 * 1000);
}

/**
 * 한 번 돈다.
 *
 * 한 소스가 실패해도 나머지를 계속한다. 유튜브가 막혔다고 RSS 까지 멈추면 안 된다.
 * 실패는 소스 행에 남기고, 화면에는 보여주지 않는다 — 일반 사용자가 고칠 수 없다.
 */
export async function pollOnce(deps: {
  now: Date;
  /** 리스를 걸고 확인할 차례인 소스를 가져온다. 중복 실행을 여기서 막는다. */
  claimDue: (now: Date) => Promise<PollSource[]>;
  fetchFor: (source: PollSource) => Promise<RawCandidate[]>;
  saveCandidates: (rows: Array<RawCandidate & { userId: string; sourceId: string }>) => Promise<number>;
  markChecked: (id: string, next: Date) => Promise<void>;
  markFailed: (id: string, message: string) => Promise<void>;
}): Promise<PollResult> {
  const sources = await deps.claimDue(deps.now);
  let collected = 0;
  let failed = 0;

  for (const source of sources) {
    try {
      const rows = await deps.fetchFor(source);
      collected += await deps.saveCandidates(
        rows.map((row) => ({ ...row, userId: source.userId, sourceId: source.id })),
      );
      await deps.markChecked(source.id, nextPollAt(deps.now, source.intervalHours));
    } catch (error) {
      failed += 1;
      await deps.markFailed(source.id, error instanceof Error ? error.message : String(error));
    }
  }

  return { checked: sources.length, collected, failed };
}
```

`apps/worker/src/index.ts` 는 5분마다 `pollOnce` 를 부른다. Supabase service_role 클라이언트를 쓴다.

`claimDue` 는 리스를 건다:

```sql
update public.ingest_sources
   set lease_until = now() + interval '10 minutes'
 where enabled and next_poll_at <= now()
   and (lease_until is null or lease_until < now())
returning *;
```

`deploy/ec2/fixup-image-agent-worker.service` 를 만들고 `install-host.sh` 에서 함께 설치한다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm test` · `pnpm typecheck`

- [ ] **Step 5: 커밋**

```bash
git add apps/worker deploy/ec2/fixup-image-agent-worker.service deploy/ec2/install-host.sh
git commit -m "feat(worker): 수집 워커를 만든다"
```

---

## Task 8: 수집 미디어 화면

**Files:**
- Create: `apps/web/app/sources/page.tsx` · `apps/web/app/sources/sources-client.tsx`
- Create: `apps/web/app/api/sources/route.ts` · `apps/web/app/api/sources/[id]/route.ts`
- Modify: `packages/ui/src/components/app-shell.tsx` (메뉴)
- Test: `apps/web/app/api/sources/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `ingest_sources` (Task 5)
- Produces: `GET/POST /api/sources` · `PATCH/DELETE /api/sources/[id]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { SourceInputSchema } from "../schema";

describe("소스 입력 규칙", () => {
  it("주기는 1~168시간", () => {
    expect(SourceInputSchema.safeParse({ kind: "rss", name: "n", url: "https://a.com", intervalHours: 0 }).success).toBe(false);
    expect(SourceInputSchema.safeParse({ kind: "rss", name: "n", url: "https://a.com", intervalHours: 6 }).success).toBe(true);
    expect(SourceInputSchema.safeParse({ kind: "rss", name: "n", url: "https://a.com", intervalHours: 200 }).success).toBe(false);
  });

  it("모르는 종류는 거절한다", () => {
    expect(SourceInputSchema.safeParse({ kind: "블로그", name: "n", url: "https://a.com", intervalHours: 6 }).success).toBe(false);
  });

  it("주소가 없으면 거절한다", () => {
    expect(SourceInputSchema.safeParse({ kind: "rss", name: "n", url: "", intervalHours: 6 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/web test`
Expected: FAIL

- [ ] **Step 3: 최소 구현**

`apps/web/app/api/sources/schema.ts`:

```ts
import { z } from "zod";

export const SourceInputSchema = z.object({
  kind: z.enum(["youtube_video", "youtube_channel", "rss", "community", "naver_news", "official_ai"]),
  name: z.string().min(1).max(60),
  url: z.string().url(),
  intervalHours: z.number().int().min(1).max(168),
});
```

라우트는 `user_id` 에 현재 사용자를 넣고, 조회는 RLS 에 맡긴다. 앱에서 또 거르지 않는다.

화면(`sources-client.tsx`)은 shadcn `Card` · `Table` · `Switch` · `Select` 로 만든다.
**마지막 오류를 보여주지 않는다.** 일반 사용자가 고칠 수 없다.

`app-shell.tsx` 의 `navGroups` 에 수집 그룹을 더한다:

```ts
{
  label: "수집",
  items: [
    { href: "/inbox",   label: "수집함",     desc: "모아 온 소재",   icon: Inbox },
    { href: "/sources", label: "수집 미디어", desc: "가져올 곳 관리", icon: Rss },
  ],
},
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test` · `pnpm typecheck` · `pnpm build`

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/sources apps/web/app/api/sources packages/ui/src/components/app-shell.tsx
git commit -m "feat(sources): 수집 미디어 화면을 만든다"
```

---

# Phase 4 — 수집함

## Task 9: 수집함 화면

**Files:**
- Create: `apps/web/app/inbox/page.tsx` · `inbox-client.tsx` · `candidate-detail.tsx`
- Create: `apps/web/app/api/candidates/route.ts` · `apps/web/app/api/candidates/[id]/route.ts`
- Test: `apps/web/app/api/candidates/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `ingest_candidates` (Task 5)
- Produces: `GET /api/candidates` · `PATCH /api/candidates/[id]` (status 만)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { CandidatePatchSchema, candidateToDraft } from "../schema";

describe("후보 수정", () => {
  it("status 만 바꿀 수 있다", () => {
    expect(CandidatePatchSchema.safeParse({ status: "picked" }).success).toBe(true);
    // 본문을 고치면 수집 원본이 아니게 된다.
    expect(CandidatePatchSchema.safeParse({ body: "고친 본문" }).success).toBe(false);
  });

  it("모르는 상태는 거절한다", () => {
    expect(CandidatePatchSchema.safeParse({ status: "삭제됨" }).success).toBe(false);
  });
});

describe("카드뉴스로 넘기기", () => {
  it("제목과 본문만 넘긴다", () => {
    // 참고 이미지·비율·장수·모델은 사람이 고른다. 두 입구의 차이는
    // "내용을 어디서 가져오느냐" 하나뿐이어야 한다.
    const draft = candidateToDraft({
      id: "c1", title: "제목", body: "본문", url: "https://a.com", summary: "요약",
    });
    expect(draft).toEqual({
      title: "제목",
      source: { kind: "collected", title: "제목", text: "본문", url: "https://a.com" },
    });
    expect(Object.keys(draft)).not.toContain("references");
    expect(Object.keys(draft)).not.toContain("ratio");
  });

  it("본문이 없으면 요약을 쓴다", () => {
    const draft = candidateToDraft({ id: "c1", title: "제목", body: null, summary: "요약", url: null });
    expect(draft.source.text).toBe("요약");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/web test`
Expected: FAIL

- [ ] **Step 3: 최소 구현**

`candidateToDraft` 는 **제목과 본문만** 담는다. 화면은 shadcn `Table` + `Dialog`(상세) 로 만든다.

**후보를 `requested` 로 표시하는 것은 프로젝트가 실제로 만들어진 뒤에 한다.**
중간에 그만둔 후보가 요청 상태로 남으면 안 된다. 이 규칙은 계획 2 에서 지킨다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm test` · `pnpm typecheck` · `pnpm build`

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/inbox apps/web/app/api/candidates
git commit -m "feat(inbox): 수집함 화면을 만든다"
```

---

# Phase 5 — 라이브러리 확장

## Task 10: 참고 이미지 테이블

기존 `library_items` 를 쓰지 않는다. 그 테이블은 `tool text check (tool in ('create','redesign'))`
로 막혀 있고 의미도 **완성 작업물**이다. 참고 이미지는 입력 재료라 성격이 다르다.
**합치는 것은 화면이다.**

**Files:**
- Create: `supabase/migrations/202608310003_references.sql`
- Test: `packages/ingest-core/src/__tests__/references-migration.test.ts`

**Interfaces:**
- Consumes: 기존 `public.profiles`
- Produces: `reference_images` · `reference_sets` · `reference_set_items`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "../../supabase/migrations/202608310003_references.sql"),
  "utf8",
);

describe("참고 이미지 마이그레이션", () => {
  it("세 테이블을 만든다", () => {
    for (const table of ["reference_images", "reference_sets", "reference_set_items"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("기존 library_items 를 건드리지 않는다", () => {
    // tool CHECK 를 고치면 개인 배포가 영향을 받는다. 아예 손대지 않는다.
    expect(sql).not.toContain("library_items");
    expect(sql).not.toMatch(/drop constraint/);
  });

  it("소유자 규약을 따른다", () => {
    expect(sql).toContain("references public.profiles(id)");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).not.toContain("auth.users(id)");
  });

  it("Storage 정책을 새로 만들지 않는다", () => {
    // 경로 첫 칸이 user_id 라 기존 정책이 그대로 적용된다.
    expect(sql).not.toContain("storage.objects");
    expect(sql).not.toContain("storage.buckets");
  });

  it("역할은 셋뿐이다", () => {
    expect(sql).toContain("check (role in ('cover','body','ending'))");
  });

  it("용도로 카드뉴스와 포스터를 가른다", () => {
    expect(sql).toContain("check (purpose in ('cardnews','poster','both'))");
  });

  it("컬럼 권한을 회수 먼저, 허용 목록 나중에", () => {
    for (const table of ["reference_images", "reference_sets", "reference_set_items"]) {
      const revokeAt = sql.indexOf(`revoke update on public.${table}`);
      const grantAt = sql.indexOf("grant update (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/ingest-core test`
Expected: FAIL — 파일 없음

- [ ] **Step 3: 최소 구현**

`supabase/migrations/202608310003_references.sql`:

```sql
-- 참고 이미지. 카드뉴스와 포스터가 함께 쓴다.
--
-- 기존 library_items 를 쓰지 않는 이유: 그 테이블은 tool check (create|redesign) 로
-- 막혀 있고 의미도 "완성된 작업물"이다. 참고 이미지는 입력 재료라 성격이 다르다.
-- 제약을 고치면 같은 DB 를 쓰는 개인 배포가 영향을 받는다.
--
-- 파일은 Storage 버킷 library 에 {user_id}/references/{id}.{ext} 로 넣는다.
-- 경로 첫 칸이 소유자라 기존 Storage 정책이 그대로 적용된다. 새 정책이 필요 없다.

create table public.reference_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  title text,
  purpose text not null default 'cardnews' check (purpose in ('cardnews','poster','both')),
  width int,
  height int,
  created_at timestamptz not null default now()
);

create table public.reference_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  purpose text not null default 'cardnews' check (purpose in ('cardnews','poster','both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reference_set_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.reference_sets(id) on delete cascade,
  reference_image_id uuid not null references public.reference_images(id) on delete cascade,
  role text not null check (role in ('cover','body','ending')),
  position int not null default 0
);

create index reference_images_user_idx on public.reference_images(user_id, created_at desc);
create index reference_sets_user_idx on public.reference_sets(user_id, updated_at desc);
create index reference_set_items_set_idx on public.reference_set_items(set_id, position);

alter table public.reference_images enable row level security;
alter table public.reference_sets enable row level security;
alter table public.reference_set_items enable row level security;

create policy "members manage own reference images"
  on public.reference_images for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "members manage own reference sets"
  on public.reference_sets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 항목은 세트를 통해 소유가 정해진다.
create policy "members manage own reference set items"
  on public.reference_set_items for all to authenticated
  using (exists (select 1 from public.reference_sets s
                  where s.id = set_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.reference_sets s
                       where s.id = set_id and s.user_id = (select auth.uid())));

-- 컬럼 권한은 회수 먼저, 허용 목록 나중에.
grant select, insert, delete on public.reference_images to authenticated;
revoke update on public.reference_images from authenticated;
grant update (title, purpose) on public.reference_images to authenticated;

grant select, insert, delete on public.reference_sets to authenticated;
revoke update on public.reference_sets from authenticated;
grant update (name, purpose, updated_at) on public.reference_sets to authenticated;

grant select, insert, delete on public.reference_set_items to authenticated;
revoke update on public.reference_set_items from authenticated;
grant update (role, position) on public.reference_set_items to authenticated;
```

- [ ] **Step 4: 통과 확인 후 적용**

Run: `pnpm --filter @fixup/ingest-core test` → `supabase db push`

**적용 뒤 개인 배포가 여전히 정상인지 확인한다.** 새 테이블만 더했으므로 영향이 없어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/202608310003_references.sql packages/ingest-core
git commit -m "feat(library): 참고 이미지와 묶음 세트 테이블을 만든다"
```

---

## Task 11: 라이브러리에 참고 이미지 탭을 더한다

**Files:**
- Modify: `apps/web/app/library/page.tsx` (탭 구조)
- Create: `apps/web/app/library/references-tab.tsx` · `set-editor.tsx`
- Create: `apps/web/app/api/reference-sets/route.ts` · `[id]/route.ts`
- Test: `apps/web/app/api/reference-sets/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `reference_sets` (Task 10)
- Produces: `GET/POST /api/reference-sets` · `PATCH/DELETE /api/reference-sets/[id]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";
import { SetInputSchema, groupByRole } from "../schema";

describe("세트 입력", () => {
  it("표지는 한 장만", () => {
    const twoCovers = {
      name: "세트", purpose: "cardnews",
      items: [
        { referenceImageId: "a", role: "cover", position: 0 },
        { referenceImageId: "b", role: "cover", position: 1 },
      ],
    };
    expect(SetInputSchema.safeParse(twoCovers).success).toBe(false);
  });

  it("엔딩도 한 장만", () => {
    const twoEndings = {
      name: "세트", purpose: "cardnews",
      items: [
        { referenceImageId: "a", role: "ending", position: 0 },
        { referenceImageId: "b", role: "ending", position: 1 },
      ],
    };
    expect(SetInputSchema.safeParse(twoEndings).success).toBe(false);
  });

  it("속지는 여러 장 된다", () => {
    const many = {
      name: "세트", purpose: "cardnews",
      items: [
        { referenceImageId: "a", role: "cover", position: 0 },
        { libraryItemId: "b", role: "body", position: 1 },
        { libraryItemId: "c", role: "body", position: 2 },
      ],
    };
    expect(SetInputSchema.safeParse(many).success).toBe(true);
  });

  it("역할별로 묶어 돌려준다", () => {
    const grouped = groupByRole([
      { referenceImageId: "a", role: "cover", position: 0 },
      { libraryItemId: "b", role: "body", position: 2 },
      { libraryItemId: "c", role: "body", position: 1 },
    ]);
    expect(grouped.cover?.referenceImageId).toBe("a");
    // 속지는 position 순으로 정렬된다. 그 순서가 배정의 기본값이 된다.
    expect(grouped.body.map((item) => item.referenceImageId)).toEqual(["c", "b"]);
    expect(grouped.ending).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @fixup/web test`

- [ ] **Step 3: 최소 구현**

`/library` 를 shadcn `Tabs` 로 나눈다.

```
라이브러리
  ├ 작업물        기존 화면 그대로
  └ 참고 이미지
       ├ 낱장     reference_images 중 용도가 맞는 것. 올리면 Storage 로 간다
       └ 묶음 세트  [ + 세트 만들기 ]
```

세트 편집기는 라이브러리 항목을 고르고 **역할을 지정**한다.
`SetInputSchema` 가 표지·엔딩 각 1장을 강제한다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm test` · `pnpm typecheck` · `pnpm build`

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/library apps/web/app/api/reference-sets
git commit -m "feat(library): 참고 이미지와 묶음 세트를 라이브러리에 넣는다"
```

---

# 이 계획이 끝나면

```
새 저장소 · 새 EC2 에서 상세페이지와 리디자인이 그대로 돈다
두 도구의 스텝 막대가 같다
소스를 등록하면 워커가 주기적으로 수집한다
수집한 내용을 읽고 제작 후보로 고를 수 있다
참고 이미지를 올리고 묶음 세트로 저장할 수 있다
```

**카드뉴스는 계획 2 에서 만든다.** 이 계획의 결과물만으로도 수집 시스템은 완결된다.

# 사람이 확인할 것

- [ ] 상세페이지 계정으로 새 배포에 로그인이 된다
- [ ] `/create` 와 `/redesign` 의 스텝 막대가 같은 모양이다
- [ ] 유튜브 채널 하나를 등록하고 **EC2 에서 실제로 자막이 수집되는지** 본다 (apify 경로)
- [ ] 개인 배포(`detail-page-studio`)가 여전히 정상인지 본다 — 같은 DB 를 쓴다
