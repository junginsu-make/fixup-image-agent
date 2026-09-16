/**
 * 상세페이지·리디자인 작업의 **과정**을 무엇으로 남길까.
 *
 * 카드뉴스·포스터는 작업 표의 `data` 칸에 과정이 통째로 남는데, 상세페이지는
 * `library_items` 에 **제목·비율·표지**만 남았다. 그래서 「과정 보기」를
 * 눌러도 보여줄 것이 없었다(2026-09-16 확인).
 *
 * **소급되지 않는다.** 여기서 남기기 시작하는 것뿐이고, 그전 작업은 영영
 * 비어 있다 — 화면이 그 사실을 말해야 한다.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 값으로 잰다.
 */

/**
 * 화면이 읽는 과정 한 벌. 없는 칸은 아예 안 넣는다.
 *
 * **`interface` 가 아니라 `type` 이다.** 이 값은 `library_items.data` 라는
 * json 한 칸에 그대로 들어가는데, 저장 쪽은 모양을 모르고 `Record<string,
 * unknown>` 으로만 받는다(`lib/server-library.ts`). 인터페이스에는 색인
 * 서명이 안 붙어 그 자리에 못 들어간다.
 */
export type WorkProcess = {
  summary?: string;
  sections?: Array<{ title: string; role?: string; copy?: string }>;
  review?: unknown;
  aspectRatio?: string;
};

/**
 * 얼마나 담을 수 있나.
 *
 * 과정은 화면이 보낸 글에서 만들어져 `library_items.data` 한 칸에 들어간다.
 * 상한이 없으면 한 요청으로 표에 수십 MB 를 밀어 넣을 수 있고, 그 행은
 * 라이브러리를 열 때마다 따라 나온다. 그림은 세는 자리가 있었는데
 * (`MAX_IMAGES`) 글은 아무도 안 세던 자리였다.
 *
 * 값은 **실제로 쓰는 것보다 넉넉하게** 잡았다. 요약은 보통 한두 문장이고
 * 섹션은 4~7개다 — 자르는 일이 정상 작업에서는 일어나지 않는다.
 *
 * 심사는 크기를 따로 안 잰다. `reviewOf` 가 칸과 개수를 고르면서 이미
 * 잘린다 — 두 군데서 재면 그 둘이 어긋난다.
 */
const LIMIT = {
  summary: 1000,
  sections: 50,
  title: 200,
  role: 200,
  copy: 1000,
} as const;

/** 심사 한 줄이 쓰는 칸. 그 밖은 버린다. */
const REVIEW_KEYS = ["criterion", "rating", "evidence", "fix"] as const;

type ReviewRow = Partial<Record<(typeof REVIEW_KEYS)[number], string>>;

/**
 * 문자열만 통과시키고 **길면 자른다.**
 *
 * 객체가 새면 화면이 `[object Object]` 를 그린다.
 */
function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/**
 * 심사를 **모양까지** 골라 담는다.
 *
 * 크기만 재면 10만 자 안에 무엇이든 들어간다 — 예를 들어
 * `{"items":[{"evidence":"data:image/png;base64,…"}]}` 가 그대로 표에 들어간다.
 * 이 파일이 내건 「화면이 보낸 것을 그대로 담지 않는다」가 이 가지에서만
 * 열려 있었다(2026-09-16 독립 리뷰).
 *
 * 심사 한 줄이 쓰는 칸은 넷뿐이다(`packages/pdp-core/src/pdp.review.ts` 의
 * `ReviewItem`) — `criterion`·`rating`·`evidence`·`fix`. 그 밖은 버린다.
 *
 * **`normalizeReview` 를 부르지 않는다.** 그 함수는 `@fixup/pdp-core` 에
 * 있는데, 이 파일은 상세페이지와 리디자인 **양쪽 화면**이 불러 쓴다. 여기서
 * 끌어오면 리디자인 묶음에까지 그 꾸러미가 딸려 온다. 칸 넷을 고르는 일에
 * 그만한 값을 치를 이유가 없다.
 */
function reviewOf(review: unknown): { items: ReviewRow[] } | null {
  if (!review || typeof review !== "object") return null;
  const items = (review as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;

  const rows = items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const row: ReviewRow = {};
      for (const key of REVIEW_KEYS) {
        const value = text(item[key], LIMIT.copy);
        if (value) row[key] = value;
      }
      return row;
    })
    // 빈 껍데기를 담으면 화면이 「심사했다」고 읽는다.
    .filter((row) => Object.keys(row).length)
    .slice(0, LIMIT.sections);

  return rows.length ? { items: rows } : null;
}

/**
 * 저장할 과정을 고른다.
 *
 * **원본 사진은 담지 않는다.** `originalImage` 는 base64 라 한 장이 수 MB 고,
 * 결과 그림은 이미 `library_images` 에 따로 저장된다. 과정 칸에까지 넣으면
 * 행 하나가 통째로 무거워진다.
 *
 * **빈 값은 칸을 만들지 않는다.** `{}` 로 남으면 화면이 「과정이 있다」고 읽고
 * 빈 상자를 그린다 — 그럴 바에 없는 편이 낫다.
 *
 * **아무 값이나 와도 넘어지지 않는다.** 이 함수가 서버의 경계다. 과정은
 * 화면이 보낸 기획안에서 골라 담는데, 화면을 믿고 그대로 넣으면 base64 한
 * 장이 섞여 드는 길이 열리고 그때는 이미 표에 들어간 뒤다. 그래서 타입을
 * 선언해 두고도 **값으로 다시 잰다** — 타입은 실행 중에 아무것도 막지 못한다.
 */
export function workProcessOf(input: {
  blueprint?: {
    executiveSummary?: string | null;
    sections?: Array<{ title?: string | null; role?: string | null; copy?: string | null }> | null;
  } | null;
  review?: unknown;
  aspectRatio?: string | null;
}): WorkProcess | null {
  const blueprint =
    input.blueprint && typeof input.blueprint === "object" && !Array.isArray(input.blueprint)
      ? input.blueprint
      : null;

  const sections = (Array.isArray(blueprint?.sections) ? blueprint.sections : [])
    .filter((section): section is NonNullable<typeof section> =>
      Boolean(section) && typeof section === "object")
    .map((section) => {
      const role = text(section.role, LIMIT.role);
      const copy = text(section.copy, LIMIT.copy);
      return {
        title: text(section.title, LIMIT.title),
        ...(role ? { role } : {}),
        ...(copy ? { copy } : {}),
      };
    })
    .filter((section) => section.title || section.copy)
    // 자르는 것은 **거른 뒤**다. 먼저 자르면 빈 섹션이 자리를 차지해 실제로
    // 담기는 것이 50개보다 적어진다.
    .slice(0, LIMIT.sections);

  const review = reviewOf(input.review);
  const summary = text(blueprint?.executiveSummary, LIMIT.summary);
  // 비율은 `4:5` 같은 짧은 말이다. 길면 값이 아니라 다른 것이 온 것이다.
  const aspectRatio = text(input.aspectRatio, 20);

  const process: WorkProcess = {
    ...(summary ? { summary } : {}),
    ...(sections.length ? { sections } : {}),
    ...(review ? { review } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
  };

  return Object.keys(process).length ? process : null;
}

/**
 * 이 작업에 보여줄 과정이 있나.
 *
 * 옛 작업은 `null` 이다 — 남기기 전에 만든 것이라 소급되지 않는다. 화면은
 * 「이 작업은 과정이 남아 있지 않습니다」라고 **말해야** 한다. 빈 화면만
 * 내면 사라진 것으로 읽힌다(2026-09-16 포스터에서 실제로 그렇게 읽혔다).
 */
export function hasProcess(data: unknown): data is WorkProcess {
  if (!data || typeof data !== "object") return false;
  const process = data as WorkProcess;
  return Boolean(
    process.summary || process.sections?.length || process.review || process.aspectRatio,
  );
}

/**
 * 서버에 보내는 과정의 **재료**. `workProcessOf` 가 이것을 받아 골라 담는다.
 *
 * 화면은 이 모양까지만 맞춰 주면 된다. 무엇이 실제로 저장되는지는 여전히
 * `workProcessOf` 한 곳이 정한다 — 화면을 믿지 않는다.
 */
export interface ProcessSource {
  blueprint: {
    executiveSummary?: string | null;
    sections?: Array<{ title?: string | null; role?: string | null; copy?: string | null }>;
  };
  review?: unknown;
  aspectRatio?: string | null;
}

/**
 * 상세페이지 구성안을 과정의 모양으로 옮긴다.
 *
 * 칸 이름이 다르다 — 구성안은 `section_name`·`goal`·`headline` 이다. 화면마다
 * 손으로 옮기면 이름이 갈리고 한쪽만 고쳐진 채로 남는다.
 *
 * **`generatedImage` 를 떨군다.** base64 data URL 이라 섹션마다 수 MB 다.
 * 서버가 한 번 더 거르지만, 거기까지 가기 전에 회선을 태우는 것이 이미 손해다.
 */
export function pdpProcessSource(
  result: {
    blueprint?: {
      executiveSummary?: string | null;
      sections?: Array<{
        section_name?: string | null;
        goal?: string | null;
        headline?: string | null;
      }> | null;
    } | null;
    review?: unknown;
  },
  aspectRatio?: string | null,
): ProcessSource {
  return {
    blueprint: {
      executiveSummary: result.blueprint?.executiveSummary ?? null,
      sections: (result.blueprint?.sections ?? []).map((section) => ({
        title: section?.section_name ?? null,
        role: section?.goal ?? null,
        copy: section?.headline ?? null,
      })),
    },
    review: result.review,
    aspectRatio,
  };
}

/**
 * 리디자인 작업을 과정의 모양으로 옮긴다.
 *
 * **요청한 말이 요약이다.** 리디자인에는 구성안이 없다. 사용자가 적어 낸
 * 요청이 곧 「무엇을 하려 했는가」라서 그것을 요약 자리에 둔다.
 *
 * `imageUrl` 은 떨군다 — 상세페이지의 `generatedImage` 와 같은 이유다.
 *
 * **리디자인은 섹션마다 저장을 부른다.** 그중 첫 번째만 표에 담기고 나머지는
 * 이어 붙는다(`lib/server-library.ts`). 그래도 매번 이것을 보내는 이유는,
 * 어느 호출이 첫 번째가 될지 화면에서 알 수 없기 때문이다.
 */
export function redesignProcessSource(project: {
  request?: string | null;
  ratio?: string | null;
  sections?: Array<{
    name?: string | null;
    purpose?: string | null;
    prompt?: string | null;
  }> | null;
}): ProcessSource {
  return {
    blueprint: {
      executiveSummary: project.request ?? null,
      sections: (project.sections ?? []).map((section) => ({
        title: section?.name ?? null,
        role: section?.purpose ?? null,
        copy: section?.prompt ?? null,
      })),
    },
    aspectRatio: project.ratio ?? null,
  };
}
