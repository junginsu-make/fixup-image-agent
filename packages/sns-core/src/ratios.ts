import type { ImageModel } from "./models";

export interface RatioSpec {
  id: string;
  label: string;
  pixel: { width: number; height: number };
  /**
   * 열거 모델(nano 계열)이 이 비율을 그대로 못 받을 때 대신 쓸 값.
   * 최근접 계산에 맡기지 않고 못 박는다 — 같은 입력에 같은 결과가 나와야 한다.
   */
  enumFallback?: string;
  /** 픽셀을 직접 지정하는 모델에서만 만들 수 있다. */
  pixelOnly?: { reason: string };
}

/** 네 비율 모두 nano 11종 목록에 있어 대체가 일어나지 않는다. */
export const CARD_RATIOS: RatioSpec[] = [
  { id: "4:5",  label: "인스타그램 피드 4:5",   pixel: { width: 1088, height: 1360 } },
  { id: "1:1",  label: "정사각형 1:1",      pixel: { width: 1088, height: 1088 } },
  { id: "9:16", label: "스토리·릴스 9:16",  pixel: { width: 1152, height: 2048 } },
  { id: "16:9", label: "가로 16:9",         pixel: { width: 2048, height: 1152 } },
];

/**
 * 포스터는 인쇄를 염두에 두므로 카드뉴스보다 목록이 넓다.
 *
 * A4 를 둘로 나눈 이유: 1088×1536 은 A4 **비율**은 맞지만 실제 용지에 인쇄하면
 * 약 131dpi 다. 화면 시안에는 충분해도 인쇄물이라고 부르면 오해를 만든다.
 */
/**
 * ## 2026-09-23 — 세로 비율 셋을 키웠다 (4:5 · 2:3 · 3:4)
 *
 * **까닭은 광고다.** 「광고 규격으로 내보내기」는 새로 그리지 않고 이미 만든
 * 그림에서 잘라 뽑는데, 재료가 목표보다 작으면 거부한다(확대 금지,
 * `apps/web/lib/ad/export.ts:91`). 광고 필수 규격의 짧은 변이 1200 이라
 * **짧은 변을 1200 이상으로** 올렸다. 사용자는 광고를 염두에 두고 그림을
 * 만들지 않으므로, 인스타용으로 만들어 둔 그림도 나중에 광고로 쓸 수 있어야
 * 한다 — 안 그러면 같은 그림에 돈을 두 번 낸다.
 *
 * **비율은 한 자리도 안 틀어졌다.** 넷 다 16의 배수이고 원래 비율과 정확히
 * 같다(오차 0). `pixelSizeLimits` 다섯 항목은 `ratios.test.ts:71-82` 가 전수
 * 검사한다.
 *
 * **값이 안 오른다.** `pickRow` 가 비율로 행을 고르므로 매칭 행이 그대로이고
 * (`models.ts:248`), 늘어난 픽셀 수가 `priceCoverage` 의 2배 절벽과 크레딧 2배
 * 경계(6,000,000)에 둘 다 못 미친다. 실측으로 확인했다.
 *
 * **안 바꾼 것 셋과 그 까닭:**
 *   - `16:9` — 키우면 단가 행이 `1920×1080` 에서 `2560×1440` 으로 넘어가 값이
 *     40~48% 오른다. 얻는 것은 가로로 긴 그림에서 정사각을 뽑는 일뿐인데 그건
 *     양옆을 크게 버리는 짓이다
 *   - `a4-draft` — 1200 을 넘기려면 150dpi 선을 넘는데, 그 선이 「이것은
 *     인쇄물이 아니다」를 뜻한다(아래 주석, `ratios.test.ts:88`). A4 비율은
 *     광고 규격에 하나도 없어 넘길 이유도 없다
 *
 * **`9:16` 은 한 번 빼려다 되돌렸다.** 「리디자인이 이 크기를 하드코딩해서
 * 장부와 갈린다」가 사유였는데 **틀렸다.** 리디자인이 부르는
 * `resolveSize`(`:131`)는 `CARD_RATIOS` 를 읽는다 — 이 목록이 아니다. 사유가
 * 틀린 채로 두면 다음 사람이 「사본을 정리한 뒤 올려라」를 따라가다
 * **`CARD_RATIOS` 를 건드리게 된다.** 그쪽이야말로 카드뉴스 레이아웃과
 * 레터박스 경고가 걸린 위험한 자리다. 리디자인의 하드코딩은 실제 결함이지만
 * (`apps/web/app/api/redesign/generate/route.ts:51`), 이 목록과는 무관하다.
 *
 * 설계: `docs/superpowers/specs/2026-09-23-ad-source-size-design.md`
 * 검증: `apps/web/lib/__tests__/ad-source-coverage.test.ts`
 */
export const POSTER_RATIOS: RatioSpec[] = [
  { id: "4:5",  label: "인스타그램 피드 4:5",      pixel: { width: 1216, height: 1520 } },
  /**
   * **이것 하나가 광고 필수 규격 셋을 막고 있었다.** 구글·카카오·네이버의
   * 정사각 규격이 모두 1200×1200 인데 재료가 1088 이라, 112픽셀이 모자라
   * **어떤 그림으로도 안 나왔다.**
   *
   * **카드뉴스(`CARD_RATIOS`)의 1:1 은 따라 바꾸지 않았다.** 그쪽은 슬롯
   * 레이아웃과 레터박스 확대 경고(`letterbox.ts:14`)가 크기에 얽혀 있어 판단이
   * 따로 필요하다. 광고 소재의 재료는 이미지 만들기 쪽이다.
   */
  { id: "1:1",  label: "정사각형 1:1",         pixel: { width: 1200, height: 1200 } },
  { id: "9:16", label: "스토리·릴스 9:16",     pixel: { width: 1296, height: 2304 } },
  { id: "2:3",  label: "포스터 세로 2:3",      pixel: { width: 1216, height: 1824 } },
  { id: "3:4",  label: "포스터 세로(넓은) 3:4", pixel: { width: 1200, height: 1600 } },
  { id: "16:9", label: "가로 배너 16:9",       pixel: { width: 2048, height: 1152 } },
  {
    id: "a4-draft",
    label: "A4 비율 시안",
    pixel: { width: 1088, height: 1536 },
    // 3:4(1.333)와 2:3(1.5)은 목표 1.414 에서 거리가 0.081 대 0.086 으로 6% 차이뿐이다.
    // 더 짧은 쪽이라 인쇄할 때 여백으로 처리하기 쉬워 3:4 로 못 박는다.
    enumFallback: "3:4",
  },
  {
    id: "a4-print",
    label: "A4 인쇄용 (약 290dpi)",
    pixel: { width: 2400, height: 3392 },
    pixelOnly: { reason: "A4 인쇄용은 픽셀을 직접 지정해야 해서 정밀형 계열로만 만들 수 있습니다." },
  },
  {
    // 실제 크기는 첨부한 그림을 보고 그때 정한다. 여기 픽셀은 자리를 채우는 값이다.
    id: "match-source",
    label: "첨부한 그림과 같은 비율",
    pixel: { width: 1088, height: 1088 },
    pixelOnly: { reason: "첨부한 비율을 그대로 쓰려면 픽셀을 직접 지정해야 해서 정밀형 계열로만 만들 수 있습니다." },
  },
];

export interface ResolvedSize {
  mode: "pixel" | "enum";
  pixel?: { width: number; height: number };
  aspectRatio?: string;
  resolution?: string;
  rejected?: string;
}

function resolveFrom(ratios: RatioSpec[], ratioId: string, model: ImageModel): ResolvedSize {
  const ratio = ratios.find((entry) => entry.id === ratioId);
  if (!ratio) return { mode: "pixel", rejected: `모르는 비율입니다: ${ratioId}` };

  if (model.pixelSizeLimits) return { mode: "pixel", pixel: ratio.pixel };

  if (ratio.pixelOnly) return { mode: "enum", rejected: ratio.pixelOnly.reason };

  const aspectRatio = ratio.enumFallback ?? ratio.id;
  if (!model.supportedRatios?.includes(aspectRatio)) {
    return { mode: "enum", rejected: `${model.label} 은 ${aspectRatio} 를 지원하지 않습니다.` };
  }
  return {
    mode: "enum",
    aspectRatio,
    ...(model.fixedResolution ? { resolution: model.fixedResolution } : {}),
  };
}

/** 카드뉴스. 네 비율만 안다. */
export function resolveSize(ratioId: string, model: ImageModel): ResolvedSize {
  return resolveFrom(CARD_RATIOS, ratioId, model);
}

/** 포스터. 인쇄 규격까지 안다. */
export function resolvePosterSize(ratioId: string, model: ImageModel): ResolvedSize {
  return resolveFrom(POSTER_RATIOS, ratioId, model);
}
