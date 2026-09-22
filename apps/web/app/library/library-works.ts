import type { ShowcaseSourceKind, ShowcaseAdminView } from "../api/showcase/core";
import { coverOf } from "./works-cover";

/**
 * 계정에 보관된 **상세페이지·리디자인 작업**을 작업물 탭의 모양으로 옮긴다.
 *
 * 이 탭은 카드뉴스와 포스터만 실었다. 상세페이지로 만든 것은 라이브러리
 * 어디에도 안 보였고 — 「불러오기」 창에서만 보였다 — 그래서 「과정 보기」를
 * 붙일 자리조차 없었다(2026-09-16 확인).
 *
 * 카드뉴스·포스터와 달리 이 둘은 **한 표에 함께 있다**(`library_items`).
 * 도구는 행의 `tool` 칸으로만 갈린다.
 *
 * **`server-only` 을 붙이지 않는다.** 순수한 규칙이라 값으로 잰다.
 */

export type WorkTool = "sns" | "poster" | "create" | "redesign";

export const TOOL_LABEL: Record<WorkTool, string> = {
  sns: "카드뉴스",
  poster: "이미지",
  create: "상세페이지",
  redesign: "리디자인",
};

/**
 * 첫 화면 갤러리에서 이 도구는 어느 갈래인가.
 *
 * 갈래는 `library`·`sns`·`poster` 셋뿐이다(`api/showcase/core.ts`). 도구 이름을
 * 그대로 보내면 zod 가 거절하는데, 화면은 이미 「걸림」으로 바뀐 뒤다.
 */
export function showcaseKindOf(tool: WorkTool): ShowcaseSourceKind {
  return tool === "sns" || tool === "poster" ? tool : "library";
}

/**
 * 이 작업이 첫 화면 갤러리에 **걸려 있나.**
 *
 * **몇 번째 장인지는 안 본다.** 카드의 배지는 「이 작업의 무언가가 걸렸다」만
 * 말하면 된다. 처음에는 낱장을 훑어 판단했는데(`work.images.some(...)`),
 * 계정 보관 작업의 낱장은 설계상 늘 빈 배열이라 배지가 영영 안 떴다 —
 * 걸어 놓고 새로고침하면 안 걸린 줄 알고 또 걸려 하게 된다.
 *
 * **갈래는 본다.** id 만 보면 카드뉴스와 상세페이지의 id 가 우연히 같을 때
 * 엉뚱한 카드에 배지가 붙는다. DB 의 중복 방지 열쇠도 갈래를 함께 본다.
 */
export function isWorkShowcased(
  items: ReadonlyArray<Pick<ShowcaseAdminView, "sourceKind" | "sourceId">>,
  tool: WorkTool,
  workId: string,
): boolean {
  const kind = showcaseKindOf(tool);
  return items.some((item) => item.sourceKind === kind && item.sourceId === workId);
}

/** 목록이 주는 한 줄. `lib/server-library.ts` 의 `ServerLibraryItem` 을 따른다. */
export interface LibraryListItem {
  id: string;
  title: string;
  tool: "create" | "redesign";
  aspectRatio: string | null;
  sourceType: "generation" | "character";
  imageCount: number;
  createdAt: string;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  mine: boolean;
  ownerEmail: string | null;
}

/** 작업물 탭의 카드 한 장. `works-tab.tsx` 의 `Work` 와 같은 모양이다. */
export interface LibraryWork {
  id: string;
  tool: WorkTool;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  ownerEmail: string | null;
  mine: boolean;
  cover: string | null;
  /**
   * 이 작업에 그림이 몇 장인가. **`images` 가 비어 있어도 안다.**
   *
   * 카드 본문을 누르면 그림 뷰어가 열리는데, 그 판단을 `images.length` 로 하면
   * 낱장을 미뤄 받는 작업은 영영 뷰어가 안 열린다(늘 0장이다).
   */
  imageCount: number;
  images: Array<{ url: string; label: string; index: number }>;
  intent: string;
  settings: Array<[string, string]>;
  href: string;
  /** 캐릭터 만들기로 만든 것. 도구 칸(`create`)으로는 못 가른다(`work-filter.ts`). */
  origin?: "character";
}

export function libraryWorks(items: readonly LibraryListItem[]): LibraryWork[] {
  return items
    /*
      **캐릭터는 뺀다.** 캐릭터 만들기 결과는 캐릭터 표와 라이브러리 양쪽에
      저장된다(`202607300001_library_source_metadata.sql`). 여기서도 실으면
      캐릭터 탭과 작업물 탭에 같은 것이 두 번 보인다.
    */
    .filter((item) => item.sourceType !== "character")
    .filter(hasPicture)
    .map(toLibraryWork);
}

/**
 * 캐릭터 만들기 결과. **「캐릭터」 거르기를 골랐을 때만 보인다**(2026-09-22 사용자 요청).
 *
 * 「전체」에는 넣지 않는다 — 위 `libraryWorks` 가 뺀 까닭 그대로, 캐릭터 탭과 두 번
 * 보인다. 거르기가 그 규칙을 지킨다(`work-filter.ts`).
 */
export function libraryCharacterWorks(items: readonly LibraryListItem[]): LibraryWork[] {
  return items
    .filter((item) => item.sourceType === "character")
    .filter(hasPicture)
    .map((item) => ({ ...toLibraryWork(item), origin: "character" as const }));
}

// 표지도 없고 열 것도 없는 행. 카드만 덩그러니 서면 눌러도 빈 창이 열린다.
function hasPicture(item: LibraryListItem): boolean {
  return item.imageCount > 0 || Boolean(item.coverUrl || item.coverThumbUrl);
}

function toLibraryWork(item: LibraryListItem): LibraryWork {
  return {
    id: item.id,
    tool: item.tool,
    title: item.title,
    // 계정 보관분은 만들어진 뒤에 올라온 것이라 늘 완료다.
    status: "done",
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    ownerEmail: item.ownerEmail,
    mine: item.mine,
    cover: coverOf({ url: item.coverUrl, thumbUrl: item.coverThumbUrl }),
    imageCount: item.imageCount,
    /*
      **낱장은 여기서 싣지 않는다.** 한 작업에 스무 장까지 들어가는데 목록에서
      전부 서명해 실으면 첫 화면이 다시 무거워진다 — 사용자가 「끊긴다」고
      말한 그 증상이다. 열 때 `/api/library?id=` 로 받는다.
    */
    images: [],
    intent: "",
    settings: [
      ...(item.aspectRatio ? ([["비율", item.aspectRatio]] as Array<[string, string]>) : []),
      ["장수", `${item.imageCount}장`],
    ],
    /*
      **도구 화면으로 보내지 않는다.** 계정 보관분은 브라우저 초안이 아니라
      이어서 편집할 수 없다(`library/page.tsx`). `/create` 로 보내면 「저장된
      작업을 찾지 못했습니다」가 뜬다 — 예전에 실제로 그랬다.
    */
    href: `/library/works/${item.id}`,
  };
}
