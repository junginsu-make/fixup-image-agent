import { describe, expect, it } from "vitest";
import { POSTER_RATIOS } from "@fixup/sns-core";
import { AD_SPECS, type AdSpec } from "../ad/specs";
import { usable } from "../ad/derive";

/**
 * 이미지 만들기로 만든 그림이 광고 규격을 **확대 없이** 덮는가.
 *
 * 설계: `docs/superpowers/specs/2026-09-23-ad-source-size-design.md`
 *
 * **왜 이 시험이 있는가.** 「광고 규격으로 내보내기」(`/ad`)는 새로 그리지 않고
 * **이미 만든 그림에서 잘라 뽑는다.** 그런데 재료가 목표보다 작으면
 * `lib/ad/export.ts:91` 이 거부한다 — 늘리면 흐려져 광고 심사에서 반려되기
 * 때문이다. 그 거부가 옳으므로, **재료 쪽이 충분히 커야 한다.**
 *
 * 2026-09-23 이전에는 정사각 그림이 1088×1088 이었고 구글·카카오·네이버의
 * 정사각 필수 규격이 1200×1200 이라, **필수 규격 셋이 어떤 그림으로도 안
 * 나왔다.** 112픽셀 때문이었고, 화면은 그 사실을 생성 전에 말해 주지 않아
 * 크레딧을 쓰고 나서야 실패했다.
 *
 * **`lib/ad/specs.ts` 의 분리 원칙을 깨지 않는다.** 그 파일은 광고가
 * `POSTER_RATIOS` 를 **참조하지 않는다**고 적어 두었다 — 목록이 바뀔 때 광고가
 * 조용히 따라 바뀌는 것을 막으려는 것이다. 여기서 둘을 함께 보는 것은 참조가
 * 아니라 **검증**이다. 런타임 의존은 생기지 않고, 한쪽이 움직여 둘이 어긋나면
 * 이 시험이 깨져 알려 준다. 그것이 분리의 목적에 어긋나지 않는다.
 *
 * ## 이 시험이 덮지 않는 것
 *
 * **픽셀을 직접 지정하는 모델에서만 참이다.** 여기 적힌 픽셀이 실제 출력
 * 크기가 되는 것은 `pixelSizeLimits` 가 있는 모델뿐이고(`ratios.ts:115`),
 * nano 계열은 비율 문자열만 받아 **실제 크기를 fal 이 정한다**(`:119-127`).
 * 그쪽 크기는 `lib/membership/image-sizes.ts:17` 자체가 추측하고 있다. 즉
 * 경제형으로 만든 그림은 이 시험이 초록불이어도 작을 수 있다.
 */

/**
 * 픽셀이 실제 생성 크기인 비율만 본다.
 *
 * `match-source` 의 픽셀은 **자리를 채우는 값**이다(`ratios.ts:52-53`) — 실제
 * 크기는 첨부한 그림을 보고 그때 정하므로 여기서 판단할 수 없다.
 */
const REAL_RATIOS = POSTER_RATIOS.filter((ratio) => ratio.id !== "match-source");

/** 모델이 지어내면 안 되는 규격(로고)은 애초에 생성 대상이 아니다. */
const GENERATED_SPECS = AD_SPECS.filter((spec) => spec.supply !== "upload");

const REQUIRED_SPECS = GENERATED_SPECS.filter((spec) => spec.required);

/**
 * **판단을 여기서 다시 쓰지 않는다.** 확대가 필요한지 정하는 식은
 * `lib/ad/derive.ts` 의 `usable` 하나뿐이고, 화면의 회색 처리와 서버의 거부가
 * 모두 그 식에서 나온다. 시험이 같은 식을 베껴 두면 **본체가 바뀌어도 시험은
 * 초록불**이다 — 이를테면 누가 안전 여유를 준다고 `target.width * 1.05` 로
 * 고치면, 여유가 정확히 0 인 1:1(1200×1200)과 3:4(1200×1600)가 그 순간 다시
 * 막히는데 베낀 시험은 모른다.
 */
function covers(pixel: { width: number; height: number }, spec: AdSpec): boolean {
  return usable({ id: "재료", ...pixel }, spec);
}

/**
 * 사용자가 이 규격을 노린다면 **자연스럽게 고를 비율**.
 *
 * 비율이 가장 가까운 것이다. 구도를 덜 버리려면 그 그림을 고르는 것이 맞고,
 * 그러므로 **그 그림이 규격을 덮어야 한다.** 「A4 인쇄용으로 뽑으면 된다」는
 * 답이 되지 않는다 — 정사각 광고를 만들려고 세로로 긴 인쇄용 시안을 뽑는
 * 사람은 없고, 뽑는다 해도 좌우를 크게 버린다.
 */
function nearestRatio(spec: AdSpec) {
  const target = spec.target.width / spec.target.height;
  return REAL_RATIOS.reduce((best, ratio) => {
    const gap = Math.abs(ratio.pixel.width / ratio.pixel.height - target);
    const bestGap = Math.abs(best.pixel.width / best.pixel.height - target);
    return gap < bestGap ? ratio : best;
  });
}

describe("픽셀 지정 모델로 만든 그림으로 광고 규격을 뽑을 수 있다", () => {
  it("필수 규격마다, 비율이 가장 가까운 그림이 그것을 덮는다", () => {
    expect(REQUIRED_SPECS.length, "필수 규격이 하나도 없다 — 규격 목록을 확인하라").toBeGreaterThan(0);

    for (const spec of REQUIRED_SPECS) {
      const ratio = nearestRatio(spec);
      expect(
        covers(ratio.pixel, spec),
        `${spec.id}(${spec.target.width}×${spec.target.height}) 를 노리면 ` +
          `${ratio.label}(${ratio.pixel.width}×${ratio.pixel.height}) 를 고르게 되는데 덮지 못한다`,
      ).toBe(true);
    }
  });

  it("정사각 필수 규격은 정사각 그림으로 나온다", () => {
    const square = REAL_RATIOS.find((ratio) => ratio.id === "1:1");
    expect(square, "정사각 비율이 목록에서 사라졌다").toBeDefined();

    const squareSpecs = REQUIRED_SPECS.filter(
      (spec) => spec.target.width === spec.target.height,
    );
    expect(squareSpecs.length, "정사각 필수 규격이 하나도 없다 — 규격 목록을 확인하라").toBeGreaterThan(0);

    for (const spec of squareSpecs) {
      expect(covers(square!.pixel, spec), `${spec.id} 를 정사각 그림이 덮지 못한다`).toBe(true);
    }
  });
});

/**
 * 세로로 긴 그림으로도 정사각 광고를 뽑을 수 있어야 한다.
 *
 * **왜 필요한가.** 사용자는 광고를 염두에 두고 그림을 만들지 않는다. 인스타에
 * 올리려고 4:5 로 만들어 둔 그림을 나중에 광고로도 쓰려 한다. 그때 「정사각
 * 규격은 정사각으로 다시 만드세요」가 되면 **돈을 두 번 낸다.** 위아래를
 * 버리더라도 뽑을 수는 있어야 한다.
 */
const PORTRAIT_RATIOS = REAL_RATIOS.filter(
  (ratio) =>
    ratio.pixel.height > ratio.pixel.width
    /**
     * **A4 둘만 뺀다.** 시안을 1200 위로 올리려면 150dpi 선을 넘는데, 그 선이
     * 「이것은 인쇄물이 아니다」를 뜻한다(`ratios.test.ts:88`, `ratios.ts:26`).
     * A4 비율은 광고 규격에 하나도 없어 넘길 이유도 없다. 인쇄용은 이미 전부
     * 덮으므로 여기 있으나 없으나 같다.
     */
    && ratio.id !== "a4-draft"
    && ratio.id !== "a4-print",
);

describe("세로 그림으로도 정사각 광고가 나온다", () => {
  it("세로형 비율이 정사각 필수 규격을 덮는다", () => {
    const squareSpecs = REQUIRED_SPECS.filter(
      (spec) => spec.target.width === spec.target.height,
    );
    expect(PORTRAIT_RATIOS.length, "세로형 비율이 하나도 안 남았다").toBeGreaterThan(0);

    for (const ratio of PORTRAIT_RATIOS) {
      for (const spec of squareSpecs) {
        expect(
          covers(ratio.pixel, spec),
          `${ratio.label}(${ratio.pixel.width}×${ratio.pixel.height}) 로 만든 그림에서 ` +
            `${spec.id}(${spec.target.width}×${spec.target.height}) 를 뽑지 못한다`,
        ).toBe(true);
      }
    }
  });

  /**
   * 가로 필수 규격(1200×628)도 같다. 세로 그림에서 뽑으면 위아래를 크게
   * 버리지만, **뽑을 수 없는 것과 버리는 것은 다르다.**
   */
  it("세로형 비율이 가로 필수 규격도 덮는다", () => {
    const wideSpecs = REQUIRED_SPECS.filter(
      (spec) => spec.target.width > spec.target.height && spec.format !== "png-alpha",
    );
    expect(wideSpecs.length, "가로 필수 규격이 하나도 없다 — 규격 목록을 확인하라").toBeGreaterThan(0);

    for (const ratio of PORTRAIT_RATIOS) {
      for (const spec of wideSpecs) {
        expect(
          covers(ratio.pixel, spec),
          `${ratio.label} 로 만든 그림에서 ${spec.id} 를 뽑지 못한다`,
        ).toBe(true);
      }
    }
  });
});

describe("경계", () => {
  /**
   * **덮는 것과 값이 같은 것은 다르다.** 재료가 목표와 같은 크기면 통과이고,
   * 1픽셀 모자라면 거부다. `export.ts:91` 의 부등호와 방향이 같아야 한다.
   */
  it("같은 크기는 덮는 것으로 본다", () => {
    const spec = REQUIRED_SPECS.find((entry) => entry.target.width === entry.target.height)!;
    expect(covers({ ...spec.target }, spec)).toBe(true);
    expect(covers({ width: spec.target.width - 1, height: spec.target.height }, spec)).toBe(false);
  });
});
