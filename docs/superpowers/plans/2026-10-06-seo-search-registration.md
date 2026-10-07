# 검색 노출(SEO)·검색 서비스 등록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FormWith(https://formwith.fix-up.kr)를 네이버 서치어드바이저·구글 서치 콘솔·다음(카카오) 웹마스터도구에 등록하고, 핵심 단어로 검색했을 때 「웹사이트」 영역에 제대로 보이도록 검색 로봇용 정보(robots.txt·사이트 지도·소유 확인 태그·화면별 제목과 설명·대표 주소·언어 대응·구조화 데이터)를 갖춘다.

**Architecture:** 검색 관련 값과 규칙을 `apps/web/lib/seo/` 한 곳에 모은다(사이트 주소·소유 확인 값·화면별 문구·메타데이터 만드는 함수·robots 글·사이트 지도 목록). 공개 화면(첫 화면·소개·사용 설명서 14쪽)은 그 함수로 각자의 제목·설명·대표 주소·공유 정보를 내고, 로그인 등 도움 화면은 「검색에 싣지 않음」을 단다. robots.txt 는 다음 웹마스터도구 확인 줄을 넣어야 해서 Next 의 `robots.ts` 대신 직접 글을 만드는 라우트로 낸다. 미들웨어가 두 파일(robots.txt·sitemap.xml)을 회원 안내 화면으로 돌려보내던 것을 먼저 푼다.

**Tech Stack:** Next.js 15.5 App Router Metadata API(`metadata`/`generateMetadata`, `alternates`, `verification`, `robots`, `app/sitemap.ts`), 라우트 핸들러, vitest, react-dom/server(구조화 데이터 렌더 시험).

**Spec:** 사용자 요청(2026-10-06): 「이 사이트를 네이버, 구글, 카카오에 웹서치어드바이저에 등록했을 때 키워드 검색시 웹 사이트 영역에서 보일 수 있게 SEO 메타태그 데이터 작업」, 「계획도 대충 세우지 말고 상세히」. 핵심 단어는 컨트롤러 제안을 사용자가 받아들임(「네」): AI 카드뉴스 만들기, 상세페이지 제작, 광고 소재 만들기, AI 포스터, 마케팅 콘텐츠 제작, AI 이미지 생성, 상세페이지 리디자인, 캐릭터 만들기.

## 지금 상태(2026-10-06 운영에서 로봇 이름으로 직접 확인)

| 항목 | 운영 결과 | 문제 |
|---|---|---|
| `/robots.txt` | **307 → `/?signup=required&next=/robots.txt`** | 미들웨어가 회원 안내로 보낸다. 파일을 만들어도 로봇이 못 읽는다 |
| `/sitemap.xml` | **307 → 같은 곳** | 같은 문제 |
| 첫 화면 `<head>` | 제목·설명·og·twitter 있음 | 대표 주소(canonical)·언어 대응(hreflang)·소유 확인·구조화 데이터 없음 |
| `/guide/cardnews` 등 | 제목만 화면별, **설명·og 는 첫 화면 것 그대로**, **og:url 이 첫 화면 주소** | 모든 화면이 같은 설명 → 검색 결과에 같은 문구 |
| `/?signup=required&next=…`, `/guide?signup=…` | 대표 주소 없음 | 조회 값 붙은 주소가 따로 색인될 수 있다 |
| 영어 첫 화면 `/?lang=en` | 서버 렌더 됨 | 한국어 판과 이어 주는 표시 없음 |
| 본문 글 | 서버에서 그려짐(로봇이 읽을 수 있음) | 문제없음 |
| `http://54.180.68.212/` | 308 → 도메인 | 문제없음(중복 주소 없음) |

## 바뀌는 파일 지도

| 파일 | 할 일 |
|---|---|
| Create `apps/web/lib/seo/site.ts` | 사이트 이름·주소·공유 그림·**소유 확인 값 자리**·`verificationMetadata()` |
| Create `apps/web/lib/seo/copy.ts` | 핵심 단어, 첫 화면(한·영)과 사용 설명서 14쪽의 제목·설명 |
| Create `apps/web/lib/seo/metadata.ts` | `pageMetadata()`·`guideMetadata()`·`noIndexMetadata()`·`languageAlternates()` |
| Create `apps/web/lib/seo/robots.ts` | 막을 경로 목록·`robotsTxt()` |
| Create `apps/web/lib/seo/sitemap.ts` | `publicPages()`·`sitemapEntries()` |
| Create `apps/web/app/robots.txt/route.ts` | robots.txt 내보내기 |
| Create `apps/web/app/sitemap.ts` | sitemap.xml 내보내기 |
| Create `apps/web/app/_landing/structured-data.tsx` | 회사·사이트 구조화 데이터(JSON-LD) |
| Create `apps/web/app/{login,signup,forgot-password,reset-password}/layout.tsx` | 「검색에 싣지 않음」 |
| Create `docs/SEO.md` | 세 검색 서비스 등록 절차와 확인 값 넣는 법 |
| Modify `apps/web/middleware.ts` | robots.txt·sitemap.xml 을 회원 확인 없이 통과 |
| Modify `apps/web/app/layout.tsx` | 주소를 `lib/seo/site` 에서 받기, 소유 확인 태그, 잘못된 og:url 빼기 |
| Modify `apps/web/app/page.tsx` | `generateMetadata`(한·영, 대표 주소, 언어 대응, 핵심 단어) + 구조화 데이터 |
| Modify `apps/web/app/about/page.tsx` | `generateMetadata` 를 `pageMetadata` 로 |
| Modify 사용 설명서 14개 `apps/web/app/guide/page.tsx`, `apps/web/app/guide/*/page.tsx` | `metadata = guideMetadata("<자기 주소>")` |
| Tests | `apps/web/lib/seo/__tests__/*.test.ts`, `apps/web/app/__tests__/seo-*.test.ts(x)`, `apps/web/__tests__/middleware-nonmember.test.ts`(추가) |

## Global Constraints

- 작업 위치: `.worktrees/site-analytics` 워크트리, 브랜치 `feat/seo-search-registration`(origin/master `45a36b87` 에서). 메인 폴더·`.worktrees/easy-image-edit` 는 건드리지 않는다.
- 운영 도메인: `https://formwith.fix-up.kr`. 주소는 `process.env.NEXT_PUBLIC_SITE_URL`(빌드 때 박힘)에서 받고, 끝 `/` 는 뗀다. 없으면 기존 layout 과 같은 `http://54.180.68.212`.
- 새 npm 패키지 없음. SQL·DB 변경 없음.
- **소유 확인 값은 코드에 둔다**(공개되는 meta 값이라 비밀이 아니다). 값이 비어 있으면 그 태그·줄을 만들지 않는다. 값은 사용자가 콘솔에서 받아 준다.
- 기존 사용 설명서 제목 글자는 **그대로** 쓴다(아래 표의 title 은 지금 각 파일에 있는 값). 기존 제목 틀 `"%s — FormWith"`(layout) 는 그대로 둔다.
- 한글이 든 문구에 줄표(—, –)를 쓰지 않는다(`app/__tests__/ui-text-dash.test.ts`). 새 문구의 구분은 `|` 또는 `·`.
- 설명(description)은 한 화면에 하나씩, 40~160자, 실제 기능과 맞는 말만(과장 금지: 「더 잘 팔리는」 같은 약속 금지).
- 공개 화면만 사이트 지도에 넣는다: `/`, `/about`, 그리고 `GUIDE_TOPICS`(꺼진 「팀」은 이미 빠져 있다). 회원 화면·관리자·API 는 robots.txt 에서 막는다. 로그인·가입·비밀번호 화면은 robots 로 막지 않고 「noindex」를 단다(막으면 noindex 를 못 읽는다).
- Next 의 메타데이터는 위아래 겹칠 때 **`openGraph` 를 통째로 바꾼다**(깊게 합치지 않음). 그래서 화면별 openGraph 에는 늘 공유 그림까지 다 넣는다(`pageMetadata` 가 한다).
- 파일 400줄 미만, 함수 50줄 미만, 불변 패턴, console.log 없음, 기존 주석 말투(한국어).
- 커밋 꼬리: 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **로그인·만료 상태와 상관없이 robots.txt·sitemap.xml 이 200** 이어야 한다 — 손님, 로그인한 회원, 24시간이 지난 회원 모두. → Task 2 미들웨어 시험(손님·회원 둘), 배포 뒤 curl.
2. **조회 값 붙은 주소의 대표 주소** — `/?signup=required&next=/create`·`/?lang=en`·`/guide?signup=1` 이 각각 `/`·`/?lang=en`·`/guide` 를 대표 주소로 가져야 한다. → Task 3 시험(`pageMetadata` 는 조회 값 없는 경로만 받는다), 배포 뒤 curl.
3. **화면별 openGraph 가 공유 그림을 잃지 않는다**(Next 가 통째로 바꾸므로). → Task 1 시험.
4. **꺼진 화면·회원 화면이 사이트 지도에 안 들어간다**(`/guide/team`, `/create` …). → Task 2 시험.
5. **확인 값이 비어 있을 때 빈 태그·빈 줄을 내지 않는다**, 값이 이상하면(줄바꿈 섞임, 다음 값 앞머리 틀림) robots.txt 를 망가뜨리지 않는다. → Task 1·2 시험.

---

### Task 1: 검색 기본값·문구·메타데이터 함수(`lib/seo`)

**Files:**
- Create: `apps/web/lib/seo/site.ts`, `apps/web/lib/seo/copy.ts`, `apps/web/lib/seo/metadata.ts`
- Test: `apps/web/lib/seo/__tests__/site.test.ts`, `apps/web/lib/seo/__tests__/metadata.test.ts`

**Interfaces (Produces):**
- `site.ts`: `SITE_NAME = "FormWith"`, `SITE_URL: string`, `OG_IMAGE: { url: string; width: number; height: number; alt: string }`, `type SearchVerificationCodes = { google: string; naver: string; daumPin: string }`, `SEARCH_VERIFICATION: SearchVerificationCodes`, `verificationMetadata(codes?: SearchVerificationCodes): Metadata["verification"]`
- `copy.ts`: `KEYWORDS: readonly string[]`, `interface PageCopy { title: string; description: string }`, `HOME_COPY: Record<"ko" | "en", PageCopy>`, `GUIDE_COPY: Readonly<Record<string, PageCopy>>`
- `metadata.ts`: `interface PageMetaInput { path: string; title: string; description: string; absoluteTitle?: boolean; locale?: "ko" | "en"; languages?: Record<string, string> }`, `pageMetadata(input: PageMetaInput): Metadata`, `languageAlternates(ko: string, en: string): Record<string, string>`, `guideMetadata(href: string): Metadata`, `noIndexMetadata(title: string): Metadata`

- [ ] **Step 1: 시험을 먼저 쓴다**

`apps/web/lib/seo/__tests__/site.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { verificationMetadata } from "../site";

/** 소유 확인 값(계획 2026-10-06 seo-search-registration). 비면 태그를 안 만든다. */
describe("verificationMetadata", () => {
  it("둘 다 비면 아무것도 내지 않는다", () => {
    expect(verificationMetadata({ google: "", naver: "", daumPin: "" })).toBeUndefined();
  });
  it("구글만", () => {
    expect(verificationMetadata({ google: "g-code", naver: "", daumPin: "" })).toEqual({ google: "g-code" });
  });
  it("네이버는 naver-site-verification 이름으로", () => {
    expect(verificationMetadata({ google: "", naver: "n-code", daumPin: "" })).toEqual({
      other: { "naver-site-verification": "n-code" },
    });
  });
  it("둘 다, 앞뒤 공백은 지운다", () => {
    expect(verificationMetadata({ google: " g ", naver: " n ", daumPin: "" })).toEqual({
      google: "g",
      other: { "naver-site-verification": "n" },
    });
  });
});
```

`apps/web/lib/seo/__tests__/metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GUIDE_TOPICS } from "../../../app/guide/_components/topics";
import { GUIDE_COPY, HOME_COPY, KEYWORDS } from "../copy";
import { guideMetadata, languageAlternates, noIndexMetadata, pageMetadata } from "../metadata";
import { OG_IMAGE } from "../site";

/** 화면별 검색 정보(계획 2026-10-06 seo-search-registration). */
describe("pageMetadata", () => {
  const meta = pageMetadata({ path: "/guide/cardnews", title: "카드뉴스 만들기 · 사용 설명서", description: "설명" });

  it("대표 주소는 받은 경로 그대로", () => {
    expect(meta.alternates?.canonical).toBe("/guide/cardnews");
  });
  it("openGraph 는 공유 그림까지 다 갖는다 — Next 가 통째로 바꾸기 때문", () => {
    expect(meta.openGraph).toMatchObject({
      url: "/guide/cardnews", siteName: "FormWith", locale: "ko_KR", type: "website",
      title: "카드뉴스 만들기 · 사용 설명서 | FormWith", description: "설명",
    });
    expect((meta.openGraph as { images: unknown[] }).images).toEqual([OG_IMAGE]);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: [OG_IMAGE.url] });
  });
  it("absoluteTitle 이면 틀을 안 씌운다", () => {
    const home = pageMetadata({ path: "/", title: "FormWith | X", description: "d", absoluteTitle: true });
    expect(home.title).toEqual({ absolute: "FormWith | X" });
    expect(home.openGraph?.title).toBe("FormWith | X");
  });
  it("영어 판은 en_US, 언어 대응을 단다", () => {
    const en = pageMetadata({ path: "/?lang=en", title: "t", description: "d", locale: "en", languages: languageAlternates("/", "/?lang=en") });
    expect(en.openGraph).toMatchObject({ locale: "en_US" });
    expect(en.alternates?.languages).toEqual({ ko: "/", en: "/?lang=en", "x-default": "/" });
  });
});

describe("문구", () => {
  const all = [HOME_COPY.ko, HOME_COPY.en, ...Object.values(GUIDE_COPY)];

  it.each(all.map((copy) => [copy.title, copy]))("%s 설명은 40~160자, 줄표 없음", (_title, copy) => {
    expect(copy.description.length).toBeGreaterThanOrEqual(40);
    expect(copy.description.length).toBeLessThanOrEqual(160);
    expect(copy.description).not.toMatch(/[—–]/);
    expect(copy.title).not.toMatch(/[—–]/);
  });
  it("첫 화면 한국어 설명에 핵심 단어의 중심 말이 들어 있다", () => {
    for (const word of ["카드뉴스", "상세페이지", "광고 소재", "포스터", "캐릭터"]) {
      expect(HOME_COPY.ko.description).toContain(word);
    }
    expect(KEYWORDS).toContain("AI 카드뉴스 만들기");
  });
  it("설명서 목차의 모든 쪽에 문구가 있다(꺼진 팀 쪽 포함)", () => {
    for (const topic of GUIDE_TOPICS) expect(GUIDE_COPY[topic.href], topic.href).toBeDefined();
    expect(GUIDE_COPY["/guide/team"]).toBeDefined();
  });
});

describe("guideMetadata", () => {
  it("자기 주소를 대표 주소로, 문구 표의 제목·설명으로", () => {
    const meta = guideMetadata("/guide/cardnews");
    expect(meta.alternates?.canonical).toBe("/guide/cardnews");
    expect(meta.title).toBe(GUIDE_COPY["/guide/cardnews"]!.title);
    expect(meta.description).toBe(GUIDE_COPY["/guide/cardnews"]!.description);
  });
  it("문구가 없는 주소는 빌드에서 바로 멈춘다", () => {
    expect(() => guideMetadata("/guide/nope")).toThrow(/검색 문구/);
    expect(() => guideMetadata("constructor")).toThrow(/검색 문구/);
  });
});

describe("noIndexMetadata", () => {
  it("색인은 막고 링크는 따라가게", () => {
    expect(noIndexMetadata("로그인")).toEqual({ title: "로그인", robots: { index: false, follow: true } });
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web exec vitest run lib/seo` → 모듈 없음으로 FAIL.

- [ ] **Step 3: 구현**

`apps/web/lib/seo/site.ts`:

```ts
import type { Metadata } from "next";

/**
 * **검색 노출(SEO)의 사이트 기본값**(계획 2026-10-06 seo-search-registration).
 *
 * 주소는 빌드 때 박히는 `NEXT_PUBLIC_SITE_URL` 에서 받는다(운영: https://formwith.fix-up.kr).
 * 대표 주소·사이트 지도·공유 정보가 모두 이 값을 쓴다 — 여러 곳에 적으면 하나만 바뀐다.
 */
export const SITE_NAME = "FormWith";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://54.180.68.212").replace(/\/+$/, "");

/** 링크를 붙였을 때 뜨는 그림. 바꿀 때는 파일 이름도 바꾼다(`app/layout.tsx` 주석). */
export const OG_IMAGE = { url: "/og-hero.png", width: 1200, height: 630, alt: "FormWith 가 만든 결과물" } as const;

export type SearchVerificationCodes = { google: string; naver: string; daumPin: string };

/**
 * **검색 서비스 소유 확인 값.** 각 콘솔이 주는 값을 그대로 넣는다(사이트에 공개되는 값이라 비밀이 아니다).
 *
 * - google: 구글 서치 콘솔 → URL 접두어 → HTML 태그의 `content` 값
 * - naver: 네이버 서치어드바이저 → 사이트 등록 → HTML 태그의 `content` 값
 * - daumPin: 다음 웹마스터도구가 준 robots.txt 한 줄 전체(`#DaumWebMasterTool:` 로 시작)
 *
 * 비어 있으면 그 태그·줄을 만들지 않는다. 넣는 법은 `docs/SEO.md`.
 */
export const SEARCH_VERIFICATION: SearchVerificationCodes = {
  google: "",
  naver: "",
  daumPin: "",
};

export function verificationMetadata(codes: SearchVerificationCodes = SEARCH_VERIFICATION): Metadata["verification"] {
  const google = codes.google.trim();
  const naver = codes.naver.trim();
  if (!google && !naver) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(naver ? { other: { "naver-site-verification": naver } } : {}),
  };
}
```

`apps/web/lib/seo/copy.ts`:

```ts
/**
 * **검색 결과에 보일 화면별 제목·설명**(계획 2026-10-06 seo-search-registration).
 *
 * 설명은 화면마다 하나, 40~160자, 실제 기능과 맞는 말만 쓴다(시험이 본다). 설명서 제목은 각 화면에
 * 원래 있던 글자 그대로다 — 검색용으로 따로 바꾸면 화면 머리와 결과 제목이 어긋난다.
 * 핵심 단어는 사용자가 2026-10-06 에 정했다.
 */
export const KEYWORDS = [
  "AI 카드뉴스 만들기",
  "상세페이지 제작",
  "광고 소재 만들기",
  "AI 포스터",
  "마케팅 콘텐츠 제작",
  "AI 이미지 생성",
  "상세페이지 리디자인",
  "캐릭터 만들기",
] as const;

export interface PageCopy {
  title: string;
  description: string;
}

export const HOME_COPY: Record<"ko" | "en", PageCopy> = {
  ko: {
    title: "FormWith | AI 카드뉴스·상세페이지·광고 소재 만들기",
    description:
      "레퍼런스 한 장이면 같은 결의 이미지가 나옵니다. 카드뉴스, 상세페이지, 광고 소재, 포스터, 캐릭터를 AI로 한 곳에서 만드는 마케팅 콘텐츠 제작 스튜디오 FormWith.",
  },
  en: {
    title: "FormWith | AI marketing content studio",
    description:
      "Give one reference and get images in the same style. Make card news, product detail pages, ad creatives, posters and characters with AI in one studio.",
  },
};

export const GUIDE_COPY: Readonly<Record<string, PageCopy>> = {
  "/guide": {
    title: "사용 설명서",
    description:
      "FormWith 사용 설명서. AI로 카드뉴스, 이미지, 상세페이지, 캐릭터를 만드는 도구가 무엇이고 서로 어떻게 이어지는지 처음부터 안내합니다.",
  },
  "/guide/easy": {
    title: "쉽게 · 사용 설명서",
    description:
      "「쉽게」 사용법. 만들고 싶은 장면을 말로 묻고 답하다가, 원할 때 AI가 마케팅 이미지를 만들어 주는 방법을 안내합니다.",
  },
  "/guide/image": {
    title: "이미지 만들기 · 사용 설명서",
    description:
      "광고 소재, 포스터, 일반 이미지 한 장을 AI로 만드는 방법. 레퍼런스를 넣어 같은 분위기의 이미지를 얻는 순서를 안내합니다.",
  },
  "/guide/cardnews": {
    title: "카드뉴스 만들기 · 사용 설명서",
    description:
      "AI 카드뉴스 만들기 사용법. 주제나 글을 넣으면 기획과 원고를 정리하고, 여러 장의 카드뉴스 이미지를 만드는 두 가지 방법을 안내합니다.",
  },
  "/guide/character": {
    title: "캐릭터 만들기 · 사용 설명서",
    description:
      "AI 캐릭터 만들기 사용법. 사람, 동물, 캐릭터, 사물의 모습을 고정해 두고 여러 이미지에서 같은 모습으로 다시 쓰는 방법을 안내합니다.",
  },
  "/guide/ad": {
    title: "광고 규격으로 내보내기 · 사용 설명서",
    description:
      "만든 이미지를 포털 광고 규격 크기로 한 번에 내보내는 방법. 비율 맞춤, 안전영역 표시, 내보낸 파일 검사를 안내합니다.",
  },
  "/guide/detail-page": {
    title: "상세페이지 만들기 · 사용 설명서",
    description:
      "AI 상세페이지 제작 사용법. 상품 사진 한 장 또는 글만으로 쇼핑몰 상세페이지를 기획하고 이미지로 만드는 순서를 안내합니다.",
  },
  "/guide/redesign": {
    title: "상세페이지 리디자인 · 사용 설명서",
    description:
      "상세페이지 리디자인 사용법. 이미 있는 상세페이지를 AI가 뜯어보고 구성과 디자인을 새로 설계하는 방법을 안내합니다.",
  },
  "/guide/library": {
    title: "라이브러리 · 사용 설명서",
    description:
      "라이브러리 사용법. 레퍼런스와 재료 이미지를 모아 두고 카드뉴스, 이미지, 상세페이지 어느 도구에서든 불러 쓰는 방법을 안내합니다.",
  },
  "/guide/team": {
    title: "팀 · 사용 설명서",
    description:
      "팀 사용법. 팀원과 재료를 나눠 쓰고 크레딧을 함께 관리하는 방법을 안내합니다. 지금은 팀 기능을 잠시 꺼 두었습니다.",
  },
  "/guide/credits": {
    title: "크레딧과 모델 · 사용 설명서",
    description:
      "크레딧과 생성 모델 안내. 기능마다 크레딧이 얼마나 차감되는지와 이미지 생성 방식을 고르는 기준을 정리했습니다.",
  },
  "/guide/account": {
    title: "계정과 플랜 · 사용 설명서",
    description:
      "계정과 플랜 안내. 내 정보 확인, 구독과 해지, 환불 신청, 회원 탈퇴 방법을 한 곳에 정리했습니다.",
  },
  "/guide/trouble": {
    title: "막혔을 때 · 사용 설명서",
    description:
      "FormWith를 쓰다 막혔을 때 보는 안내. 화면에 나온 안내 문구가 무슨 뜻이고 어떻게 하면 되는지 정리했습니다.",
  },
};
```

(구현자 확인 사항: `GUIDE_COPY` 의 title 은 지금 각 설명서 파일의 `metadata.title` 과 **글자까지 같아야** 한다. 다르면 이 표를 파일 쪽 글자로 맞춘다. 설명서 목차에 위 표에 없는 쪽이 있으면 같은 말투로 한 줄 더하고 보고한다.)

`apps/web/lib/seo/metadata.ts`:

```ts
import type { Metadata } from "next";
import { GUIDE_COPY } from "./copy";
import { OG_IMAGE, SITE_NAME } from "./site";

/**
 * **화면 하나의 검색 정보 만들기**(계획 2026-10-06 seo-search-registration).
 *
 * Next 는 위아래 메타데이터가 겹치면 `openGraph`·`twitter` 를 **통째로 바꾼다**. 그래서 여기서
 * 공유 그림까지 늘 다 채운다. `path` 는 조회 값 없는 경로만 받는다(영어 판의 `?lang=en` 만 예외) —
 * `/?signup=required&next=…` 같은 주소도 대표 주소는 `/` 가 된다.
 */
export interface PageMetaInput {
  path: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
  locale?: "ko" | "en";
  languages?: Record<string, string>;
}

export function pageMetadata(input: PageMetaInput): Metadata {
  const shareTitle = input.absoluteTitle ? input.title : `${input.title} | ${SITE_NAME}`;
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: input.path, ...(input.languages ? { languages: input.languages } : {}) },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: input.locale === "en" ? "en_US" : "ko_KR",
      url: input.path,
      title: shareTitle,
      description: input.description,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: shareTitle, description: input.description, images: [OG_IMAGE.url] },
  };
}

/** 한국어 판과 영어 판을 서로 잇는다. 모르는 언어로 오면 한국어 판(x-default). */
export function languageAlternates(ko: string, en: string): Record<string, string> {
  return { ko, en, "x-default": ko };
}

/** 설명서 한 쪽. 문구가 없으면 빌드에서 바로 멈춘다 — 조용히 첫 화면 설명으로 떨어지지 않게. */
export function guideMetadata(href: string): Metadata {
  const copy = Object.hasOwn(GUIDE_COPY, href) ? GUIDE_COPY[href] : undefined;
  if (!copy) throw new Error(`설명서 검색 문구가 없습니다: ${href}`);
  return pageMetadata({ path: href, title: copy.title, description: copy.description });
}

/** 로그인·가입처럼 검색 결과에 나올 까닭이 없는 화면. 링크는 따라가게 둔다. */
export function noIndexMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: true } };
}
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter web exec vitest run lib/seo app/__tests__/ui-text-dash.test.ts` → PASS.
- [ ] **Step 5: 커밋** — `feat(seo): 검색 기본값·화면별 문구·메타데이터 함수`

---

### Task 2: robots.txt·사이트 지도·미들웨어 통과

**Files:**
- Create: `apps/web/lib/seo/robots.ts`, `apps/web/lib/seo/sitemap.ts`, `apps/web/app/robots.txt/route.ts`, `apps/web/app/sitemap.ts`
- Modify: `apps/web/middleware.ts` (`/api/health` 통과 줄 바로 아래)
- Test: `apps/web/lib/seo/__tests__/robots.test.ts`, `apps/web/lib/seo/__tests__/sitemap.test.ts`, `apps/web/app/__tests__/seo-routes.test.ts`, `apps/web/__tests__/middleware-nonmember.test.ts`(추가)

**Interfaces:**
- Consumes: `SITE_URL`, `SEARCH_VERIFICATION` (Task 1), `GUIDE_TOPICS` (`app/guide/_components/topics.ts`), `APP_ROUTES` (`lib/access/routes.ts`)
- Produces: `PRIVATE_PREFIXES: readonly string[]`, `robotsTxt(input: { siteUrl: string; daumPin?: string; disallow?: readonly string[] }): string`, `interface SitemapPage { path: string; priority: number; changeFrequency: "weekly" | "monthly"; english?: string }`, `publicPages(guideHrefs: readonly string[]): SitemapPage[]`, `sitemapEntries(siteUrl: string, pages: readonly SitemapPage[], now: Date): MetadataRoute.Sitemap`

- [ ] **Step 1: 시험을 먼저 쓴다**

`apps/web/lib/seo/__tests__/robots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "../../access/routes";
import { PRIVATE_PREFIXES, robotsTxt } from "../robots";

/** 검색 로봇 안내(계획 2026-10-06 seo-search-registration). */
const disallowed = (text: string) => text.split("\n").filter((l) => l.startsWith("Disallow: ")).map((l) => l.slice(10));
// robots.txt 의 Disallow 는 앞머리 일치다 — 그 글자로 시작하는 주소를 막는다.
const blocks = (prefixes: string[], path: string) => prefixes.some((p) => path.startsWith(p));

describe("robotsTxt", () => {
  const text = robotsTxt({ siteUrl: "https://formwith.fix-up.kr" });

  it("모두에게 열고, 사이트 지도 주소를 절대 주소로 알린다", () => {
    expect(text).toContain("User-agent: *\nAllow: /\n");
    expect(text).toContain("Sitemap: https://formwith.fix-up.kr/sitemap.xml");
  });
  it("회원 화면·관리자·API 는 막는다(사이드바 화면 전부, 설명서 빼고)", () => {
    const list = disallowed(text);
    for (const route of APP_ROUTES.filter((r) => r.path !== "/guide")) {
      expect(blocks(list, route.path), route.path).toBe(true);
    }
    for (const path of ["/api/track", "/auth/callback", "/easy", "/ad", "/onboarding", "/access"]) {
      expect(blocks(list, path), path).toBe(true);
    }
  });
  it("공개 화면은 하나도 막지 않는다", () => {
    const list = disallowed(text);
    for (const path of ["/", "/about", "/guide", "/guide/easy", "/guide/ad", "/login", "/signup"]) {
      expect(blocks(list, path), path).toBe(false);
    }
  });
  it("다음 확인 줄은 맨 위에, 비면 안 넣는다", () => {
    expect(robotsTxt({ siteUrl: "https://a.kr", daumPin: "#DaumWebMasterTool:abc:def" }).split("\n")[0]).toBe("#DaumWebMasterTool:abc:def");
    expect(robotsTxt({ siteUrl: "https://a.kr", daumPin: "" })).not.toContain("DaumWebMasterTool");
  });
  it("이상한 다음 값은 거절한다 — robots.txt 를 망가뜨리지 않게", () => {
    expect(() => robotsTxt({ siteUrl: "https://a.kr", daumPin: "abc" })).toThrow(/DaumWebMasterTool/);
    expect(() => robotsTxt({ siteUrl: "https://a.kr", daumPin: "#DaumWebMasterTool:a\nDisallow: /" })).toThrow(/DaumWebMasterTool/);
  });
  it("막을 목록에 설명서·소개·첫 화면이 없다", () => {
    expect(PRIVATE_PREFIXES).not.toContain("/");
    expect(PRIVATE_PREFIXES.some((p) => "/guide".startsWith(p) || "/about".startsWith(p))).toBe(false);
  });
});
```

`apps/web/lib/seo/__tests__/sitemap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GUIDE_TOPICS } from "../../../app/guide/_components/topics";
import { publicPages, sitemapEntries } from "../sitemap";

/** 사이트 지도(계획 2026-10-06 seo-search-registration). */
const now = new Date("2026-10-06T00:00:00Z");
const entries = sitemapEntries("https://formwith.fix-up.kr", publicPages(GUIDE_TOPICS.map((t) => t.href)), now);
const urls = entries.map((e) => e.url);

describe("sitemapEntries", () => {
  it("첫 화면·소개·설명서 목차 전부를 절대 주소로", () => {
    expect(urls).toContain("https://formwith.fix-up.kr/");
    expect(urls).toContain("https://formwith.fix-up.kr/about");
    for (const topic of GUIDE_TOPICS) expect(urls).toContain(`https://formwith.fix-up.kr${topic.href}`);
    expect(urls).toHaveLength(2 + GUIDE_TOPICS.length);
  });
  it("꺼진 화면·회원 화면은 없다", () => {
    for (const path of ["/guide/team", "/create", "/sns", "/admin", "/login", "/signup"]) {
      expect(urls).not.toContain(`https://formwith.fix-up.kr${path}`);
    }
  });
  it("첫 화면과 소개는 영어 판을 잇는다", () => {
    const home = entries.find((e) => e.url === "https://formwith.fix-up.kr/");
    expect(home?.alternates?.languages).toEqual({ ko: "https://formwith.fix-up.kr/", en: "https://formwith.fix-up.kr/?lang=en" });
    expect(home?.priority).toBe(1);
  });
  it("주소 끝 / 가 겹치지 않고 마지막 수정 시각을 단다", () => {
    expect(urls.every((u) => !u.includes("//", 8))).toBe(true);
    expect(entries.every((e) => e.lastModified === now)).toBe(true);
  });
});
```

`apps/web/app/__tests__/seo-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GET } from "../robots.txt/route";
import sitemap from "../sitemap";

/** 실제로 내보내는 robots.txt·sitemap.xml(계획 2026-10-06 seo-search-registration). */
describe("robots.txt 라우트", () => {
  it("글자 파일로 내고 사이트 지도를 알린다", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    const text = await res.text();
    expect(text).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m);
    expect(text).toContain("Disallow: /admin");
  });
});

describe("sitemap.ts", () => {
  it("공개 화면을 낸다", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/about"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/guide/cardnews"))).toBe(true);
  });
});
```

`apps/web/__tests__/middleware-nonmember.test.ts` — 기존 describe 들 아래에 추가:

```ts
describe("검색 로봇 파일은 회원 확인 없이 통과한다(계획 2026-10-06 seo-search-registration)", () => {
  it.each(["/robots.txt", "/sitemap.xml"])("손님이 %s 를 열면 안내로 보내지 않는다", async (path) => {
    const response = await middleware(요청(path));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it.each(["/robots.txt", "/sitemap.xml"])("로그인한 회원이 %s 를 열어도 그대로 통과", async (path) => {
    currentUser = { id: "member-1" };
    const response = await middleware(요청(path));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web exec vitest run lib/seo app/__tests__/seo-routes.test.ts __tests__/middleware-nonmember.test.ts` → FAIL(모듈 없음, 미들웨어는 307).

- [ ] **Step 3: 구현**

`apps/web/lib/seo/robots.ts`:

```ts
/**
 * **검색 로봇 안내(robots.txt)**(계획 2026-10-06 seo-search-registration).
 *
 * Next 의 `robots.ts` 는 주석 줄을 못 넣는다. 다음 웹마스터도구는 소유 확인을 robots.txt 의
 * `#DaumWebMasterTool:…` 한 줄로 하므로 글을 직접 만든다.
 *
 * 막는 것: 회원 화면·관리자·API·로그인 처리 주소. 로그인·가입·비밀번호 화면은 막지 않는다 —
 * 막으면 로봇이 그 화면의 「noindex」를 못 읽어 주소만 색인될 수 있다.
 */
export const PRIVATE_PREFIXES = [
  "/api/",
  "/auth/",
  "/admin",
  "/create",
  "/sns",
  "/poster",
  "/redesign",
  "/characters",
  "/library",
  "/settings",
  "/easy",
  "/ad",
  "/onboarding",
  "/access",
  "/inbox",
  "/sources",
  "/team",
] as const;

const DAUM_PIN = /^#DaumWebMasterTool:[^\s]+$/;

export function robotsTxt({
  siteUrl,
  daumPin = "",
  disallow = PRIVATE_PREFIXES,
}: {
  siteUrl: string;
  daumPin?: string;
  disallow?: readonly string[];
}): string {
  const pin = daumPin.trim();
  if (pin && !DAUM_PIN.test(pin)) throw new Error("다음 확인 값은 #DaumWebMasterTool: 로 시작하는 한 줄이어야 합니다");
  return [
    ...(pin ? [pin] : []),
    "User-agent: *",
    "Allow: /",
    ...disallow.map((prefix) => `Disallow: ${prefix}`),
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}
```

(주의: `"/ad"` 는 `/admin` 도 막지만 `/about` 은 막지 않는다 — 앞머리 글자가 `/ab` 라서. 시험이 본다.)

`apps/web/lib/seo/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";

/**
 * **사이트 지도(sitemap.xml)에 넣을 공개 화면**(계획 2026-10-06 seo-search-registration).
 *
 * 첫 화면·소개·사용 설명서 목차만 넣는다. 설명서 목차(`GUIDE_TOPICS`)는 꺼진 화면을 이미 뺀다.
 * 첫 화면과 소개는 영어 판(`?lang=en`)을 잇는다.
 */
export interface SitemapPage {
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly";
  english?: string;
}

export function publicPages(guideHrefs: readonly string[]): SitemapPage[] {
  return [
    { path: "/", priority: 1, changeFrequency: "weekly", english: "/?lang=en" },
    { path: "/about", priority: 0.8, changeFrequency: "monthly", english: "/about?lang=en" },
    ...guideHrefs.map((path) => ({
      path,
      priority: path === "/guide" ? 0.7 : 0.6,
      changeFrequency: "monthly" as const,
    })),
  ];
}

export function sitemapEntries(siteUrl: string, pages: readonly SitemapPage[], now: Date): MetadataRoute.Sitemap {
  return pages.map((page) => ({
    url: `${siteUrl}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    ...(page.english
      ? { alternates: { languages: { ko: `${siteUrl}${page.path}`, en: `${siteUrl}${page.english}` } } }
      : {}),
  }));
}
```

`apps/web/app/robots.txt/route.ts`:

```ts
import { robotsTxt } from "../../lib/seo/robots";
import { SEARCH_VERIFICATION, SITE_URL } from "../../lib/seo/site";

/** robots.txt — 글은 `lib/seo/robots.ts` 가 만든다(다음 확인 줄 때문에 직접 낸다). */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(robotsTxt({ siteUrl: SITE_URL, daumPin: SEARCH_VERIFICATION.daumPin }), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
```

`apps/web/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { publicPages, sitemapEntries } from "../lib/seo/sitemap";
import { SITE_URL } from "../lib/seo/site";
import { GUIDE_TOPICS } from "./guide/_components/topics";

/** sitemap.xml — 공개 화면만(계획 2026-10-06 seo-search-registration). */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(SITE_URL, publicPages(GUIDE_TOPICS.map((topic) => topic.href)), new Date());
}
```

`apps/web/middleware.ts` — `if (pathname === "/api/health" || pathname === "/api/health/ready") return response;` 줄 **바로 아래**에:

```ts
  // 검색 로봇 파일(계획 2026-10-06 seo-search-registration). 회원 확인 없이 연다 — 막으면 로봇이
  // 「회원가입이 필요합니다」 화면을 받아 사이트 지도를 못 읽는다(운영에서 307 로 확인).
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return response;
```

- [ ] **Step 4: 통과 확인** — 위 시험 명령 → PASS. 기존 `__tests__/middleware-*.test.ts` 전부도 통과.
- [ ] **Step 5: 커밋** — `feat(seo): robots.txt·사이트 지도를 내고, 미들웨어가 두 파일을 막지 않게`

---

### Task 3: 화면에 붙이기 — 공통 틀, 첫 화면(한·영), 소개, 설명서 14쪽, 도움 화면 noindex

**Files:**
- Modify: `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/about/page.tsx`
- Modify: `apps/web/app/guide/page.tsx` 와 `apps/web/app/guide/{account,ad,cardnews,character,credits,detail-page,easy,image,library,redesign,team,trouble}/page.tsx`
- Create: `apps/web/app/login/layout.tsx`, `apps/web/app/signup/layout.tsx`, `apps/web/app/forgot-password/layout.tsx`, `apps/web/app/reset-password/layout.tsx`
- Test: `apps/web/app/__tests__/seo-wiring.test.ts`

**Interfaces:**
- Consumes: `SITE_URL`, `verificationMetadata` (site.ts), `HOME_COPY`, `KEYWORDS` (copy.ts), `pageMetadata`, `languageAlternates`, `guideMetadata`, `noIndexMetadata` (metadata.ts), `ABOUT[locale].metaTitle/metaDescription` (`app/_landing/about-content.ts`)

- [ ] **Step 1: 시험을 먼저 쓴다**

`apps/web/app/__tests__/seo-wiring.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **화면마다 검색 정보가 제대로 붙었나**(계획 2026-10-06 seo-search-registration).
 *
 * 화면 파일을 통째로 불러오면 회원 시스템까지 끌려온다. 그래서 각 파일이 **어느 함수를 어느 주소로**
 * 부르는지 읽어 본다 — 주소를 잘못 넣으면(남의 쪽 설명) 바로 걸린다. 함수 자체는 `lib/seo` 시험이 본다.
 */
const APP = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(APP, ...parts), "utf8");

const GUIDE_PAGES: Array<[file: string, href: string]> = [
  ["guide/page.tsx", "/guide"],
  ...["account", "ad", "cardnews", "character", "credits", "detail-page", "easy", "image", "library", "redesign", "team", "trouble"].map(
    (slug): [string, string] => [`guide/${slug}/page.tsx`, `/guide/${slug}`],
  ),
];

describe("설명서 14쪽", () => {
  it.each(GUIDE_PAGES)("%s 는 guideMetadata(\"%s\")", (file, href) => {
    const source = read(file);
    expect(source).toContain(`export const metadata = guideMetadata("${href}");`);
    expect(source).not.toMatch(/export const metadata: Metadata = \{ title:/);
  });
});

describe("도움 화면은 검색에 안 싣는다", () => {
  it.each([
    ["login", "로그인"],
    ["signup", "회원가입"],
    ["forgot-password", "비밀번호 찾기"],
    ["reset-password", "비밀번호 바꾸기"],
  ])("%s/layout.tsx 가 noIndexMetadata(\"%s\")", (dir, title) => {
    expect(existsSync(join(APP, dir, "layout.tsx"))).toBe(true);
    expect(read(dir, "layout.tsx")).toContain(`export const metadata = noIndexMetadata("${title}");`);
  });
});

describe("공통 틀·첫 화면·소개", () => {
  it("공통 틀은 주소를 lib/seo 에서 받고, 소유 확인 태그를 달고, 모든 화면에 첫 화면 og:url 을 박지 않는다", () => {
    const layout = read("layout.tsx");
    expect(layout).toContain('from "../lib/seo/site"');
    expect(layout).toContain("verification: verificationMetadata()");
    expect(layout).not.toMatch(/url:\s*SITE_URL/);
    expect(layout).not.toMatch(/const SITE_URL =/);
  });
  it("첫 화면은 언어별 generateMetadata 와 구조화 데이터를 낸다", () => {
    const page = read("page.tsx");
    expect(page).toContain("export async function generateMetadata");
    expect(page).toContain('languageAlternates("/", "/?lang=en")');
    expect(page).toContain("<StructuredData />");
  });
  it("소개는 pageMetadata 로 대표 주소와 영어 판을 잇는다", () => {
    const about = read("about", "page.tsx");
    expect(about).toContain('languageAlternates("/about", "/about?lang=en")');
    expect(about).toContain("pageMetadata(");
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web exec vitest run app/__tests__/seo-wiring.test.ts` → FAIL.

- [ ] **Step 3: 구현**

(a) `apps/web/app/layout.tsx`
- `const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://54.180.68.212";` 줄을 지우고 맨 위 import 들에 `import { SITE_URL, verificationMetadata } from "../lib/seo/site";` 를 더한다(`metadataBase: new URL(SITE_URL)` 는 그대로 쓴다).
- `metadata` 객체에 `verification: verificationMetadata(),` 한 줄을 더한다(`manifest` 줄 아래).
- `openGraph` 안의 `url: SITE_URL,` 줄을 지운다. 그 자리 위에 주석 한 줄: `// og:url 은 화면마다 단다(lib/seo/metadata). 여기 두면 모든 화면이 첫 화면 주소를 공유 주소로 낸다.`
- 다른 줄은 바꾸지 않는다(제목 틀 `"%s — FormWith"`, 설명, 그림, 아이콘, 주석 그대로).

(b) `apps/web/app/page.tsx` — import 를 더한다:

```ts
import type { Metadata } from "next";
import { HOME_COPY, KEYWORDS } from "../lib/seo/copy";
import { languageAlternates, pageMetadata } from "../lib/seo/metadata";
import { StructuredData } from "./_landing/structured-data";
```

`HomePage` 위에:

```ts
/**
 * 첫 화면의 검색 정보. 대표 주소는 언어별로 `/` 또는 `/?lang=en` 하나다 —
 * `/?signup=required&next=…` 로 열려도 대표 주소는 `/` 다(계획 2026-10-06 seo-search-registration).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = lang === "en" ? "en" : "ko";
  return {
    ...pageMetadata({
      path: locale === "en" ? "/?lang=en" : "/",
      title: HOME_COPY[locale].title,
      description: HOME_COPY[locale].description,
      absoluteTitle: true,
      locale,
      languages: languageAlternates("/", "/?lang=en"),
    }),
    ...(locale === "ko" ? { keywords: [...KEYWORDS] } : {}),
  };
}
```

`return (` 안 맨 바깥 `<div className="mcs mcs-dark">` 의 첫 자식으로 `<StructuredData />` 를 넣는다(Task 4 가 만든다 — Task 3 과 Task 4 는 한 구현자가 차례로 하거나, Task 4 를 먼저 한다).

(c) `apps/web/app/about/page.tsx` — `generateMetadata` 의 return 을 바꾼다:

```ts
  const locale = lang === "en" ? "en" : "ko";
  const a = ABOUT[locale];
  return pageMetadata({
    path: locale === "en" ? "/about?lang=en" : "/about",
    title: a.metaTitle,
    description: a.metaDescription,
    locale,
    languages: languageAlternates("/about", "/about?lang=en"),
  });
```

import 에 `import { languageAlternates, pageMetadata } from "../../lib/seo/metadata";` 를 더한다(기존 `const a = ABOUT[lang === "en" ? "en" : "ko"];` 줄은 위 두 줄로 바뀐다).

(d) 설명서 14쪽 — 각 파일의 `export const metadata: Metadata = { title: "…" };` 를 `export const metadata = guideMetadata("<그 파일의 주소>");` 로 바꾼다. import 는 `apps/web/app/guide/page.tsx` 에서 `import { guideMetadata } from "../../lib/seo/metadata";`, `apps/web/app/guide/<slug>/page.tsx` 에서 `import { guideMetadata } from "../../../lib/seo/metadata";`. 그 파일에서 `Metadata` 타입을 더는 안 쓰면 `import type { Metadata } from "next";` 를 지운다(다른 데서 쓰면 둔다). 바꾸기 전에 그 파일의 title 글자가 `GUIDE_COPY` 의 title 과 같은지 확인한다(다르면 Task 1 의 표를 파일 쪽으로 맞추고 보고).

(e) 도움 화면 layout 넷 — 예: `apps/web/app/login/layout.tsx`

```tsx
import type { ReactNode } from "react";
import { noIndexMetadata } from "../../lib/seo/metadata";

/** 로그인 화면은 검색 결과에 나올 까닭이 없다. 화면이 클라이언트 컴포넌트라 여기서 단다. */
export const metadata = noIndexMetadata("로그인");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
```

`signup` → `noIndexMetadata("회원가입")`, `forgot-password` → `noIndexMetadata("비밀번호 찾기")`, `reset-password` → `noIndexMetadata("비밀번호 바꾸기")` (주석의 화면 이름도 맞춘다).

- [ ] **Step 4: 통과 확인** — `pnpm --filter web exec vitest run app/__tests__/seo-wiring.test.ts lib/seo app/guide app/__tests__/ui-text-dash.test.ts`, web 타입 검사(`pnpm --filter web exec tsc --noEmit -p .`).
- [ ] **Step 5: 커밋** — `feat(seo): 첫 화면·소개·설명서에 화면별 검색 정보, 도움 화면은 noindex`

---

### Task 4: 구조화 데이터(JSON-LD) — 회사·사이트

**Files:**
- Create: `apps/web/app/_landing/structured-data.tsx`
- Test: `apps/web/app/_landing/__tests__/structured-data.test.tsx`

**Interfaces:**
- Consumes: `BUSINESS` (`app/_landing/legal/business-info.ts` — `companyName`, `address`, `contact`), `CS_EMAIL` (`lib/cs/contact.ts`), `SITE_NAME`, `SITE_URL` (site.ts)
- Produces: `structuredData(siteUrl?: string): Array<Record<string, unknown>>`, `StructuredData(): JSX.Element`

- [ ] **Step 1: 시험을 먼저 쓴다**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUSINESS } from "../legal/business-info";
import { StructuredData, structuredData } from "../structured-data";

/** 검색 결과용 회사·사이트 정보(계획 2026-10-06 seo-search-registration). */
describe("structuredData", () => {
  const [org, site] = structuredData("https://formwith.fix-up.kr");

  it("회사 정보는 사업자 정보와 같은 값", () => {
    expect(org).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BUSINESS.companyName,
      url: "https://formwith.fix-up.kr",
      logo: "https://formwith.fix-up.kr/icon-512.png",
      telephone: BUSINESS.contact,
    });
  });
  it("사이트 정보는 FormWith, 한국어", () => {
    expect(site).toMatchObject({ "@type": "WebSite", name: "FormWith", url: "https://formwith.fix-up.kr/", inLanguage: "ko-KR" });
  });
});

describe("StructuredData", () => {
  it("ld+json 스크립트 하나로 내고, </script> 로 끊길 글자를 막는다", () => {
    const html = renderToStaticMarkup(<StructuredData />);
    expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
    const body = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"));
    expect(body).not.toContain("<");
    expect(JSON.parse(body.replace(/\\u003c/g, "<"))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web exec vitest run app/_landing/__tests__/structured-data.test.tsx` → FAIL.

- [ ] **Step 3: 구현** `apps/web/app/_landing/structured-data.tsx`:

```tsx
import { CS_EMAIL } from "../../lib/cs/contact";
import { SITE_NAME, SITE_URL } from "../../lib/seo/site";
import { BUSINESS } from "./legal/business-info";

/**
 * **검색 결과용 회사·사이트 정보(JSON-LD)**(계획 2026-10-06 seo-search-registration).
 *
 * 값은 사업자 정보(`legal/business-info.ts`)에서 받는다 — 여기 따로 적으면 주소·전화가 바뀔 때 어긋난다.
 * 우리 상수만 넣지만, 글 안의 `<` 는 `\u003c` 로 바꿔 스크립트가 중간에 끊기지 않게 한다.
 */
export function structuredData(siteUrl: string = SITE_URL): Array<Record<string, unknown>> {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BUSINESS.companyName,
      alternateName: "fixup",
      url: siteUrl,
      logo: `${siteUrl}/icon-512.png`,
      email: CS_EMAIL,
      telephone: BUSINESS.contact,
      address: { "@type": "PostalAddress", streetAddress: BUSINESS.address, addressCountry: "KR" },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${siteUrl}/`,
      inLanguage: "ko-KR",
      publisher: { "@type": "Organization", name: BUSINESS.companyName },
    },
  ];
}

export function StructuredData() {
  const json = JSON.stringify(structuredData()).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
```

- [ ] **Step 4: 통과 확인** — 위 시험 PASS.
- [ ] **Step 5: 커밋** — `feat(seo): 첫 화면에 회사·사이트 구조화 데이터`

---

### Task 5: 등록 안내 문서 + 전체 검증 + 배포 + 운영 확인

**Files:** Create `docs/SEO.md`

- [ ] **Step 1: `docs/SEO.md`** — 아래 내용을 쓴다(비개발자가 읽을 말로).
  - 세 콘솔 등록 순서(네이버 서치어드바이저 → 구글 서치 콘솔 → 다음 웹마스터도구), 각 콘솔에서 고를 방식(HTML 태그 / URL 접두어 HTML 태그 / robots.txt PIN), 받은 값을 넣는 자리(`apps/web/lib/seo/site.ts` 의 `SEARCH_VERIFICATION`), 넣은 뒤 배포하고 콘솔에서 「확인」 누르기.
  - 확인 뒤 할 일: 세 곳 모두 사이트 지도 `https://formwith.fix-up.kr/sitemap.xml` 제출, 네이버 「웹 페이지 수집 요청」(첫 화면·소개·사용 설명서), 구글 「URL 검사 → 색인 생성 요청」, 다음은 사이트 지도·수집 요청.
  - 검색에 실제로 뜨기까지 며칠~몇 주 걸린다는 것, 「웹사이트」 영역 노출은 검색 서비스가 정한다는 것(우리가 할 수 있는 것은 정보를 바르게 주는 것까지).
  - 새 공개 화면을 만들면: `lib/seo/copy.ts` 에 문구, 설명서면 목차(`topics.ts`)에 넣으면 사이트 지도에 저절로 들어간다.
- [ ] **Step 2: CI 전체를 로컬에서** — `pnpm -r typecheck`, `pnpm test`, `TEST_PG_BIN="C:/Program Files/PostgreSQL/17/bin" pnpm test:credit-db`, `pnpm check:cost-forecast` 실패 0.
- [ ] **Step 3: 로컬 빌드로 라우트 확인** — dev 서버가 없는 이 워크트리에서 `pnpm --filter web build` 한 번(빌드 로그에 `/robots.txt`·`/sitemap.xml` 이 경로로 잡히는지). Windows 꾸러미(`build:ec2`)는 만들지 않는다. 빌드가 너무 무거우면 대신 `pnpm --filter web dev` 로 띄워 `curl localhost:3000/robots.txt`·`/sitemap.xml`·`/` 의 `<head>` 를 확인하고 서버를 끈다.
- [ ] **Step 4: 독립 리뷰** — 코드 리뷰 + (검색 정보 정확성) 리뷰. 지적 반영.
- [ ] **Step 5: PR → CI → master 병합 → 릴리스 → EC2 배포**(`docs/DEPLOY.md` 매 배포, SQL 없음).
- [ ] **Step 6: 운영 확인**(curl, 로봇 이름으로)
  - `curl -A "Yeti" https://formwith.fix-up.kr/robots.txt` → 200, `text/plain`, `Sitemap:` 줄
  - `curl https://formwith.fix-up.kr/sitemap.xml` → 200, XML, 주소 2 + 설명서 목차 수
  - 첫 화면 `<head>`: `<link rel="canonical" href="https://formwith.fix-up.kr/">`, `hreflang` ko·en·x-default, `keywords`, `application/ld+json`
  - `/?signup=required&next=/create` 의 canonical 이 `https://formwith.fix-up.kr/`
  - `/guide/cardnews`: 자기 설명, canonical·og:url 이 자기 주소
  - `/login`: `<meta name="robots" content="noindex, follow">`
- [ ] **Step 7: 사용자 콘솔 작업 안내**(`docs/SEO.md` 대로) — 확인 값을 받으면 Task 6.

### Task 6: 소유 확인 값 넣기(사용자가 값을 준 뒤)

**Files:** Modify `apps/web/lib/seo/site.ts` (`SEARCH_VERIFICATION` 세 칸만)
- [ ] 받은 값을 넣는다(구글·네이버는 content 값만, 다음은 한 줄 전체). 시험 `lib/seo`·`seo-routes` 통과 확인(다음 값이 형식에 안 맞으면 robots 시험·빌드에서 멈춘다).
- [ ] 커밋 `chore(seo): 검색 서비스 소유 확인 값` → PR → 배포 → 운영에서 `<meta name="google-site-verification">`·`<meta name="naver-site-verification">`·robots.txt 첫 줄 확인 → 사용자에게 콘솔 「확인」 누르기 안내.
- (값이 Task 5 배포 전에 오면 Task 5 와 한 번에 배포한다.)

---

## 이 계획에서 하지 않는 것(일부러 뺀 것)

- 검색 순위를 직접 올리는 일(글 더 쓰기·외부 링크 늘리기·블로그 운영) — 콘텐츠·마케팅 영역이라 코드로 못 한다.
- 화면별 공유 그림 따로 만들기 — 지금 그림 하나로 충분하고, 그림 제작은 별도 작업.
- 네이버 RSS 제출 — 글이 계속 올라오는 블로그형 화면이 없다.
- 빙(Bing)·얀덱스 등록 — 요청 범위 밖.
