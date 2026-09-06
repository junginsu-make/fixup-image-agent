import { describe, expect, it } from "vitest";
import { IMAGE_MODELS } from "../models";
import { CARD_RATIOS, POSTER_RATIOS } from "../ratios";

/**
 * 광고 소재 기능이 기존 시스템을 건드리지 않았음을 지키는 자물쇠.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §4.1 계약 2·3
 *
 * **광고 기능 코드가 하나도 없는 지금 넣는다.** 나중에 넣으면 이미 바뀐 값을
 * 고정하게 되어, 자물쇠가 아니라 사후 승인이 된다.
 *
 * ## 왜 기존 시험으로는 모자란가 — 뮤테이션으로 실측했다
 *
 * 기존 시험(`ratios.test.ts`·`models.test.ts`·`model-choice.test.ts`)에
 * 변경을 하나씩 넣어 무엇을 잡고 무엇을 놓치는지 확인했다.
 *
 * **이 파일이 없어도 지켜지는 값** (배열을 통째로 맞대므로 결과적으로 여기서도
 * 걸리지만, 이 파일이 존재하는 근거는 아니다):
 *   - `CARD_RATIOS` 의 `4:5` 픽셀 (`ratios.test.ts:26` 의 `resolveSize`)
 *   - `POSTER_RATIOS` 의 `2:3` 픽셀 (`ratios.test.ts:120`)
 *   - `POSTER_RATIOS` 에 항목 추가, `multipleOf`, `maxReferenceImages`
 *   - **`nano-banana-2` 의 `4:1`·`1:4`** —
 *     `apps/web/lib/studio/__tests__/model-choice.test.ts:26-31` 이 `4:1` 을 이름으로
 *     짚는다. **저장소 전체를 돌려야 보인다** — sns-core 만 돌리면 안 보인다.
 *     (함정: `model-choice.test.ts` 라는 같은 이름이 `packages/sns-core` 와
 *     `apps/web/lib/studio` 양쪽에 있다. 인용할 때 패키지까지 적을 것)
 *
 * **놓치는 것 — 이 파일이 존재하는 이유**:
 *   - `POSTER_RATIOS` 의 `4:5`·`3:4`·`16:9` 픽셀. 개수도 제약도 그대로라 아무도
 *     안 본다. (같은 `4:5` 라도 `CARD_RATIOS` 쪽만 잡힌다)
 *   - **`8:1`·`1:8`**. `4:1` 은 위 시험이 짚지만 이 둘은 아무도 안 본다.
 *     설계 §2.3 이 안 B 로 돌아올 때 근거가 되는 것이 바로 그 둘이다
 *   - **`maxAspect: 3`**. 설계 §1 의 「열둘 중 셋만 직접 생성 가능」과 §4.2 의
 *     「`match-source` 는 3:1 까지」가 이 숫자 하나 위에 서 있다
 *   - **`isDefault`·`batchMax`·`fixedResolution`**
 *
 * 즉 **광고 설계의 근거가 되는 값일수록 기존 시험이 안 잡는다.**
 *
 * ## 여기 없는 자물쇠 하나
 *
 * 광고가 가장 크게 기대는 것은 상수가 아니라 **동작**이다 —
 * `sizeFromSource(마스터, gpt-image-2)` 가 입력을 그대로 돌려준다는 것(설계 §4.2).
 * 그것은 `apps/web/lib/__tests__/ad-derive.test.ts` 가 `AD_MASTERS` 를 순회해
 * 잠근다. 마스터 픽셀이 그쪽에 있어 여기 적으면 같은 값이 두 곳에 남는다.
 *
 * ## 왜 `toMatchSnapshot()` 을 쓰지 않는가
 *
 * 스냅숏 파일은 `-u` 한 번으로 갱신된다. 몇 번 깨지고 나면 사람이 반사적으로
 * `-u` 를 치게 되고, **그 순간 이 자물쇠는 아무것도 막지 못한다.**
 * 기대값을 이 파일에 직접 적어 두면 고치려면 사람이 타이핑해야 하고,
 * 리뷰에서 diff 로 보인다.
 *
 * ## 무엇을 고정하고 무엇을 안 하는가
 *
 * 고정한다 — 광고 파생이 **실제로 기대는 값**:
 *   비율의 id·픽셀·열거 대체·픽셀 전용 여부, 모델의 id·지원 비율·픽셀 한계
 *
 * 고정하지 않는다 — 정당하게 바뀌는 값:
 *   - **가격표**(`t2i`·`i2i` 의 `flatUsd`·`table`). fal 공표값이라 바뀐다
 *     (`models.ts:29` 주석에 확인 날짜가 적혀 있다). 이것까지 묶으면 가격이
 *     바뀔 때마다 깨져서 위의 `-u` 문제를 그대로 부른다
 *   - **표시 문구**(`label`, `pixelOnly.reason`). 화면 문구는 바뀌어도 광고
 *     파생에 영향이 없다
 *   - **`resolutionMultiplier`**. 이름은 능력처럼 보이지만 저장소 전체에서
 *     쓰이는 곳이 `models.ts:135` 의 단가 계산 한 곳뿐이다 — 실단가가
 *     `flatUsd × resolutionMultiplier` 라, 앞항을 풀고 뒷항을 묶으면 앞뒤가
 *     안 맞는다. 게다가 광고는 `gpt-image-2` 전용이라(설계 §4.2) nano 의 배수에
 *     기대지 않는다
 *   - **엔드포인트**(`t2i.endpoint`·`i2i.endpoint`). 바뀌면 생성 전체가 죽으므로
 *     광고만 조용히 깨지는 값이 아니다. 이 자물쇠가 잡을 종류의 고장이 아니다
 */

/** 비교를 위해 광고가 기대는 필드만 남긴다. */
function ratioShape(list: typeof POSTER_RATIOS) {
  return list.map((entry) => ({
    id: entry.id,
    pixel: entry.pixel,
    enumFallback: entry.enumFallback ?? null,
    pixelOnly: Boolean(entry.pixelOnly),
  }));
}

describe("격리 자물쇠 — 포스터 비율", () => {
  it("목록이 그대로다 — 항목이 늘거나 픽셀이 바뀌면 광고 파생의 근거가 무너진다", () => {
    expect(ratioShape(POSTER_RATIOS)).toEqual([
      { id: "4:5", pixel: { width: 1088, height: 1360 }, enumFallback: null, pixelOnly: false },
      { id: "1:1", pixel: { width: 1088, height: 1088 }, enumFallback: null, pixelOnly: false },
      { id: "9:16", pixel: { width: 1152, height: 2048 }, enumFallback: null, pixelOnly: false },
      { id: "2:3", pixel: { width: 1024, height: 1536 }, enumFallback: null, pixelOnly: false },
      { id: "3:4", pixel: { width: 1152, height: 1536 }, enumFallback: null, pixelOnly: false },
      { id: "16:9", pixel: { width: 2048, height: 1152 }, enumFallback: null, pixelOnly: false },
      { id: "a4-draft", pixel: { width: 1088, height: 1536 }, enumFallback: "3:4", pixelOnly: false },
      { id: "a4-print", pixel: { width: 2400, height: 3392 }, enumFallback: null, pixelOnly: true },
      { id: "match-source", pixel: { width: 1088, height: 1088 }, enumFallback: null, pixelOnly: true },
    ]);
  });

  /**
   * 광고 기능은 이 문으로 들어간다(설계 §4.2). `match-source` 가 사라지거나
   * 이름이 바뀌면 **기존 파일 무접촉이라는 전제가 통째로 무너진다.**
   */
  it("`match-source` 가 있다 — 광고 마스터가 들어가는 유일한 문이다", () => {
    expect(POSTER_RATIOS.map((entry) => entry.id)).toContain("match-source");
  });
});

describe("격리 자물쇠 — 카드뉴스 비율", () => {
  it("목록이 그대로다", () => {
    expect(ratioShape(CARD_RATIOS)).toEqual([
      { id: "4:5", pixel: { width: 1088, height: 1360 }, enumFallback: null, pixelOnly: false },
      { id: "1:1", pixel: { width: 1088, height: 1088 }, enumFallback: null, pixelOnly: false },
      { id: "9:16", pixel: { width: 1152, height: 2048 }, enumFallback: null, pixelOnly: false },
      { id: "16:9", pixel: { width: 2048, height: 1152 }, enumFallback: null, pixelOnly: false },
    ]);
  });
});

describe("격리 자물쇠 — 모델 능력", () => {
  it("광고가 기대는 능력이 그대로다 — 가격은 일부러 안 본다", () => {
    expect(IMAGE_MODELS.map((model) => ({
      id: model.id,
      isDefault: model.isDefault ?? false,
      supportedRatios: model.supportedRatios ?? null,
      pixelSizeLimits: model.pixelSizeLimits ?? null,
      fixedResolution: model.fixedResolution ?? null,
      maxReferenceImages: model.maxReferenceImages,
      batchMax: model.batchMax,
    }))).toEqual([
      {
        id: "gpt-image-2",
        isDefault: true,
        supportedRatios: null,
        pixelSizeLimits: {
          minPixels: 655360, maxPixels: 8294400, maxEdge: 3840, multipleOf: 16, maxAspect: 3,
        },
        fixedResolution: null,
        maxReferenceImages: 16,
        batchMax: 4,
      },
      {
        id: "nano-banana-pro",
        isDefault: false,
        supportedRatios: ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
        pixelSizeLimits: null,
        fixedResolution: "2K",
        maxReferenceImages: 14,
        batchMax: 4,
      },
      {
        id: "nano-banana-2",
        isDefault: false,
        supportedRatios: [
          "auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16",
          "4:1", "1:4", "8:1", "1:8",
        ],
        pixelSizeLimits: null,
        fixedResolution: "2K",
        maxReferenceImages: 14,
        batchMax: 4,
      },
      {
        id: "nano-banana",
        isDefault: false,
        supportedRatios: ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
        pixelSizeLimits: null,
        fixedResolution: null,
        maxReferenceImages: 7,
        batchMax: 1,
      },
    ]);
  });

  /**
   * 설계 §1·§2.3 이 이 두 숫자 위에 서 있다.
   *
   * `maxAspect: 3` 이 「안 A 는 3:1 까지」를 정하고, `multipleOf: 16` 이
   * 「광고 규격 열둘 중 셋만 직접 생성 가능」을 정한다. 이 값이 바뀌면
   * 설계 문서를 다시 읽어야 한다.
   */
  it("안 A 의 근거가 되는 두 값을 따로 못 박는다", () => {
    const limits = IMAGE_MODELS.find((model) => model.id === "gpt-image-2")!.pixelSizeLimits!;
    expect(limits.maxAspect).toBe(3);
    expect(limits.multipleOf).toBe(16);
  });

  /**
   * **가격은 일부러 안 묶는다**(위 머리말 참고). 다만 「가격 필드가 있다」는
   * 것까지 놓치면, 가격 구조가 통째로 사라져도 이 파일이 조용하다.
   */
  it("가격 필드는 값이 아니라 존재만 본다", () => {
    for (const model of IMAGE_MODELS) {
      // `table: []` 을 통과시키면 안 된다 — 그 상태의 `unitPrice` 는
      // `models.ts:128` 의 `pickRow([])[0]!` 에서 터진다.
      const hasPrice = (side: { flatUsd?: number; table?: unknown[] }) =>
        typeof side.flatUsd === "number" || (Array.isArray(side.table) && side.table.length > 0);
      expect(hasPrice(model.t2i)).toBe(true);
      expect(hasPrice(model.i2i)).toBe(true);
    }
  });
});
