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
    /**
     * **조립을 빠뜨리면 필수 규격이 조용히 죽는다.**
     *
     * `derive.ts` 에 갈래를 더해도 이 줄이 모르면 화면이 계속 「아직 지원하지
     * 않습니다」로 그리고, 아래 `defaultSelection` 이 `supported` 로 거르므로
     * **필수인데 기본 선택에서 빠진다.** 판단을 순수 함수로 뽑아 놓고 그것을
     * 부르는 줄을 안 잠그는 일이 이 프로젝트에서 **네 번 반복됐다.**
     */
    const supported = decided.kind === "resize"
      || decided.kind === "crop"
      || decided.kind === "assemble";
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
  /**
   * 목록에 그릴 작은 그림.
   *
   * **글자만으로는 못 고른다.** 광고 모드는 한 번 누를 때 마스터마다 프로젝트를
   * 만들어 작업이 배로 쌓이고, 제목도 「가을 사진전 (1200×1200)」처럼 길어진다.
   * 이 저장소는 그림 고르는 자리를 전부 썸네일 격자로 만든다
   * (`_components/library-picker.tsx`).
   *
   * 없을 수 있다 — 옛 작업에는 사본이 없다. 화면이 자리표시를 그린다.
   */
  thumbnail?: string;
}

export function adSourceItems(
  library: LibraryItem[],
  posters: Array<{ id: string; title: string; status: string; images?: Array<{ variantIndex: number }> }>,
): AdSourceItem[] {
  const fromPoster = posters
    // **결과가 없는 것은 안 보여 준다.** 만드는 중이거나 실패한 작업을 고르면
    // 「뽑지 못했습니다」만 돌아온다 — 왜 안 되는지 알 길이 없다.
    .filter((project) => (project.images?.length ?? 0) > 0)
    .map((project) => {
      // 첫 변형의 사본을 쓴다. 원본은 2MB 를 넘어 목록에 깔 수 없다.
      const first = project.images?.[0] as { variantIndex: number } | undefined;
      return {
        id: project.id,
        title: project.title || "제목 없음",
        source: "poster" as const,
        ...(first
          ? { thumbnail: `/api/poster/projects/${project.id}/images/${first.variantIndex}/file?size=thumb` }
          : {}),
      };
    });

  const fromLibrary = exportableItems(library).map((item) => ({
    id: item.id,
    title: item.title || "제목 없음",
    source: "library" as const,
    ...(item.thumbnail ? { thumbnail: item.thumbnail } : {}),
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
 *
 * **접어도 잃는 그림이 없다.** `assetPath` 가 `(userId, projectId, variantIndex)`
 * 의 순수 함수이고(`supabase-store-core.ts` 의 `posterAssetPath`) 그것을 쓰는
 * 곳이 저장 한 군데뿐이라, **같은 번호의 행은 반드시 같은 파일을 가리킨다** —
 * 겹친 행은 이미 서로의 파일을 덮어쓴 뒤다(설계 §10 3-0).
 *
 * **그 불변식이 여기를 떠받친다.** `byProject` 의 동점 정렬은 보장되지 않아
 * 미리보기와 내보내기가 서로 다른 **행**을 집을 수 있는데, 같은 파일을
 * 가리키므로 결과가 같다. `assetPath` 규칙을 바꾸면 여기가 먼저 깨진다.
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
 * 잘라서 만든 규격인가 — 그렇다면 그렇다고 말한다.
 *
 * **크롭은 구도를 버린다.** 2048×1072 마스터에서 456×304(1.5:1)를 뽑으면 좌우가
 * 잘려 헤드라인 한쪽이 사라진다. 화면이 그 사실을 안 적으면 사용자는 **그림이
 * 깨진 줄 안다** — 실제로 그런 보고를 받았다.
 *
 * 설계 §11 은 「크롭하는 셋이 구도를 버린다 → 미리보기로 사람이 본다」고
 * 적었는데, 보여 주기만 하고 **무엇을 보라고는 안 했다.**
 */
export function cropNotice(
  specId: string,
  plan: (spec: AdSpec) => { kind: string },
): string | undefined {
  const spec = AD_SPECS.find((entry) => entry.id === specId);
  if (!spec) return undefined;
  return plan(spec).kind === "crop"
    ? "비율이 달라 좌우를 잘랐습니다 — 주인공이 남았는지 보세요"
    : undefined;
}

/**
 * 미리보기 칸의 바탕.
 *
 * **투명 배너를 회색 판 위에 그리면 투명한지 회색인지 알 수 없다**(설계 §6.3).
 * 이 기능의 존재 이유가 투명인데, 「사람 눈이 의도 검증이다」(§5.2)가 그 한
 * 가지에 대해서만 작동하지 않는다. 다크 모드에서는 어두운 오브젝트가 배경에
 * 묻히기까지 한다.
 *
 * 그래서 투명 규격에만 **체크무늬**를 깐다 — 그림 편집기가 쓰는 그 표시다.
 */
export function previewBackdrop(format: AdSpec["format"]): React.CSSProperties {
  if (format !== "png-alpha") return {};
  // 사각형 색은 **판 색과 달라야 한다.** 칸이 `bg-muted` 를 달고 있으므로
  // 여기서 `var(--muted)` 를 쓰면 무늬와 판이 같은 값이라 **결과가 단색**이다
  // — CSS 는 멀쩡하고 화면만 고치기 전과 똑같다. 밝기 차를 만들되 라이트·다크
  // 양쪽을 따로 적지 않으려고, 저장소가 이미 쓰는 `color-mix` 로 앞색을 섞는다
  // (`safeAreaOverlayStyle`, `create-theme.css`).
  const square = "color-mix(in srgb, var(--muted-foreground) 22%, transparent)";
  return {
    backgroundImage:
      `linear-gradient(45deg, ${square} 25%, transparent 25%),`
      + ` linear-gradient(-45deg, ${square} 25%, transparent 25%),`
      + ` linear-gradient(45deg, transparent 75%, ${square} 75%),`
      + ` linear-gradient(-45deg, transparent 75%, ${square} 75%)`,
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  };
}

/** 규격 칸의 상태 — 어떤 포털을 켰고 어떤 규격을 골랐는가. */
export interface PortalSelection {
  portals: AdSpec["portal"][];
  picked: string[];
}

/**
 * 포털 하나를 켜고 끈다. **포털과 선택을 한 번에 판단한다.**
 *
 * 초판은 화면이 `setPortals` 의 **업데이터 안에서** `setPicked` 를 불렀다.
 * 업데이터는 순수해야 하는데 그렇지 않아, React 가 두 번 돌리는 순간 고른
 * 규격이 겹쳐 쌓였다 — 화면에는 「10개 고름」인데 켜진 체크박스는 다섯이었다.
 * **브라우저로 보지 않았으면 못 찾았다**(시험 1,213개가 전부 초록이었다).
 *
 * 여기로 옮기면 화면은 결과를 받아 넣기만 하고, 두 번 불러도 같은 값이다.
 */
export function togglePortal(
  rows: SpecRow[],
  state: PortalSelection,
  portal: AdSpec["portal"],
): PortalSelection {
  const on = state.portals.includes(portal);
  const portals = on
    ? state.portals.filter((entry) => entry !== portal)
    : [...state.portals, portal];
  const picked = on
    ? keepPickedInPortals(state.picked, portals)
    // `Set` 으로 접는다 — 이미 켜 둔 것을 두 번 넣지 않는다.
    : [...new Set([...state.picked, ...selectionForPortals(rows, [portal])])];
  return { portals, picked };
}

/**
 * 결과 화면에서 넘어온 주소가 가리키는 그림.
 *
 * 설계: `2026-09-08-ad-portal-first-selection.md` §1 ②
 *
 * **못 찾으면 조용히 없음을 준다.** 남의 작업 id 나 지워진 id 가 들어와도
 * 화면은 지금처럼 목록을 보여 주면 된다 — 소유권은 서버가 이미 막는다
 * (`posterStoresForUser`). 여기서 오류를 내면 **화면이 안 열린다.**
 *
 * **표 이름까지 맞춘다.** 라이브러리와 포스터는 서로 다른 표라 id 가 겹칠 수
 * 있고, 겹치면 **엉뚱한 그림을 고른 채로** 뽑기 버튼이 활성화된다.
 */
export function itemFromQuery(
  items: AdSourceItem[],
  query: { source: string | null; id: string | null },
): AdSourceItem | null {
  if (!query.id || (query.source !== "poster" && query.source !== "library")) return null;
  return items.find((item) => item.source === query.source && item.id === query.id) ?? null;
}

/**
 * 주소에 적힌 변형 번호.
 *
 * **이상한 값에 0 을 주지 않는다.** 0 은 실재하는 변형이라, 조용히 **다른
 * 그림이 뽑힌다** — 「사람 눈이 의도 검증이다」가 헛돈다. 없음을 주면 화면이
 * 지금처럼 첫 장을 고르되 그것은 사용자가 보고 있는 값이다.
 */
export function positionFromQuery(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * 처음에 고를 변형의 **서버 번호**.
 *
 * 주소가 가리킨 것이 실재하면 그것, 아니면 첫 장. **없는 번호를 그대로 쓰지
 * 않는다** — 아무것도 선택돼 보이지 않는 채로 뽑기 버튼이 켜지고, 사용자가
 * 본 적 없는 번호가 서버로 간다.
 */
export function startingPosition(picks: AdImagePick[], preferred: number | null): number {
  if (preferred !== null && picks.some((pick) => pick.position === preferred)) return preferred;
  return picks[0]?.position ?? 0;
}

/**
 * 화면에 그릴 포털 차례. **데이터에서 나온다** — 목록에 없는 포털은 안 생긴다.
 */
export const AD_PORTALS: AdSpec["portal"][] = ["google", "kakao", "naver"];

/**
 * 고른 포털의 규격만 남긴다.
 *
 * 설계: `2026-09-08-ad-portal-first-selection.md` §1 ③
 *
 * **처음에 아무것도 안 고른 상태가 기본이다.** 지금은 `/ad` 를 열면 필수 9개가
 * 세 포털에 걸쳐 켜져 있어서, 한 포털만 쓰는 사람에게는 「안 쓸 것까지 이미
 * 켜진」 화면이 된다 — 그것이 「무조건 리사이징된다」로 읽힌다.
 *
 * 원래 순서를 지킨다. 고를 때마다 차례가 바뀌면 눈이 자리를 잃는다.
 */
export function rowsForPortals(rows: SpecRow[], portals: AdSpec["portal"][]): SpecRow[] {
  // 빈 목록에 이른 반환을 두지 않는다 — 빈 `Set` 으로 거르면 결과가 같아서,
  // 그 줄은 지워도 시험이 안 깨진다(뮤테이션이 살아남았다). 안 도는 방어는
  // 다음 사람이 있다고 믿는다.
  const wanted = new Set(portals);
  return rows.filter((row) => wanted.has(row.spec.portal));
}

/**
 * 포털을 켰을 때 자동으로 켜 줄 규격.
 *
 * **그 포털의 필수만.** 카카오를 켰는데 구글 필수가 딸려 오면 그게 「무조건」이다.
 * 못 뽑는 것은 필수여도 안 켠다 — 켜 두면 뽑기가 통째로 막힌다(`adSubmitPlan`).
 */
export function selectionForPortals(rows: SpecRow[], portals: AdSpec["portal"][]): string[] {
  return rowsForPortals(rows, portals)
    .filter((row) => row.supported && row.spec.required)
    .map((row) => row.spec.id);
}

/**
 * 포털을 껐을 때 남길 선택.
 *
 * **손으로 켠 비필수도 그 포털이면 남긴다** — 껐다 켜는 사이에 사용자가 고른
 * 것을 뺏지 않는다. 모르는 id 는 버린다.
 */
export function keepPickedInPortals(picked: string[], portals: AdSpec["portal"][]): string[] {
  const wanted = new Set(portals);
  return picked.filter((specId) => {
    const spec = AD_SPECS.find((entry) => entry.id === specId);
    return spec !== undefined && wanted.has(spec.portal);
  });
}

/**
 * 고른 규격에서 **사용자가 이후에 해야 할 일**을 뽑는다.
 *
 * 사용자 요청(2026-09-08): 「로고와 같은 사용자가 반드시 알아야 하거나 이후
 * 작업을 해야 할 부분이 있다면 해당 섹션에서 안내 메시지를 보여주세요.」
 *
 * **줄마다 붙는 경고와 다른 것이다.** 크롭·축소·작음 경고는 「이 결과물을
 * 보세요」이고, 여기 있는 셋은 **화면 밖에서 할 일**이다 — 로고를 올리고,
 * 광고 관리자에서 문구를 넣고, 포털 문서로 수치를 확인하는 일.
 *
 * **고른 것에서만 나온다.** 항상 뜨는 안내는 벽지가 되어 아무도 안 읽는다.
 *
 * 순수하다. 두 화면이 같은 말을 하도록 여기 한 곳에 둔다 — 만들기 화면의
 * 규격 칸과 `/ad` 의 규격 칸이 서로 다른 안내를 하면 그게 더 나쁘다.
 */
export interface AdNotice {
  /** 겹침을 막는 열쇠. 화면이 `key` 로 그린다. */
  key: "upload" | "assemble" | "reference";
  title: string;
  body: string;
}

export function actionNotices(
  specIds: string[],
  plan: (spec: AdSpec) => { kind: string },
): AdNotice[] {
  const picked = specIds
    .map((specId) => AD_SPECS.find((spec) => spec.id === specId))
    .filter((spec): spec is AdSpec => spec !== undefined);

  const notices: AdNotice[] = [];

  /**
   * **고른 규격이 아니라 「고른 상품」으로 판단한다.**
   *
   * 로고 줄은 두 화면에서 `disabled` 다(`specRows` 의 `supported === false`).
   * 그래서 「로고를 골랐으면」으로 조건을 걸면 **그 안내는 영원히 안 뜬다** —
   * 판단을 순수 함수로 뽑아 놓고 부르는 줄이 도달 불가인, 이 프로젝트에서
   * 여러 번 반복된 그 모양이다.
   *
   * 같은 상품(포털+상품)에 올려야 하는 규격이 하나라도 있으면 말한다. 구글
   * 반응형 디스플레이를 만드는 사람은 로고 자리가 있다는 것을 알아야 한다.
   */
  const uploadKinds = AD_SPECS.filter((spec) => spec.supply === "upload");
  const needsUpload = uploadKinds.filter((logo) => picked.some((spec) =>
    spec.portal === logo.portal && spec.product === logo.product));
  if (needsUpload.length > 0) {
    const labels = needsUpload.map((spec) => spec.label).join(", ");
    notices.push({
      key: "upload",
      title: "로고는 직접 올려야 합니다",
      body: `이 상품에는 ${labels} 규격이 따로 있는데 여기서는 만들지 않습니다.`
        + " 브랜드 로고를 모델이 지어내면 매번 다른 로고가 되기 때문입니다."
        + " 가지고 계신 로고 파일을 광고 관리자에 그대로 올리세요.",
    });
  }

  /**
   * **배경을 지우면 글자도 지워진다**(설계 §1.5 실측 — 헤드라인·본문·배지·바닥
   * 띠가 전부 사라졌다). 조립 규격은 오브젝트만 남는다.
   *
   * 이것을 안 적으면 사용자는 **문구가 빠진 것을 고장으로 읽는다.** 문구를
   * 우리가 그려 넣는 일은 아직 안 했다 — 그때까지는 말이라도 해야 한다.
   */
  const assembled = picked.filter((spec) => plan(spec).kind === "assemble");
  if (assembled.length > 0) {
    /**
     * **어느 관리자인지 이름을 대 준다.** 「광고 관리자에서 넣으세요」만으로는
     * 카카오를 만드는 사람이 네이버 얘기인지 헷갈린다. 고른 규격에서 그대로
     * 뽑으므로 없는 메뉴를 지어내지 않는다.
     */
    const where = [...new Set(assembled.map((spec) =>
      `${PORTAL_LABEL[spec.portal]} ${spec.product}`))].join(" · ");
    notices.push({
      key: "assemble",
      title: "투명 배너에는 글자가 없습니다 — 관리자에서 직접 입력하세요",
      body: `${where} 광고 관리자에서 소재를 등록할 때 문구를 직접 입력하세요.`
        + " 이 규격은 모델이 만들 수 없는 비율이라 배경을 지운 그림만 얹어"
        + " 만드는데, 배경을 지울 때 글자도 함께 지워집니다. 그림은 그대로"
        + " 쓰시고 문구만 넣으면 됩니다.",
    });
  }

  if (picked.some((spec) => spec.sourceKind === "reference")) {
    notices.push({
      key: "reference",
      title: "「참고」 규격은 공식 문서로 다시 확인하세요",
      body: "「참고」가 붙은 규격의 수치는 포털 공식 문서가 아니라 참고 자료에서"
        + " 가져왔습니다. 집행 전에 광고 관리자에서 한 번 확인하세요.",
    });
  }

  return notices;
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
