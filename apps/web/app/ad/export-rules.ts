import type * as React from "react";
import type { LibraryItem } from "@fixup/shared";
import { AD_SPECS, type AdSpec } from "../../lib/ad/specs";

/**
 * 광고 규격 화면의 순수한 규칙들.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §9
 *
 * **`server-only` 를 붙이지 않는다.** 화면과 시험 양쪽에서 읽는다 —
 * `grid-thumbnail-path.ts` 가 같은 이유로 갈라져 있다.
 */

export const PORTAL_LABEL: Record<AdSpec["portal"], string> = {
  naver: "네이버",
  google: "구글",
  kakao: "카카오",
};

export interface SpecRow {
  spec: AdSpec;
  /** 지금 뽑을 수 있는가. 못 뽑는 것도 목록에 두되 회색으로 보인다(설계 §9). */
  supported: boolean;
  /** 못 뽑는 까닭. 화면이 그대로 적는다. */
  unsupportedReason?: string;
}

/**
 * 화면에 걸 목록.
 *
 * **지원 안 하는 규격도 숨기지 않는다.** 숨기면 「이 시스템은 비즈보드를
 * 모르는구나」가 되고, 보이면 「아직 안 되는구나」가 된다(설계 §9 원칙 3).
 */
export function specRows(plan: (spec: AdSpec) => { kind: string; reason?: string }): SpecRow[] {
  return AD_SPECS.map((spec) => {
    const decided = plan(spec);
    const supported = decided.kind === "resize" || decided.kind === "crop";
    return {
      spec,
      supported,
      ...(supported ? {} : { unsupportedReason: decided.reason ?? "아직 지원하지 않습니다." }),
    };
  });
}

/**
 * 처음에 켜 둘 규격.
 *
 * **필수는 켜고 선택은 끈다**(설계 §9 원칙 1). 못 뽑는 것은 필수여도 안 켠다 —
 * 켜 봐야 실패만 돌아온다.
 *
 * 「한 번에 전부」를 기본값으로 삼지 않는 이유가 하나 더 있다: 규격 12개를 뽑으면
 * 응답이 base64 로 8MB 다(실측, 설계 §10 2단계).
 */
export function defaultSelection(rows: SpecRow[]): string[] {
  return rows.filter((row) => row.supported && row.spec.required).map((row) => row.spec.id);
}

/**
 * ZIP 안의 파일 이름.
 *
 * **사용자가 적은 문자열을 쓰지 않는다.** 작업 제목은 다듬어지지 않은 채 표에
 * 들어가므로, 파일 이름에 넣으면 경로 구분자나 확장자를 바꿔 놓을 수 있다.
 * 이 저장소는 같은 판단을 이미 했다(`api/library/.../file/route.ts` 머리말).
 *
 * 규격 id 는 우리가 정한 값이라 안전하지만, 그래도 한 번 거른다 — 나중에
 * 누가 id 에 슬래시를 넣을 수 있다.
 */
export function zipEntryName(specId: string, format: AdSpec["format"]): string {
  const safe = specId.replace(/[^a-zA-Z0-9-]/g, "-");
  const extension = format === "jpg" ? "jpg" : "png";
  return `${safe}.${extension}`;
}

/** data URL 에서 바이트만 꺼낸다. ZIP 에 넣을 때 쓴다. */
export function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("data URL 이 아닙니다.");
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 안전영역을 화면 좌표로 옮긴다.
 *
 * 규격의 `safeArea` 는 **실제 픽셀**이고 미리보기는 줄여서 보여 주므로, 그대로
 * 덮으면 띠가 엉뚱한 자리에 앉는다. 비율로 바꿔 CSS 에 넘긴다.
 */
export function safeAreaPercent(
  safeArea: NonNullable<AdSpec["safeArea"]>,
  target: { width: number; height: number },
): { top: string; right: string; bottom: string; left: string } {
  const pct = (value: number, total: number) => `${((value / total) * 100).toFixed(2)}%`;
  return {
    top: pct(safeArea.top, target.height),
    bottom: pct(safeArea.bottom, target.height),
    left: pct(safeArea.left, target.width),
    right: pct(safeArea.right, target.width),
  };
}

/**
 * 「많이 줄었다」고 알릴 기준.
 *
 * 214×214 는 1200×1200 에서 5.6배 축소다. 헤드라인이 안 읽히는 결과가 규격
 * 검증을 전부 통과하고 나가므로(설계 §5.2), 사람이 볼 때 눈에 띄어야 한다.
 */
export const SHRINK_WARNING = 4;

/**
 * 안전영역 밖을 덮는 반투명 띠의 CSS.
 *
 * **`border-width` 에 퍼센트를 넣으면 안 된다.** CSS 의 `<line-width>` 는
 * 길이·`thin`·`medium`·`thick` 만 받는다 — 퍼센트는 **무시된다.** 초판이 그렇게
 * 썼고, 띠가 아예 안 그려지는데 화면은 멀쩡해 보였다. 이 화면의 핵심 보증 하나가
 * 조용히 없는 상태였다.
 *
 * 대신 **안전영역만큼 안쪽에 놓인 사각형**을 만들고, 그 바깥을 거대한 그림자로
 * 덮는다. `top`·`right`·`bottom`·`left` 는 퍼센트를 받는다.
 *
 * **부르는 쪽이 `overflow: hidden` 을 보장해야 한다.** 안 그러면 9999px 그림자가
 * 미리보기 밖으로 새어 **격자 전체를 붉게 덮는다.** 이것이 이 함수의 유일한 숨은
 * 전제이고, jsdom 이 없어 **시험이 못 잡는 유일한 자리**다 — CSS 를 만드는 곳과
 * 담는 곳이 파일로 갈려 있어 한쪽만 고치는 사람이 다른 쪽을 안 본다.
 * 담는 자리는 `ad-export-client.tsx` 의 미리보기 칸이다.
 *
 * 그래서 보이는 것은 **가장자리가 어둡게 덮인 그림**이다 — 그 어두운 자리에
 * 주요 요소를 두면 포털이 가릴 수 있다는 뜻이다.
 */
export function safeAreaOverlayStyle(
  safeArea: NonNullable<AdSpec["safeArea"]>,
  target: { width: number; height: number },
): React.CSSProperties {
  const band = safeAreaPercent(safeArea, target);
  return {
    top: band.top,
    right: band.right,
    bottom: band.bottom,
    left: band.left,
    // **색을 리터럴로 박지 않는다.** 이 띠가 하는 일이 「가려질 자리를 붉게
    // 덮는다」이므로, 다크 모드에서 배경만 어두워지고 띠가 안 따라오면 대비가
    // 그만큼 떨어진다. 초판(`border-destructive/40`)은 토큰이었고 따라 움직였다.
    //
    // `--destructive` 는 **hex** 다(`globals.css:50`). `hsl(var(--destructive))`
    // 로 감싸면 `hsl(#b0453c)` 가 되어 **조용히 버려진다** — 이 함수가 고치려던
    // 바로 그 부류의 버그다. 저장소가 이미 쓰는 `color-mix` 로 섞는다
    // (`app/create/create-theme.css:41`).
    boxShadow: "0 0 0 9999px color-mix(in srgb, var(--destructive) 18%, transparent)",
  };
}

/**
 * 이 화면에서 고를 수 있는 작업만 남긴다.
 *
 * `loadLibrary()` 는 네 종류를 합쳐서 준다 — 브라우저에만 있는 pdp 초안·리디자인
 * 프로젝트, 계정 보관분, 스타일 참고. 그런데 `/api/ad/export` 는
 * `getLibraryImageFile` 로 **`library_images` 표만** 읽는다.
 *
 * 그래서 브라우저 저장분은 **서버에 파일이 아예 없고**, 참고 이미지는 id 체계가
 * 다르다. 걸러내지 않으면 사용자가 고를 수 있는데 누르면 「뽑지 못했습니다」만
 * 뜬다 — 왜 안 되는지 알 길이 없다.
 */
export function exportableItems(items: LibraryItem[]): LibraryItem[] {
  return items.filter((item) => item.storage === "account" && item.tool !== "reference");
}

/**
 * 이 화면에서 고를 수 있는 것 — **라이브러리와 포스터 작업을 함께.**
 *
 * 설계 §10 3-e. **3단계가 만드는 것은 라이브러리에 없다.** 광고 마스터는
 * `poster_images` 에 쌓이는데 이 화면은 `library_images` 만 읽어서, 마스터를
 * 만들고 여기 오면 **고를 그림이 하나도 없었다.** 로컬에서 실제로 켜 보고
 * 알았다 — 리뷰 넷이 전부 못 봤다. 양쪽이 각각은 맞았기 때문이다.
 *
 * **`loadLibrary()` 를 안 고친다.** 그 함수를 보는 화면이 넷이라(`/ad`·라이브러리·
 * 카드뉴스 레이아웃·캐릭터), 거기에 포스터를 더하면 광고와 무관한 세 화면이
 * 함께 바뀐다.
 *
 * **포스터를 먼저 세운다.** 광고 마스터를 막 만들고 고르러 오는 길이다.
 */
export interface AdSourceItem {
  id: string;
  title: string;
  /** 라우트가 어느 표를 읽을지 정한다. */
  source: "library" | "poster";
}

export function adSourceItems(
  library: LibraryItem[],
  posters: Array<{ id: string; title: string; status: string; images?: unknown[] }>,
): AdSourceItem[] {
  const fromPoster = posters
    // **결과가 없는 것은 안 보여 준다.** 만드는 중이거나 실패한 작업을 고르면
    // 「뽑지 못했습니다」만 돌아온다 — 왜 안 되는지 알 길이 없다.
    .filter((project) => (project.images?.length ?? 0) > 0)
    .map((project) => ({
      id: project.id,
      title: project.title || "제목 없음",
      source: "poster" as const,
    }));

  const fromLibrary = exportableItems(library).map((item) => ({
    id: item.id,
    title: item.title || "제목 없음",
    source: "library" as const,
  }));

  return [...fromPoster, ...fromLibrary];
}

/**
 * 미리보기 한 장 — **어느 그림인지와 어떻게 부를지를 함께 든다.**
 *
 * **초판은 배열 번호를 서버에 보냈다.** 서버는 그것을 `variantIndex` 로 읽는데,
 * `variantIndex` 는 배치마다 0 부터 다시 시작하므로(`generate.ts:174`) 한 작업
 * 안에서 번호가 겹친다 — 「고치기」나 재생성 한 번이면 그렇다. 그러면 사용자가
 * A 를 보고 골랐는데 **ZIP 에는 B 가 담긴다.** 「사람 눈이 의도 검증이다」(§5.2)가
 * 통째로 헛돈다.
 *
 * 3-0 에서 같은 사실(번호가 겹친다)을 **저장 경로 충돌**로만 봤다. 같은 사실의
 * 다른 얼굴을 못 봤다.
 */
export interface AdImagePick {
  /** 화면에 그릴 주소. */
  image: string;
  sectionName: string;
  /** 서버에 보낼 값. **배열 번호가 아니다.** */
  position: number;
}

/**
 * 포스터 작업의 그림들.
 *
 * **겹친 변형 번호는 하나로 접는다.** 안 접으면 같은 그림이 두 번 뜨고 React
 * key 도 겹친다.
 */
export function posterImagePicks(
  projectId: string,
  images: Array<{ variantIndex: number }>,
): AdImagePick[] {
  const seen = new Set<number>();
  const picks: AdImagePick[] = [];
  for (const image of images) {
    if (seen.has(image.variantIndex)) continue;
    seen.add(image.variantIndex);
    picks.push({
      image: `/api/poster/projects/${projectId}/images/${image.variantIndex}/file`,
      sectionName: `변형 ${image.variantIndex + 1}`,
      position: image.variantIndex,
    });
  }
  return picks;
}

/**
 * 라이브러리 작업의 그림들.
 *
 * 여기는 `/api/library` 가 `position` 을 채워 준다. 옛 응답에 없으면 배열
 * 번호로 떨어진다 — 지금까지의 동작이다.
 */
export function libraryImagePicks(
  images: Array<{ image: string; sectionName: string; position?: number }>,
): AdImagePick[] {
  return images.map((image, index) => ({
    image: image.image,
    sectionName: image.sectionName,
    position: image.position ?? index,
  }));
}

/**
 * ZIP 에 담을 것.
 *
 * **검증에 걸린 것은 빼고 담는다.** `batch.ts` 는 일부러 실패한 것도 바이트를
 * 함께 주는데(사람이 그림을 보고 판단해야 하므로), 그것을 그대로 묶으면
 * **포털이 반려할 파일이 정상 파일과 같은 이름으로 한 봉투에 들어간다.**
 * 설계 §8 의 「실패를 조용히 넘기지 않는다」가 화면의 빨간 글씨까지만 지켜지고
 * 내려받기에서 풀린다.
 */
export function downloadable<T extends { status: string; dataUrl?: string }>(results: T[]): T[] {
  return results.filter((entry) => entry.status === "ok" && entry.dataUrl);
}

/** 뽑히긴 했지만 검증에 걸려 봉투에서 빠지는 것. 화면이 그 수를 알린다. */
export function excludedCount<T extends { status: string; dataUrl?: string }>(results: T[]): number {
  return results.filter((entry) => entry.status !== "ok" && entry.dataUrl).length;
}

/**
 * 미리보기 한 칸의 최대 폭.
 *
 * **이 값이 「가독을 볼 수 있는가」를 정한다.**
 *
 * 설계 §5.2 는 「**실제 크기 비율로** 격자에 깔고」라고 적었다. 전부 같은 폭으로
 * 그리면 214×214 가 **확대**되어 실제보다 잘 읽히게 보인다 — 「글자가 읽히는지
 * 보세요」라고 적어 놓고 읽히는지 볼 수 없는 크기로 보여 주는 셈이다.
 *
 * 480 인 근거: **많이 줄인 규격이 1:1 로 들어가는 가장 작은 값**이다.
 *
 * 초판의 이 자리는 「경고가 붙는 셋은 456·376·214」라고 단정했는데 **틀렸다.**
 * 경고 대상은 `batch.ts:172` 가 **실제 올린 그림의 폭**으로 재기 때문에 원본마다
 * 달라진다 — 1200 폭에서는 214 하나뿐이고, 2048 폭에서는 300·456·376·214 넷이다.
 * 그 합집합에서 가장 넓은 것이 456 이고, 그것이 여기 들어간다.
 * 초판의 3열 격자는 칸이 약 306px 이라 456 이 축소돼 버렸다.
 */
export const PREVIEW_MAX_WIDTH = 480;

/** 셀보다 작은 규격은 1:1 로, 큰 규격은 셀에 맞춘다. **늘리지는 않는다.** */
export function previewWidth(target: { width: number }, cellWidth = PREVIEW_MAX_WIDTH): number {
  return Math.min(target.width, cellWidth);
}

/** 1:1 로 보이는가. 아니면 「실제보다 작게 보임」을 알려야 한다. */
export function isActualSize(target: { width: number }, cellWidth = PREVIEW_MAX_WIDTH): boolean {
  return target.width <= cellWidth;
}

/**
 * 실패를 사람이 읽을 말로 옮긴다.
 *
 * **비-JSON 응답을 삼키지 않는다.** 라우트는 두 곳에서 본문 없는 404 를 낸다 —
 * 기능이 꺼져 있을 때와 그림을 못 찾을 때. 화면이 `response.json()` 을
 * `catch(() => null)` 로 받으면 둘 다 「뽑지 못했습니다」로 뭉개져,
 * **왜 안 되는지 알 길이 없다.**
 *
 * 상태 코드마다 할 일이 다르므로 그것을 말해 준다 — 다시 누르면 되는지,
 * 다른 그림을 골라야 하는지, 사람을 불러야 하는지.
 */
export function failureMessage(status: number, message?: string | null): string {
  if (message) return message;
  if (status === 404) return "이 그림을 찾지 못했습니다. 다른 작업을 골라 주세요.";
  if (status === 401 || status === 403) return "로그인이 풀렸습니다. 다시 들어와 주세요.";
  if (status === 429) return "지금 서버가 붐빕니다. 잠시 뒤에 다시 눌러 주세요.";
  if (status >= 500) return "서버에서 뽑지 못했습니다. 잠시 뒤에 다시 눌러 주세요.";
  return "뽑지 못했습니다.";
}

/**
 * 필수인데 꺼져 있는 규격의 수.
 *
 * 설계 §9 원칙 1 은 두 절이다 — 「필수는 켜고 시작한다」와 **「끄면 알린다」**.
 * 앞 절만 있으면 사용자가 필수를 끄고 뽑아도 화면이 아무 말을 안 하고,
 * **포털이 반려하고 나서야 안다.**
 *
 * **못 뽑는 필수는 세지 않는다.** 그것은 사용자가 어쩔 수 없는 것이고, 그 자리에는
 * 이미 「아직 지원하지 않습니다」가 적혀 있다. 고칠 수 없는 것을 경고로 띄우면
 * 경고가 상시로 켜져 뜻을 잃는다.
 */
export function missingRequiredCount(rows: SpecRow[], picked: string[]): number {
  return rows.filter(
    (row) => row.supported && row.spec.required && !picked.includes(row.spec.id),
  ).length;
}
