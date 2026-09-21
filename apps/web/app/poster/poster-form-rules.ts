import { MATCH_SOURCE } from "@fixup/sns-core";
import type { AdMaster } from "../../lib/ad/specs";

/**
 * 만들기 화면의 판단들.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-c·3-d
 *
 * **컴포넌트 안에 두면 시험이 못 간다.** 이 저장소에는 jsdom 이 없고
 * `package.json` 을 건드리면 격리 계약이 깨진다(§4.1). 초판은 이 판단들이 전부
 * `new-client.tsx` 안에 있었고, 그래서 **뮤테이션 넷이 전부 통과했다** —
 * 계약 5 삭제 · 과금 전 차단 삭제 · 마스터 비율 뒤바꿈 · N장을 1장으로.
 *
 * **`server-only` 를 안 붙인다.** 화면과 시험 양쪽에서 읽는다.
 */

export type PosterSection = "mode-toggle" | "ratio" | "ad-specs";

/**
 * 규격 칸에 무엇을 그리는가.
 *
 * **스위치가 꺼져 있으면 예전 그대로다** — 비율 하나뿐이고 토글도 규격 목록도
 * 없다(계약 5). 광고와 무관한 포스터 사용자가 이 화면의 대부분이다.
 */
export function posterSpecSections(
  input: { adEnabled: boolean; adMode: boolean },
): PosterSection[] {
  if (!input.adEnabled) return ["ratio"];
  return input.adMode ? ["mode-toggle", "ad-specs"] : ["mode-toggle", "ratio"];
}

/**
 * 어떤 비율로 재는가.
 *
 * **가드가 보는 값과 본문에 싣는 값이 같아야 한다.** 초판은 가드를 화면 상태
 * (`"2:3"`)로 돌리고 본문에는 `match-source` 를 실었다. `match-source` 는
 * `pixelOnly` 라 `gpt-image-2` 로만 되는데, 화면은 `"2:3"` 로 재서 nano 계열도
 * 통과시켰다 — **모델 넷 중 셋에서 광고 모드가 죽어 있었고**, 사용자는 광고와
 * 아무 상관 없어 보이는 「첨부한 비율을 그대로 쓰려면…」만 봤다.
 */
export function effectiveRatio(adMode: boolean, ratio: string): string {
  return adMode ? MATCH_SOURCE : ratio;
}

/**
 * 프로젝트를 몇 개 만드는가. **비용에 이 수를 곱해야 한다.**
 *
 * 광고 모드의 한 번 클릭은 마스터마다 프로젝트를 만든다(설계 3-0). 안 곱하면
 * 「만들 그림 2장」 바로 아래에서 한 장 값을 보여 주게 된다 — §9 원칙 2 가
 * 「10배 과금을 걱정하지 않게 하려고」 넣은 자리에서 **실제보다 낮은 금액**을
 * 보여 주는 셈이다.
 *
 * 아직 만들 것이 없어도 1 을 준다 — 0 을 곱해 「무료」로 보이면 안 된다.
 */
export function projectCount(adMode: boolean, masterCount: number): number {
  return adMode ? Math.max(1, masterCount) : 1;
}

/**
 * 만들기를 누를 수 있는가.
 *
 * **§4.4 의 「생성 전에 막는다」가 여기서 버튼에 닿는다.** `adSubmitPlan` 이
 * `ready: false` 를 돌려주는 것만으로는 아무것도 안 막힌다.
 */
export function canCreatePoster(input: {
  styleCount: number;
  instruction: string;
  estimateRejected: boolean;
  overReferenceLimit: boolean;
  adMode: boolean;
  adReady: boolean;
}): boolean {
  /*
   * **글만으로도 만들 수 있다.**
   *
   * 예전에는 `styleCount <= 0` 이면 무조건 막았다. 「따라 만들 그림」이 첫
   * 단계라 글만 들고 온 사람은 시작조차 못 했다(2026-09-16 사용자 보고).
   *
   * 엔진은 진작부터 할 줄 알았다 — `pickEndpoint` 가 첨부 유무로 t2i·i2i 를
   * 갈라 부르고, 값도 `poster-core/pricing.ts` 가 모드별로 따로 잡고, 프롬프트도
   * `if (!images.length) return []` 로 첨부 블록을 비워 보낸다. 막고 있던 것은
   * 이 줄과 `PosterProjectInputSchema` 둘뿐이었다.
   *
   * **광고 모드만 예외다.** 비율을 `match-source` 로 보내 첨부한 그림의 크기를
   * 그대로 따라가는데(`effectiveRatio`), 맞출 원본이 없으면 성립하지 않는다.
   */
  if (input.adMode && input.styleCount <= 0) return false;
  if (input.instruction.trim().length === 0) return false;
  if (input.estimateRejected || input.overReferenceLimit) return false;
  return !input.adMode || input.adReady;
}

/**
 * 광고 모드가 보낼 요청 본문들.
 *
 * **마스터마다 하나씩이다**(설계 3-0). 한 프로젝트에 둘을 넣으면 저장 경로가
 * 겹쳐 두 번째가 첫 번째를 덮고, `poster_images_one_selected` 때문에 둘 다 고를
 * 수도 없다.
 *
 * 제목에 크기를 붙인다 — 안 그러면 라이브러리에서 어느 것이 어느 규격인지
 * 구분할 수 없다.
 */
export function adProjectBodies<T extends object>(
  base: T,
  masters: AdMaster[],
  title: string,
): Array<T & { ratio: string; adMasterId: string; title: string }> {
  const name = title.trim() || "이름 없는 이미지";
  return masters.map((master) => ({
    ...base,
    ratio: MATCH_SOURCE,
    adMasterId: master.id,
    title: `${name} (${master.width}×${master.height})`,
  }));
}

/**
 * 그림이 도착할 자리가 잡을 모양.
 *
 * 그리는 동안 결과 자리에 빈 칸을 깔아 두는데, **모양이 다르면 그림이 도착할 때
 * 화면이 튄다.** 몇 대 몇으로 나오는지도 거짓말이 된다.
 *
 * `match-source` 는 첨부한 그림을 따라가므로 여기서는 알 수 없다. 그때와
 * 알아볼 수 없는 값에는 포스터의 기본 비율을 쓴다 — 모양이 좀 다른 편이
 * 화면이 죽는 것보다 낫다.
 */
export function placeholderRatio(ratio: string): string {
  const parts = ratio.split(":");
  if (parts.length !== 2) return "2 / 3";
  const [width, height] = parts.map(Number);
  const usable = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  return usable ? `${width} / ${height}` : "2 / 3";
}

/**
 * 기획 확인에서 어떤 칸을 바로 보여줄까.
 *
 * **칸을 없애지도, 다 보여주지도 않는다**(2026-09-08 사용자 결정).
 *
 * 칸 열한 개가 늘 다 보였다. 글자가 하나도 없는 그림인데 「글자와 피사체의
 * 관계」가 버젓이 있었고, 그 화면 하나가 페이지를 통째로 썼다.
 *
 * 기준은 하나다 — **기획이 값을 넣은 칸이 이 그림에 필요한 칸이다.** 빈 칸은
 * 접어 둔다. 없애지는 않는다: 없으면 사용자가 고를 방법도 사라진다.
 */
export function splitFilledSlots<T extends string>(
  fields: T[],
  valueOf: (field: T) => string,
): { filled: T[]; empty: T[] } {
  const filled: T[] = [];
  const empty: T[] = [];
  for (const field of fields) (valueOf(field).trim() ? filled : empty).push(field);
  return { filled, empty };
}

export interface PlanSlotRow<T extends string> {
  field: T;
  /** 값이 없는 칸. 화면은 자리를 옮기지 말고 **모양으로** 가른다. */
  empty: boolean;
}

/**
 * 기획 확인 패널에 그릴 칸 목록.
 *
 * **차례는 언제나 `fields` 그대로다**(2026-09-17 사용자 보고). 채운 칸을 위로
 * 모아 두었더니 빈 칸에 한 글자를 넣는 순간 그 칸이 위로 올라갔고, 커서가
 * 빠져 이어서 칠 수가 없었다. 채웠는지 안 채웠는지는 `empty` 로 알려 주고,
 * 가르는 일은 자리가 아니라 모양에 맡긴다.
 *
 * `keep` 은 **한 번 보인 칸**이다. 지우는 도중에 칸이 사라지면 같은 일이
 * 거꾸로 일어난다 — 글자를 다 지운 순간 칸이 없어져 다시 쓸 수가 없다.
 */
export function planSlotRows<T extends string>(
  fields: T[],
  valueOf: (field: T) => string,
  options: { showEmpty: boolean; keep?: Iterable<T> },
): PlanSlotRow<T>[] {
  const keep = new Set(options.keep ?? []);
  return fields
    .map((field) => ({ field, empty: !valueOf(field).trim() }))
    .filter((row) => options.showEmpty || !row.empty || keep.has(row.field));
}

/**
 * 「글자와 피사체의 관계」를 보여줄까.
 *
 * **글자가 없으면 관계도 없다.** 이건 판단이 아니라 규칙이다 — 헤드라인·받침
 * 문구·곁텍스트가 전부 비었으면 관계를 고를 대상 자체가 없다.
 *
 * 이미 고른 값이 있으면 보여준다. 안 그러면 글자를 지우는 순간 고른 값이
 * 화면에서 사라져 되돌릴 방법이 없어진다.
 */
export function showsTypeInteraction(slots: {
  headline?: string | null;
  subline?: string | null;
  sideTexts?: string[] | null;
  typeInteraction?: string | null;
}): boolean {
  if (slots.typeInteraction) return true;
  const hasText = [slots.headline, slots.subline, ...(slots.sideTexts ?? [])]
    .some((value) => (value ?? "").trim().length > 0);
  return hasText;
}
