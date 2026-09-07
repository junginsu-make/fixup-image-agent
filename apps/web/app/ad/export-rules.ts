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
