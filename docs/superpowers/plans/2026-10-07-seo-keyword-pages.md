# 검색 키워드로 공개 화면 채우기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사람들이 네이버·구글에서 찾을 만한 말(「AI 카드뉴스 만들기」「상세페이지 제작」 …)이 FormWith 공개 화면의 제목·본문에 실제로 들어가게 한다.

**Architecture:** 키워드마다 공개 소개 화면(`/features/<slug>`) 여섯 개와 모아 보는 화면(`/features`) 하나를 새로 만든다. 문구는 한 파일(`features-content.ts`)에 두고 화면은 그 데이터를 그린다. 첫 화면에는 주 제목(h1)과 「무엇을 만들 수 있나요」 구획을, 소개 화면에는 「FormWith 로 만드는 것」 구획을 더해 새 화면들로 잇는다.

**Tech Stack:** Next.js 15.5 App Router(서버 컴포넌트), 기존 랜딩 스타일(`landing.css`·`hero.css`·`.mcs-*`), vitest + react-test-renderer.

**Spec:** 사용자 요구(2026-10-07): 「사용자들이 검색할만한 키워드 중 우리 서비스와 맞는 키워드로 서비스 설명이나 소개를 채워야 합니다」, 범위 선택 = 첫 화면 · 소개 화면 · 키워드별 소개 화면 새로, 키워드 = 후보 35개를 검색량 확인 없이(「저 상태로 진행」). 사실 근거 = 사용 설명서(`apps/web/app/guide/*`)·코드값. 근거 정리: 스크래치 `seo-facts.md`.

## Global Constraints

- 한국어 화면 문구에 줄표(—, –)를 쓰지 않는다(`app/__tests__/ui-text-dash.test.ts`)
- 한국어 검색 설명(description)은 40자 이상 80자 이하(네이버 간단 체크, `lib/seo/__tests__/metadata.test.ts`)
- 문구는 설명서·코드에 있는 사실만. **가격·월 한도·「무료 체험/무료로 시작」·판매 효과(「더 팔립니다」「전환율」)·사용자 수·후기는 쓰지 않는다.** 말할 수 있는 무료는 「구성 분석·원고 수정·광고 규격 내보내기」뿐
- 가입은 승인제다. 버튼 문구는 「가입 신청」(`/signup`). 「회원가입」「지금 시작」「바로 시작」은 쓰지 않는다
- 네이버 광고 규격을 「공식」이라 쓰지 않는다(일부가 대행사 자료 기준)
- 첫 화면 문구는 `landing-content.ts`, 소개 화면은 `about-content.ts` 에만 둔다(`docs/landing.md`). 새 화면 문구는 `features-content.ts` 에만 둔다
- 상단바 목록(네 곳)·푸터는 바꾸지 않는다(`header-and-about.test.ts` 가 잠금)
- 새 화면은 한국어 한 벌만 만든다. 그 화면의 상단바에서는 언어 전환을 감춘다
- 처음 만들기 경로·회원 화면은 건드리지 않는다

## Review Focus

1. 손님(로그인 안 함)이 `/features/cardnews` 를 열면 회원가입 안내로 튕기지 않고 화면이 보여야 한다 → Task 2 의 미들웨어 시험
2. 없는 주소(`/features/abc`)는 404 여야 한다(빈 화면·500 아님) → Task 2 `notFound` 시험
3. 문구에 금지 표현(무료 체험·회원가입·전환율 …)이 스며들지 않아야 한다 → Task 1 금지어 시험
4. 설명서 링크가 실제 설명서 화면을 가리켜야 한다(꺼진 팀 설명서 등 X) → Task 1 링크 시험
5. 첫 화면 h1 이 정확히 하나여야 한다(두 개면 검색엔진이 헷갈림) → Task 4 시험

---

## 파일 지도

| 파일 | 할 일 |
|---|---|
| `apps/web/app/_landing/features-content.ts` (새) | 키워드 화면 일곱 개의 문구·키워드·설명서 링크 |
| `apps/web/app/features/feature-body.tsx` (새) | 키워드 화면 본문(제목·이럴 때·넣는 것·순서·결과·품질·질문·버튼) |
| `apps/web/app/features/[slug]/page.tsx` (새) | 키워드 화면 여섯 개(정적 생성, 없는 주소는 404) |
| `apps/web/app/features/page.tsx` (새) | 모아 보는 화면 |
| `apps/web/app/features/features.css` (새) | 이 화면들에만 쓰는 모양새 |
| `apps/web/app/_landing/features-section.tsx` (새) | 첫 화면 「무엇을 만들 수 있나요」 구획 |
| `apps/web/middleware.ts` | `PUBLIC_PATHS` 에 `/features` |
| `apps/web/lib/seo/sitemap.ts`, `apps/web/app/sitemap.ts` | 사이트 지도에 일곱 주소 |
| `apps/web/app/_landing/landing-header.tsx` | `showLanguage?: boolean`(기본 true) |
| `apps/web/app/page.tsx`, `apps/web/app/_landing/landing-content.ts` | h1(화면에는 안 보이는 제목) + 새 구획 |
| `apps/web/app/about/page.tsx`, `apps/web/app/_landing/about-content.ts` | 「FormWith 로 만드는 것」 구획 |
| `apps/web/app/admin/analytics/labels.ts` | 방문 분석에서 새 주소를 한글 이름으로 |
| 시험 | 아래 각 Task |

---

### Task 1: 키워드 화면 문구 (`features-content.ts`)

**Files:**
- Create: `apps/web/app/_landing/features-content.ts`
- Test: `apps/web/app/_landing/__tests__/features-content.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface FeatureStep { title: string; body: string }
  export interface FeatureQa { q: string; a: string }
  export interface FeaturePage {
    slug: string;            // "cardnews"
    path: string;            // "/features/cardnews"
    keyword: string;         // 대표 검색어, h1 에 그대로 들어간다
    keywords: string[];      // 같은 화면이 노리는 다른 검색어(메타 keywords)
    metaTitle: string;       // <title> 앞부분. 뒤에 「 — FormWith」가 붙는다
    metaDescription: string; // 40~80자
    kicker: string;
    h1: string;
    lead: string;
    card: string;            // 첫 화면·소개·모아 보기 카드에 쓰는 한 줄
    goodFor: string[];
    inputs: string[];
    steps: FeatureStep[];
    outputs: string[];
    quality: string[];
    faq: FeatureQa[];
    guideHref: string;       // 설명서 주소
    guideLabel: string;
  }
  export const FEATURE_PAGES: readonly FeaturePage[];          // 여섯 개, 아래 순서
  export const FEATURES_HUB: { path: "/features"; keyword: string; keywords: string[]; metaTitle: string; metaDescription: string; kicker: string; h1: string; lead: string; easyNote: string };
  export const FEATURE_CTA: { signup: string; guide: string; more: string; back: string };
  export function featureBySlug(slug: string): FeaturePage | undefined;
  ```

- [ ] **Step 1: 실패하는 시험을 쓴다** — `features-content.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { GUIDE_TOPICS } from "../../guide/_components/topics";
import { FEATURE_CTA, FEATURE_PAGES, FEATURE_SECTIONS, FEATURES_HUB, featureBySlug } from "../features-content";

const FORBIDDEN = /무료 체험|무료로 시작|무료 가입|회원가입|지금 시작|바로 시작|더 팔|전환율|매출 상승|[—–]/;
const allText = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(allText) : v && typeof v === "object" ? Object.values(v).flatMap(allText) : [];

describe("키워드 화면 문구", () => {
  it("여섯 화면, 주소가 겹치지 않는다", () => {
    expect(FEATURE_PAGES.map((p) => p.slug)).toEqual(["cardnews", "detail-page", "redesign", "ad-creative", "poster", "character"]);
    expect(new Set(FEATURE_PAGES.map((p) => p.path)).size).toBe(6);
    for (const p of FEATURE_PAGES) expect(p.path).toBe(`/features/${p.slug}`);
  });
  it.each(FEATURE_PAGES.map((p) => [p.slug, p]))("%s: 대표 검색어가 h1·제목에 들어 있다", (_s, p) => {
    expect(p.h1).toContain(p.keyword);
    expect(p.metaTitle).toContain(p.keyword);
  });
  it.each([...FEATURE_PAGES, FEATURES_HUB].map((p) => [p.path, p]))("%s: 설명은 40~80자", (_s, p) => {
    expect(p.metaDescription.length).toBeGreaterThanOrEqual(40);
    expect(p.metaDescription.length).toBeLessThanOrEqual(80);
  });
  it.each(FEATURE_PAGES.map((p) => [p.slug, p]))("%s: 내용이 비지 않았다", (_s, p) => {
    expect(p.goodFor.length).toBeGreaterThanOrEqual(3);
    expect(p.inputs.length).toBeGreaterThanOrEqual(2);
    expect(p.steps.length).toBeGreaterThanOrEqual(3);
    expect(p.outputs.length).toBeGreaterThanOrEqual(2);
    expect(p.faq.length).toBeGreaterThanOrEqual(3);
  });
  it.each([...FEATURE_PAGES, FEATURES_HUB, FEATURE_SECTIONS, FEATURE_CTA].map((p, i) => [String(i), p]))("%s: 금지 표현이 없다", (_s, p) => {
    for (const text of allText(p)) expect(text).not.toMatch(FORBIDDEN);
  });
  it("설명서 링크는 실제 설명서 목차에 있다", () => {
    const hrefs = new Set(GUIDE_TOPICS.map((t) => t.href));
    for (const p of FEATURE_PAGES) expect(hrefs.has(p.guideHref)).toBe(true);
  });
  it("모르는 주소는 undefined", () => {
    expect(featureBySlug("cardnews")?.keyword).toBe("AI 카드뉴스 만들기");
    expect(featureBySlug("abc")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 돌려서 실패를 본다** — `cd apps/web && npx vitest run app/_landing/__tests__/features-content.test.ts` → 「Cannot find module '../features-content'」
- [ ] **Step 3: 문구 파일을 쓴다** — 아래 값을 그대로. 문구 근거는 설명서(`G/cardnews/page.tsx` 등).

```ts
/**
 * **키워드별 공개 소개 화면의 문구**(계획 2026-10-07 seo-keyword-pages).
 *
 * 사람들이 검색할 말(대표 검색어)을 화면 제목과 본문에 그대로 쓴다. 사실은 사용 설명서와
 * 코드값에서만 가져온다 — 가격·무료 체험·판매 효과는 쓰지 않는다(시험이 본다).
 * 대표 검색어는 2026-10-07 후보 35개에서 골랐다. 검색량을 확인하면 여기만 바꾼다.
 */
export interface FeatureStep { title: string; body: string }
export interface FeatureQa { q: string; a: string }
export interface FeaturePage {
  slug: string;
  path: string;
  keyword: string;
  keywords: string[];
  metaTitle: string;
  metaDescription: string;
  kicker: string;
  h1: string;
  lead: string;
  card: string;
  goodFor: string[];
  inputs: string[];
  steps: FeatureStep[];
  outputs: string[];
  quality: string[];
  faq: FeatureQa[];
  guideHref: string;
  guideLabel: string;
}

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: "cardnews",
    path: "/features/cardnews",
    keyword: "AI 카드뉴스 만들기",
    keywords: ["카드뉴스 만들기", "카드뉴스 제작", "인스타 카드뉴스", "카드뉴스 템플릿"],
    metaTitle: "AI 카드뉴스 만들기 · 인스타 카드뉴스 제작",
    metaDescription: "글 한 편이나 유튜브 주소로 인스타 카드뉴스를 만듭니다. 원고를 먼저 고치고, 표지부터 마지막 장까지 AI가 그려 검수합니다.",
    kicker: "카드뉴스",
    h1: "AI 카드뉴스 만들기",
    lead: "글 한 편, 유튜브 주소, 궁금한 질문 하나로 시작합니다. 표지부터 마지막 장까지 장수를 나누고 원고를 쓰면, 사람이 글자를 고친 뒤에 그림을 만듭니다. 인스타그램 피드와 스토리에 올릴 카드뉴스 제작을 한 화면에서 끝냅니다.",
    card: "글이나 유튜브 주소로 인스타 카드뉴스를 여러 장 만듭니다.",
    goodFor: [
      "인스타그램에 옆으로 넘겨 보는 카드뉴스를 올릴 때",
      "긴 글이나 영상 하나를 여러 장으로 나눠 보여 주고 싶을 때",
      "장마다 글자 위치와 로고가 흔들리면 안 될 때",
      "빠르게 여러 안을 보고 고르고 싶을 때",
    ],
    inputs: [
      "직접 쓰거나 붙여 넣은 글",
      "유튜브 주소. 자막이나 영상 속 말소리를 받아 적습니다",
      "궁금한 질문 한 줄. 웹에서 근거를 찾아옵니다",
      "따라 만들 그림, 로고, 인물 사진(선택)",
    ],
    steps: [
      { title: "내용 넣기", body: "글을 쓰거나, 유튜브 주소를 넣거나, 질문으로 찾습니다." },
      { title: "그림 고르기", body: "붙인 그림마다 따라 만들기, 제품 그대로 지키기, 인물 그대로 지키기 같은 역할을 정합니다." },
      { title: "규격 정하기", body: "비율과 장수, 그림체를 고릅니다. 장수는 AI 추천에 맡겨도 됩니다." },
      { title: "원고 확인", body: "장마다 들어갈 글자를 사람이 고칩니다. 여기까지는 이미지 크레딧이 들지 않습니다." },
      { title: "결과와 검수", body: "그림을 만든 뒤 다른 AI가 원고와 대조해 검수합니다." },
    ],
    outputs: [
      "인스타그램 피드 4:5, 정사각형 1:1, 스토리·릴스 9:16, 가로 16:9",
      "표지 한 장, 속지 여러 장, 마지막 장. 한 번에 최대 8장",
    ],
    quality: [
      "원고를 확정한 뒤에 그림을 부릅니다. 저장한 글자만 그림에 들어갑니다.",
      "만든 그림은 다른 AI가 원고와 대조합니다. 원고에 없는 글자, 바뀐 글자를 찾아 알려 줍니다.",
      "「내 카드뉴스 만들기」는 글 칸과 로고 칸을 AI에 맡기지 않고 그대로 얹습니다.",
    ],
    faq: [
      { q: "카드뉴스 템플릿처럼 틀을 정해 쓸 수 있나요?", a: "네. 「내 카드뉴스 만들기」는 배경, 그림, 로고, 글 칸의 자리를 정해 두고 장마다 같은 자리에 넣습니다." },
      { q: "몇 장까지 만들 수 있나요?", a: "AI 추천에 맡기거나 직접 고를 수 있고, 한 번에 최대 8장입니다. 완성 카드 한 장에 1크레딧입니다." },
      { q: "그림이 나온 뒤에 글자를 고칠 수 있나요?", a: "그림 속 글자를 바꾸는 것은 그 장을 다시 만드는 일입니다. 그래서 그림을 만들기 전 원고 확인 단계에서 글자를 먼저 고치게 되어 있습니다." },
    ],
    guideHref: "/guide/cardnews",
    guideLabel: "카드뉴스 만들기 설명서",
  },
  {
    slug: "detail-page",
    path: "/features/detail-page",
    keyword: "AI 상세페이지 제작",
    keywords: ["상세페이지 제작", "상세페이지 만들기", "AI 상세페이지", "스마트스토어 상세페이지", "쇼핑몰 상세페이지", "상세페이지 기획"],
    metaTitle: "AI 상세페이지 제작 · 스마트스토어 상세페이지 만들기",
    metaDescription: "상품 사진 한 장이나 글만으로 스마트스토어·쇼핑몰 상세페이지를 만듭니다. AI가 구성안을 기획하고 섹션 이미지를 그립니다.",
    kicker: "상세페이지",
    h1: "AI 상세페이지 제작",
    lead: "상품 사진 한 장, 또는 무엇을 파는지 적은 글만 있으면 됩니다. AI가 상세페이지 구성안을 먼저 기획하고, 사람이 문구를 고친 뒤, 그 문구까지 그려 넣은 섹션 이미지를 만듭니다. 스마트스토어와 쇼핑몰에 올릴 긴 세로 상세페이지를 한 번에 받습니다.",
    card: "상품 사진 한 장이나 글로 쇼핑몰 상세페이지를 기획하고 만듭니다.",
    goodFor: [
      "스마트스토어나 쇼핑몰에 올릴 상세페이지가 필요할 때",
      "상품 사진은 있는데 페이지 구성을 못 잡겠을 때",
      "문구까지 들어간 섹션 이미지를 한 번에 받고 싶을 때",
      "같은 모델이 여러 섹션에 나와야 할 때",
    ],
    inputs: [
      "상품 사진 한 장. 형태, 색, 재질, 라벨 글자를 읽습니다",
      "또는 상품을 설명하는 글",
      "인물 사진이나 저장해 둔 캐릭터(선택)",
      "따라 하고 싶은 상세페이지 한 장(선택). 레이아웃, 분위기, 폰트, 색만 따릅니다",
    ],
    steps: [
      { title: "사진 올리기 또는 글 쓰기", body: "사진이 없으면 글로 시작합니다. 이때는 시나리오와 대표 이미지를 먼저 보여 드립니다." },
      { title: "구성 확인", body: "AI가 짠 구성안을 사람이 고칩니다. 구성안을 짜는 데는 크레딧이 들지 않습니다." },
      { title: "섹션 만들기", body: "고친 문구를 그려 넣은 섹션 이미지를 만듭니다." },
      { title: "편집과 내보내기", body: "문구를 다듬고 긴 한 장 또는 섹션별 파일로 내려받습니다." },
    ],
    outputs: [
      "문구가 이미지 안에 그려진 섹션 이미지",
      "섹션을 위아래로 붙인 긴 한 장, 또는 섹션별 파일 묶음",
      "라이브러리에 한 작업으로 자동 저장",
    ],
    quality: [
      "제품에서 확인되는 것만 근거로 씁니다. 확인되지 않은 효능, 성분, 인증 문구는 심사에서 걸러집니다.",
      "구성안을 만든 AI와 다른 AI가 판매 원칙으로 심사합니다. 끝까지 남은 지적은 숨기지 않고 보여 줍니다.",
    ],
    faq: [
      { q: "사진 없이 글만으로도 상세페이지를 만들 수 있나요?", a: "네. 무엇을 파는지 적으면 시나리오와 대표 이미지를 먼저 만들어 보여 드리고, 확인한 뒤 섹션을 만듭니다." },
      { q: "상세페이지 기획도 해 주나요?", a: "네. 섹션마다 무엇을 말할지 구성안을 먼저 짭니다. 대상, 문제, 차별점, 반론, 흐름, 근거, 마무리를 심사해 모자라면 다시 짭니다." },
      { q: "구매 버튼도 들어가나요?", a: "아니요. 이미지에 그린 버튼은 눌리지 않아서 넣지 않습니다. 구매 버튼은 쇼핑몰에서 붙여 주세요." },
    ],
    guideHref: "/guide/detail-page",
    guideLabel: "상세페이지 만들기 설명서",
  },
  {
    slug: "redesign",
    path: "/features/redesign",
    keyword: "상세페이지 리디자인",
    keywords: ["상세페이지 디자인", "상세페이지 리뉴얼", "상세페이지 수정"],
    metaTitle: "상세페이지 리디자인 · 상세페이지 디자인 다시 하기",
    metaDescription: "기존 상세페이지 이미지나 PDF를 올리면 글자와 인증·수치를 옮겨 적고, 구성을 다시 짜 새 섹션 이미지로 만듭니다.",
    kicker: "리디자인",
    h1: "상세페이지 리디자인",
    lead: "지금 쓰는 상세페이지를 이미지나 PDF로 올리세요. AI가 적힌 글자를 전부 옮겨 적고, 성분, 인증 번호, 시험 수치 같은 사실을 골라낸 뒤, 그것을 근거로 구성과 디자인을 다시 짭니다. 쓸 만한 사진과 문구는 버리지 않고 가져갑니다.",
    card: "기존 상세페이지를 뜯어보고 구성과 디자인을 다시 짭니다.",
    goodFor: [
      "상세페이지는 있는데 성과가 안 나올 때",
      "무엇을 고쳐야 할지부터 모를 때",
      "기존 사진과 문구를 살리면서 디자인을 바꾸고 싶을 때",
      "성분이나 인증이 중요한 상품일 때",
    ],
    inputs: [
      "기존 상세페이지 이미지 또는 PDF. 여러 장으로 나뉘어 있어도 됩니다",
      "추가 요청사항(선택). 다른 지시보다 우선합니다",
    ],
    steps: [
      { title: "올리기", body: "기존 상세페이지 이미지나 PDF를 올립니다." },
      { title: "글자 옮겨 적기", body: "적힌 글자를 전부 옮겨 적고 인증 번호, 수치 같은 사실을 골라냅니다." },
      { title: "구성 다시 짜기", body: "섹션마다 무엇을 말할지 정하고, 근거는 근거를 말하는 섹션에 싣습니다." },
      { title: "첫 장 확인", body: "첫 장을 먼저 보고 방향을 정합니다." },
      { title: "나머지와 수정", body: "나머지 섹션을 만들고 마음에 안 드는 장만 한 장씩 고칩니다." },
    ],
    outputs: [
      "새 섹션 이미지. 첫 장만, 또는 6~8장",
      "원본에서 뽑은 성분, 함량, 인증 번호, 시험 수치 목록",
      "섹션마다 목적과 참고한 원본 부분",
    ],
    quality: [
      "글자를 먼저 따로 옮겨 적어서 인증 번호와 시험 수치처럼 틀리면 안 되는 것을 정확히 남깁니다.",
      "첫 장을 먼저 보고 방향을 정한 뒤 나머지를 만들어, 방향이 틀렸을 때 크레딧을 덜 씁니다.",
    ],
    faq: [
      { q: "원본 순서를 그대로 지킬 수 있나요?", a: "새 구성은 원본과 크게 다를 수 있습니다. 순서를 지키고 싶으면 추가 요청사항에 적어 주세요. 그 말이 다른 지시보다 우선합니다." },
      { q: "이미지 속 숫자가 틀릴 수도 있나요?", a: "그럴 수 있습니다. 그래서 원본에서 뽑은 사실 목록을 결과 화면에 글로 남깁니다. 숫자와 인증 번호는 그 목록과 맞춰 보세요." },
      { q: "글자 옮기기와 분석에도 크레딧이 드나요?", a: "아니요. 이미지 한 장이 나올 때마다 1크레딧이고, 글자 옮기기와 분석은 따로 들지 않습니다." },
    ],
    guideHref: "/guide/redesign",
    guideLabel: "상세페이지 리디자인 설명서",
  },
  {
    slug: "ad-creative",
    path: "/features/ad-creative",
    keyword: "광고 소재 제작",
    keywords: ["광고 배너 만들기", "배너 만들기", "광고 이미지 만들기", "배너 디자인"],
    metaTitle: "광고 소재 제작 · 광고 배너 만들기",
    metaDescription: "AI로 광고 소재와 배너를 만들고 네이버·구글·카카오 광고 규격으로 한 번에 내보냅니다. 픽셀과 용량까지 검사합니다.",
    kicker: "광고 소재",
    h1: "광고 소재 제작과 배너 만들기",
    lead: "따라 만들 그림 한 장과 한 줄이면 광고 소재 초안이 나옵니다. 마음에 드는 한 장을 고르면 네이버, 구글, 카카오가 요구하는 배너 규격 여러 개로 한 번에 뽑아 ZIP으로 받습니다. 규격마다 픽셀과 용량을 찾아 자르는 일을 줄입니다.",
    card: "광고 소재를 만들고 네이버·구글·카카오 배너 규격으로 내보냅니다.",
    goodFor: [
      "인스타그램이나 포털 광고에 쓸 이미지가 필요할 때",
      "같은 그림을 여러 광고 규격으로 맞춰야 할 때",
      "포털이 요구하는 픽셀을 일일이 찾아 자르기 번거로울 때",
      "같은 분위기로 여러 안을 뽑아 고르고 싶을 때",
    ],
    inputs: [
      "무엇을 만들지 한두 줄. 글만으로도 시작합니다",
      "따라 만들 그림, 제품 사진, 인물 사진(선택)",
      "이미 만들어 둔 그림(광고 규격으로 내보낼 때)",
    ],
    steps: [
      { title: "만들 것 적기", body: "어떤 광고 소재인지 한두 줄 적습니다." },
      { title: "따라 만들 그림 고르기", body: "붙인 그림에서 무엇을 가져올지 역할로 정합니다." },
      { title: "비율과 장수", body: "인스타그램 4:5, 가로 배너 16:9 같은 비율과 변형 장수를 고릅니다. 변형은 최대 3장입니다." },
      { title: "기획 확인", body: "AI가 채운 칸 가운데 틀린 칸만 고친 뒤에 그림을 만듭니다." },
      { title: "포털 규격으로 내보내기", body: "고른 그림을 네이버, 구글, 카카오 규격으로 한 번에 뽑아 ZIP으로 받습니다." },
    ],
    outputs: [
      "인스타그램 피드 4:5, 정사각형 1:1, 스토리 9:16, 가로 배너 16:9",
      "네이버 GFA와 브랜드검색, 구글 반응형 디스플레이, 카카오 디스플레이와 비즈보드 규격",
      "배경을 지운 투명 배너(PNG)",
    ],
    quality: [
      "픽셀, 형식, 투명 여부, 용량을 실제 파일에서 검사하고 통과한 것만 담습니다.",
      "필수 규격을 빼면 화면이 먼저 알려 줘서 포털 반려를 미리 막습니다.",
      "원본을 1.2배보다 크게 늘리지 않습니다. 흐려질 규격은 못 뽑는다고 알려 줍니다.",
    ],
    faq: [
      { q: "어떤 포털 규격을 지원하나요?", a: "네이버(GFA 네이티브와 이미지 배너, 스마트채널, 브랜드검색 썸네일 등), 구글 반응형 디스플레이, 카카오 디스플레이와 비즈보드 규격입니다. 포털이 규격을 바꾸면 목록도 바뀝니다." },
      { q: "규격 내보내기에도 크레딧이 드나요?", a: "아니요. 이미 만든 그림에서 규격을 뽑는 일과 투명 배너는 크레딧이 들지 않습니다." },
      { q: "배너에 광고 문구도 들어가나요?", a: "그림을 만들 때 적은 문구는 그림 안에 들어갑니다. 투명 배너는 글자 없이 만들고, 문구는 광고 관리자에서 직접 넣습니다." },
    ],
    guideHref: "/guide/ad",
    guideLabel: "광고 규격 내보내기 설명서",
  },
  {
    slug: "poster",
    path: "/features/poster",
    keyword: "AI 포스터 만들기",
    keywords: ["포스터 만들기", "AI 이미지 생성", "홍보 이미지 만들기", "썸네일 만들기", "마케팅 이미지 제작"],
    metaTitle: "AI 포스터 만들기 · 홍보 이미지 생성",
    metaDescription: "AI로 포스터, 홍보 이미지, 썸네일을 만듭니다. 글만 적거나 따라 만들 그림을 붙이면 같은 분위기로 그리고 A4 인쇄용도 받습니다.",
    kicker: "포스터와 이미지",
    h1: "AI 포스터 만들기",
    lead: "행사 포스터, 홍보 이미지, 썸네일처럼 한 장짜리 그림을 만듭니다. 무엇을 만들지 한두 줄 적거나, 따라 만들 그림을 붙이면 그 결을 따라갑니다. AI가 기획을 먼저 보여 주고, 사람이 틀린 칸만 고친 뒤에 그림을 그립니다.",
    card: "포스터, 홍보 이미지, 썸네일을 한 장씩 같은 분위기로 만듭니다.",
    goodFor: [
      "행사 포스터를 인쇄해야 할 때",
      "참고할 그림은 있는데 말로 옮기기 어려울 때",
      "같은 분위기로 여러 장을 뽑아 고르고 싶을 때",
      "제품이 실물 그대로 나와야 할 때",
    ],
    inputs: [
      "무엇을 만들지 한두 줄",
      "따라 만들 그림(선택)",
      "꼭 지킬 말(선택). 그림보다 우선합니다",
      "이미 완성한 프롬프트(선택). 그대로 만들 수 있습니다",
    ],
    steps: [
      { title: "만들 것 적기", body: "무엇을 만들지 한두 줄 적습니다. 그림만 붙여도 됩니다." },
      { title: "따라 만들 그림", body: "붙인 그림마다 따라 만들기, 제품 그대로 지키기, 인물 그대로 지키기 가운데 역할을 정합니다." },
      { title: "규격", body: "비율, 그림 만드는 방식, 장수를 고릅니다." },
      { title: "기획 확인", body: "AI가 채운 열 개 남짓한 칸 가운데 틀린 칸만 고칩니다." },
      { title: "결과", body: "나온 그림을 고르고, 틀린 칸만 고쳐 다시 만듭니다." },
    ],
    outputs: [
      "포스터 세로 2:3과 3:4, A4 비율 시안, A4 인쇄용(약 290dpi)",
      "인스타그램 피드 4:5, 정사각형 1:1, 스토리 9:16, 가로 배너 16:9",
      "그림체 다섯 가지. 레퍼런스 스타일, 실사 사진, 애니메이션, 3D, 손그림",
    ],
    quality: [
      "레퍼런스에서 무엇을 가져올지 역할로 정해서, 그림이 엉뚱하게 섞이지 않게 합니다.",
      "헤드라인만 틀렸으면 그 칸만 고쳐 다시 만듭니다.",
    ],
    faq: [
      { q: "그림 없이 글만으로도 만들 수 있나요?", a: "네. 무엇을 만들지 한두 줄만 있어도 시작합니다." },
      { q: "인쇄용 포스터도 되나요?", a: "A4 인쇄용(약 290dpi)을 고르면 됩니다. A4 비율 시안은 화면 확인용이라 인쇄에는 해상도가 모자랍니다." },
      { q: "한 번에 몇 장 나오나요?", a: "변형을 1장에서 3장까지 고를 수 있습니다. 한 장에 1크레딧, A4 인쇄용처럼 큰 그림은 2크레딧입니다." },
    ],
    guideHref: "/guide/image",
    guideLabel: "이미지 만들기 설명서",
  },
  {
    slug: "character",
    path: "/features/character",
    keyword: "AI 캐릭터 만들기",
    keywords: ["캐릭터 만들기", "브랜드 캐릭터 제작", "캐릭터 디자인", "마스코트 만들기"],
    metaTitle: "AI 캐릭터 만들기 · 브랜드 캐릭터 제작",
    metaDescription: "사람, 동물, 캐릭터, 사물을 AI로 만들어 여섯 각도로 저장하고 카드뉴스와 상세페이지에서 같은 모습으로 다시 씁니다.",
    kicker: "캐릭터",
    h1: "AI 캐릭터 만들기",
    lead: "AI 이미지의 가장 큰 불편은 같은 인물이 두 번 나오지 않는다는 것입니다. 사람, 동물, 캐릭터, 사물을 한 번 만들어 정면부터 뒷면까지 여섯 각도로 저장하고, 카드뉴스와 상세페이지, 이미지 만들기에서 같은 모습으로 불러 씁니다.",
    card: "브랜드 캐릭터와 마스코트를 여섯 각도로 저장해 다시 씁니다.",
    goodFor: [
      "브랜드 캐릭터나 마스코트를 반복해서 써야 할 때",
      "같은 인물이 여러 장에 나와야 할 때",
      "제품 하나를 여러 장면에 넣어야 할 때",
      "내 캐릭터를 다른 그림 느낌으로 바꾸고 싶을 때",
    ],
    inputs: [
      "종류(사람, 동물, 캐릭터, 사물)와 그림체",
      "생김새를 적은 설명. 나이, 차림새, 인상까지 적을수록 좋습니다",
      "가진 캐릭터 그림이나 참고할 그림(선택)",
    ],
    steps: [
      { title: "무엇을 만들지 정하기", body: "종류와 그림체를 고르고 생김새를 적습니다." },
      { title: "정면 보기", body: "정면 한 장이 먼저 나옵니다. 마음에 안 들면 다시 뽑습니다." },
      { title: "각도 더 만들기", body: "정면, 왼쪽 45°, 오른쪽 45°, 왼쪽, 오른쪽, 뒷면 가운데 필요한 각도를 만듭니다." },
      { title: "라이브러리에 저장", body: "다른 도구에서 같은 모습으로 불러 씁니다." },
    ],
    outputs: [
      "여섯 각도 낱장",
      "여섯 면을 한 장에 담은 다각도 이미지",
      "라이브러리 저장. 카드뉴스, 이미지 만들기, 상세페이지에서 불러 쓰기",
    ],
    quality: [
      "정면을 기준으로 나머지 각도를 만들어 같은 대상을 유지합니다.",
      "적은 묘사를 AI가 정리해 두고, 나중에 각도를 더 만들 때도 같은 설명을 씁니다.",
    ],
    faq: [
      { q: "마스코트나 동물 캐릭터도 되나요?", a: "네. 사람 말고도 동물, 등신 비율이 자유로운 캐릭터, 제품 같은 사물도 만듭니다." },
      { q: "그림체를 고를 수 있나요?", a: "레퍼런스 스타일, 실사 사진, 애니메이션, 3D, 손그림 가운데 고릅니다." },
      { q: "만든 캐릭터는 어디에 쓰나요?", a: "라이브러리에 저장돼 카드뉴스, 이미지 만들기, 상세페이지에서 불러 씁니다. 다른 도구에는 낱장 각도가 들어갑니다." },
    ],
    guideHref: "/guide/character",
    guideLabel: "캐릭터 만들기 설명서",
  },
];

export const FEATURES_HUB = {
  path: "/features" as const,
  keyword: "AI 마케팅 콘텐츠 제작",
  keywords: ["마케팅 콘텐츠 제작", "SNS 콘텐츠 제작", "인스타 게시물 만들기", "AI 디자인 툴", "마케팅 이미지 제작"],
  metaTitle: "AI 마케팅 콘텐츠 제작 · SNS 콘텐츠 만들기",
  metaDescription: "카드뉴스, 상세페이지, 광고 소재, 포스터, 캐릭터까지. SNS와 쇼핑몰에 올릴 마케팅 이미지를 AI로 만드는 FormWith 기능 소개.",
  kicker: "기능",
  h1: "AI 마케팅 콘텐츠 제작",
  lead: "인스타그램 게시물, 쇼핑몰 상세페이지, 포털 광고 배너처럼 마케팅에 필요한 이미지를 한 곳에서 만듭니다. 만든 것은 라이브러리에 쌓여 다음 작업의 재료가 됩니다.",
  easyNote: "무엇부터 할지 모르겠다면 「쉽게」에서 말로 주문하세요. 대화하며 이미지와 카드뉴스를 만들어 줍니다.",
};

export const FEATURE_SECTIONS = {
  goodFor: "이럴 때 좋습니다",
  inputs: "넣는 것",
  steps: "만드는 순서",
  outputs: "받는 것",
  quality: "품질을 지키는 방법",
  faq: "자주 묻는 질문",
};

export const FEATURE_CTA = {
  signup: "가입 신청",
  guide: "설명서 보기",
  more: "자세히 보기",
  back: "모든 기능 보기",
};

export function featureBySlug(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((page) => page.slug === slug);
}
```

- [ ] **Step 4: 시험이 통과하는지 본다** — 같은 명령 → PASS. 설명 글자 수가 80 을 넘으면 문구를 줄인다(시험을 고치지 않는다)
- [ ] **Step 5: 커밋** — `feat(seo): 키워드별 소개 화면 문구`

### Task 2: 키워드 화면과 모아 보는 화면

**Files:**
- Create: `apps/web/app/features/feature-body.tsx`, `apps/web/app/features/[slug]/page.tsx`, `apps/web/app/features/page.tsx`, `apps/web/app/features/features.css`
- Modify: `apps/web/middleware.ts`(`PUBLIC_PATHS`), `apps/web/app/_landing/landing-header.tsx`(`showLanguage`)
- Test: `apps/web/app/features/__tests__/feature-body.test.tsx`, `apps/web/app/features/__tests__/features-route.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `FEATURE_PAGES`·`FEATURES_HUB`·`FEATURE_CTA`·`featureBySlug`
- Produces: `FeatureBody({ page }: { page: FeaturePage })`, `FeatureCards({ pages }: { pages: readonly FeaturePage[] })`(모아 보기·첫 화면이 같이 씀), `LandingHeader` 의 `showLanguage?: boolean`

- [ ] **Step 1: 실패하는 시험** — `feature-body.test.tsx`(react-test-renderer)

```tsx
import { describe, expect, it } from "vitest";
import TestRenderer from "react-test-renderer";
import { FEATURE_PAGES } from "../../_landing/features-content";
import { FeatureBody, FeatureCards } from "../feature-body";

const texts = (node: TestRenderer.ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : texts(c))).join("");

describe("FeatureBody", () => {
  const page = FEATURE_PAGES[0];
  const root = TestRenderer.create(<FeatureBody page={page} />).root;
  it("h1 은 하나, 대표 검색어", () => {
    const h1 = root.findAllByType("h1");
    expect(h1).toHaveLength(1);
    expect(texts(h1[0])).toContain(page.keyword);
  });
  it("질문과 답이 모두 보인다", () => {
    const all = texts(root.findByType("main"));
    for (const qa of page.faq) { expect(all).toContain(qa.q); expect(all).toContain(qa.a); }
  });
  it("가입 신청과 설명서로 간다", () => {
    const hrefs = root.findAllByType("a").map((a) => a.props.href);
    expect(hrefs).toContain("/signup");
    expect(hrefs).toContain(page.guideHref);
    expect(hrefs).toContain("/features");
  });
});

describe("FeatureCards", () => {
  it("여섯 화면으로 가는 링크", () => {
    const root = TestRenderer.create(<FeatureCards pages={FEATURE_PAGES} />).root;
    const hrefs = root.findAllByType("a").map((a) => a.props.href);
    for (const p of FEATURE_PAGES) expect(hrefs).toContain(p.path);
  });
});
```

`features-route.test.ts`(소스 읽기 시험, `header-and-about.test.ts` 와 같은 방식):

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateStaticParams } from "../[slug]/page";

const WEB = join(__dirname, "..", "..", "..");
describe("키워드 화면 경로", () => {
  it("손님에게 열린다 — 미들웨어 공개 목록에 /features", () => {
    const mw = readFileSync(join(WEB, "middleware.ts"), "utf8");
    expect(mw).toMatch(/PUBLIC_PATHS = \[[\s\S]*"\/features"/);
  });
  it("여섯 주소를 미리 만든다", async () => {
    expect((await generateStaticParams()).map((p) => p.slug)).toEqual(["cardnews", "detail-page", "redesign", "ad-creative", "poster", "character"]);
  });
  it("모르는 주소는 notFound()", () => {
    const src = readFileSync(join(WEB, "app/features/[slug]/page.tsx"), "utf8");
    expect(src).toContain("notFound()");
    expect(src).toContain("dynamicParams = false");
  });
  it("언어 전환을 감춘다 — 한국어 한 벌뿐", () => {
    for (const f of ["app/features/[slug]/page.tsx", "app/features/page.tsx"]) {
      expect(readFileSync(join(WEB, f), "utf8")).toContain("showLanguage={false}");
    }
  });
});
```

- [ ] **Step 2: 실패를 본다** — `npx vitest run app/features` → 모듈 없음
- [ ] **Step 3: 구현**
  - `feature-body.tsx`(서버·클라이언트 공용, 훅 없음): `<main>` 안에 `.mcs-section` 들. 차례 = 머리(kicker·h1·lead·버튼 둘) → 「이럴 때 좋습니다」(goodFor) → 「넣는 것」(inputs) → 「만드는 순서」(steps, 번호 붙인 ol) → 「받는 것」(outputs) → 「품질을 지키는 방법」(quality) → 「자주 묻는 질문」(faq, `<dl>`) → 끝 버튼(가입 신청 `/signup`, 설명서 `guideHref`, 모든 기능 보기 `/features`). 제목 h2 문구는 Task 1 의 `FEATURE_SECTIONS`, 버튼 문구는 `FEATURE_CTA` 에서 가져온다(컴포넌트에 한국어를 직접 쓰지 않는다). `FeatureCards` 는 카드마다 `<a href={p.path}>` + `p.keyword` + `p.card`
  - `[slug]/page.tsx`: `export const dynamicParams = false`, `generateStaticParams = () => FEATURE_PAGES.map(({ slug }) => ({ slug }))`, `generateMetadata` = `pageMetadata({ path: page.path, title: page.metaTitle, description: page.metaDescription })` + `keywords: [page.keyword, ...page.keywords]`, 본문 = `LandingHeader(showLanguage={false}, path=page.path)` + `FeatureBody` + `LandingFooter`, 없으면 `notFound()`. 스타일은 소개 화면과 같이 `landing.css`·`hero.css`·`features.css` 를 부르고 바깥 `div.mcs.mcs-dark.features`
  - `page.tsx`(모아 보기): 머리(kicker·h1·lead) + `FeatureCards` + `easyNote` + 가입 신청 버튼
  - `features.css`: 카드 격자(`grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))`), 순서 번호, 질문 목록. 색은 `landing.css` 의 `--mcs-*` 만 쓴다
  - `middleware.ts`: `PUBLIC_PATHS` 에 `"/features"` 와 한 줄 주석(검색으로 들어온 사람이 로그인 화면을 만나지 않게)
  - `landing-header.tsx`: `showLanguage = true` 를 받고 false 면 언어 링크를 그리지 않는다
- [ ] **Step 4: 통과를 본다** — `npx vitest run app/features app/_landing` + `npx tsc --noEmit -p .`
- [ ] **Step 5: 커밋** — `feat(seo): 키워드별 소개 화면과 모아 보기`

### Task 3: 사이트 지도와 방문 분석 이름표

**Files:**
- Modify: `apps/web/lib/seo/sitemap.ts`(`publicPages(guideHrefs, featurePaths = [])`), `apps/web/app/sitemap.ts`, `apps/web/app/admin/analytics/labels.ts`
- Test: `apps/web/lib/seo/__tests__/sitemap.test.ts`, `apps/web/app/__tests__/seo-routes.test.ts`, 방문 분석 이름표 시험(`app/admin/analytics/__tests__/labels.test.ts` 가 있으면 거기, 없으면 새로)

- [ ] **Step 1: 실패하는 시험**
  - `sitemap.test.ts`: `publicPages([], ["/features", "/features/cardnews"])` 에 `{ path: "/features", priority: 0.8 }`, `{ path: "/features/cardnews", priority: 0.7 }`(둘 다 `monthly`, 영어 줄 없음)
  - `seo-routes.test.ts`: `sitemap()` 주소에 `/features` 와 여섯 키워드 주소가 있다(16 → 23 개)
  - 이름표: `pageLabel("/features") === "기능 소개"`, `pageLabel("/features/cardnews") === "기능 소개 · AI 카드뉴스 만들기"`
- [ ] **Step 2: 실패를 본다**
- [ ] **Step 3: 구현** — `publicPages` 뒤에 `...featurePaths.map((path) => ({ path, priority: path === "/features" ? 0.8 : 0.7, changeFrequency: "monthly" as const }))`, `app/sitemap.ts` 는 `["/features", ...FEATURE_PAGES.map((p) => p.path)]` 를 넘긴다. `labels.ts` 의 `PAGE` 에 `"/features": "기능 소개"` 와 `FEATURE_PAGES.map((p) => [p.path, \`기능 소개 · ${p.keyword}\`])`
- [ ] **Step 4: 통과를 본다** — `npx vitest run lib/seo app/__tests__ app/admin/analytics`
- [ ] **Step 5: 커밋** — `feat(seo): 사이트 지도와 방문 분석에 키워드 화면`

### Task 4: 첫 화면 — 주 제목(h1)과 「무엇을 만들 수 있나요」

**Files:**
- Create: `apps/web/app/_landing/features-section.tsx`
- Modify: `apps/web/app/page.tsx`, `apps/web/app/_landing/landing-content.ts`(KO·EN 에 `homeH1`, `featKicker`, `featTitle`, `featLead`, `featMore`)
- Test: `apps/web/app/_landing/__tests__/features-section.test.tsx`

문구(KO / EN):
- `homeH1`: 「FormWith, AI 카드뉴스·상세페이지·광고 소재 만들기」 / "FormWith, an AI studio for card news, detail pages and ad creatives"
- `featKicker`: 「기능」 / "Features"
- `featTitle`: 「무엇을 만들 수 있나요」 / "What you can make"
- `featLead`: 「인스타 카드뉴스, 스마트스토어 상세페이지, 포털 광고 배너, 행사 포스터, 브랜드 캐릭터까지. 마케팅 콘텐츠 제작에 필요한 것을 한 곳에서 만듭니다.」 / "Instagram card news, store detail pages, portal ad banners, event posters and brand characters, all made in one place."
- `featMore`: 「모든 기능 보기」 / "See all features"

- h1 은 **화면에는 안 보이고 읽기 도구와 검색엔진만 읽는다**(`className="sr-only"`). 캐러셀이 첫 화면을 차지해 보이는 제목을 둘 자리가 없고, 내용은 `<title>` 과 같은 말이라 숨긴 글이 아니다. `<main>` 첫 자식
- 새 구획(`id="features"`)은 `Difference` 다음, `</main>` 앞. 카드 여섯 개는 `FeatureCards`(Task 2) — 카드 글은 한국어 데이터라 영어 화면에서도 한국어로 보인다(영어 판 키워드 화면을 만들지 않으므로). 영어 화면에서는 구획 머리만 영어

- [ ] **Step 1: 실패하는 시험** — `features-section.test.tsx`: `FeaturesSection` 을 KO 로 그리면 h2 = 「무엇을 만들 수 있나요」, 링크에 여섯 키워드 주소와 `/features`. 소스 시험: `app/page.tsx` 에 `<h1` 이 정확히 한 번, `className="sr-only"`, `<FeaturesSection` 이 `<Difference` 뒤
- [ ] **Step 2: 실패를 본다**
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과** — `npx vitest run app/_landing app/__tests__` (`header-and-about.test.ts`·`ui-text-dash.test.ts` 포함)
- [ ] **Step 5: 커밋** — `feat(seo): 첫 화면에 주 제목과 기능 구획`

### Task 5: 소개 화면 — 「FormWith 로 만드는 것」

**Files:**
- Modify: `apps/web/app/_landing/about-content.ts`(`AboutCopy` 에 `makeTitle`, `makeLead`), `apps/web/app/about/page.tsx`
- Test: `apps/web/app/_landing/__tests__/header-and-about.test.ts` 에 한 묶음 추가

문구(KO / EN):
- `makeTitle`: 「FormWith 로 만드는 것」 / "What FormWith makes"
- `makeLead`: 「카드뉴스, 상세페이지와 리디자인, 광고 소재, 포스터, 캐릭터. 그림 한 장과 한 줄에서 시작하는 여섯 가지 일입니다. 하나씩 눌러 무엇을 넣고 무엇을 받는지 보세요.」 / "Card news, detail pages and redesigns, ad creatives, posters and characters. Six jobs that start from one image and one line. Open each to see what goes in and what comes out."

- 구획 자리: 마지막 가입 신청 구획(`mcs-h2--cta`) 바로 앞. 카드 = `FeatureCards`(여섯 장 — 리디자인 포함)
- 기존 소개 글(h1·lead 등)은 바꾸지 않는다 — 분위기를 지키고 키워드는 새 구획이 맡는다

- [ ] **Step 1: 실패하는 시험** — 소개 화면 소스에 `<FeatureCards` 가 있고 CTA 구획보다 앞, `ABOUT_KO.makeLead` 에 「카드뉴스」「상세페이지」「광고 소재」「포스터」「캐릭터」가 모두 있다
- [ ] **Step 2: 실패를 본다**
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과** — `npx vitest run app/_landing`
- [ ] **Step 5: 커밋** — `feat(seo): 소개 화면에 만드는 것 구획`

### Task 6: 로컬 화면 확인과 전체 검사

- [ ] **Step 1: 전체 검사** — 저장소 맨 위에서 `pnpm -r typecheck` 오류 0, `pnpm test` 실패 0
- [ ] **Step 2: 로컬 dev(이 작업 폴더에서만)** — 손님으로 `/features`, 여섯 키워드 화면, `/`, `/about` 이 200. `/features/abc` 는 404. 각 화면 head 의 description 40~80자, h1 하나. 휴대폰 폭(390px)과 컴퓨터 폭(1280px) 스크린샷, 가로 넘침 없음, 콘솔 오류 0. 스크린샷을 사용자에게 보여 준다
- [ ] **Step 3: 최종 리뷰** — 가장 성능 좋은 모델의 리뷰어 한 명이 브랜치 전체를 본다(문구 사실성, 금지 표현, 미들웨어 공개 범위)
- [ ] **Step 4: PR → 검사 통과 → 병합 → `docs/DEPLOY.md` 「매 배포」 → 운영 확인(손님으로 일곱 화면 200, 사이트 지도 23 주소) → 개발 일지**

## 하지 않는 것

- 영어 판 키워드 화면(검색 대상이 한국어 사용자)
- 결과물 사진(관리자가 고르는 쇼케이스에 종류 구분이 없어 엉뚱한 그림이 붙을 수 있다)
- 구조화 데이터 FAQPage(구글이 일반 사이트에는 더 이상 질문 결과를 띄우지 않는다)
- 상단바·푸터 목록 변경, 첫 화면 기존 구획 문구 변경
