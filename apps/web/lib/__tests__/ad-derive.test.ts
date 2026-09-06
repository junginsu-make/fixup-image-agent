import { describe, expect, it } from "vitest";
import { modelById, sizeFromSource } from "@fixup/sns-core";
import { AD_MASTERS, AD_SPECS, masterById, type AdSpec } from "../ad/specs";
import { planDerivation } from "../ad/derive";

/**
 * 광고 규격을 어떤 마스터에서 어떻게 뽑을지 정하는 판단.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §3.6
 *
 * **이 판단이 틀리면 흐리거나 잘린 그림이 광고로 나가는데, 화면에서는
 * 정상으로 보인다.** 규격 검증(§5.1)은 픽셀 수만 보므로 못 잡는다.
 */

/** 마스터를 목표 비율로 중앙 크롭했을 때의 크기. */
function cropped(master: { width: number; height: number }, target: { width: number; height: number }) {
  const aspect = target.width / target.height;
  return master.width / master.height > aspect
    ? { width: master.height * aspect, height: master.height }
    : { width: master.width, height: master.width / aspect };
}

const derivable = AD_SPECS
  .map((spec) => ({ spec, plan: planDerivation(spec) }))
  .filter((entry) => entry.plan.kind === "resize" || entry.plan.kind === "crop");

describe("규격마다 답이 있다", () => {
  it("빠진 규격이 없다 — 모든 항목이 답을 받는다", () => {
    for (const spec of AD_SPECS) {
      expect(planDerivation(spec).kind, spec.id).toBeTruthy();
    }
  });

  it("규격 id 가 겹치지 않는다", () => {
    const ids = AD_SPECS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("파생하는 규격이 하나라도 있다 — 아래 검사들이 헛돌지 않게", () => {
    expect(derivable.length).toBeGreaterThan(5);
  });
});

describe("마스터가 모델이 만들 수 있는 것인가", () => {
  /**
   * 설계 §1 이 이 다섯 제한 위에 서 있다. 마스터를 나중에 손대면 근거가
   * 조용히 무너지므로 여기서 못 박는다.
   */
  it("다섯 제한을 전부 통과한다", () => {
    const limits = modelById("gpt-image-2").pixelSizeLimits!;
    for (const master of AD_MASTERS) {
      const { width, height } = master;
      const pixels = width * height;
      expect(width % limits.multipleOf, `${master.id} 가로`).toBe(0);
      expect(height % limits.multipleOf, `${master.id} 세로`).toBe(0);
      expect(pixels, `${master.id} 최소 픽셀`).toBeGreaterThanOrEqual(limits.minPixels);
      expect(pixels, `${master.id} 최대 픽셀`).toBeLessThanOrEqual(limits.maxPixels);
      expect(Math.max(width, height), `${master.id} 최대 변`).toBeLessThanOrEqual(limits.maxEdge);
      expect(Math.max(width, height) / Math.min(width, height), `${master.id} 비율`)
        .toBeLessThanOrEqual(limits.maxAspect);
    }
  });

  it("마스터 id 가 겹치지 않는다", () => {
    const ids = AD_MASTERS.map((master) => master.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * **상수가 아니라 동작을 잠근다.**
   *
   * 무접촉 경로(설계 §4.2)는 `ratioId: "match-source"` + `sourceSize` 로 마스터
   * 픽셀을 넘긴다. 그런데 `sizeFromSource` 는 받은 값을 그대로 쓰지 않는다 —
   * 모델 한계 안으로 옮기는 계산을 한다. **입력이 그대로 나온다는 것이 이 설계의
   * 전제인데, 그 전제는 상수 어디에도 안 적혀 있다.**
   *
   * 독립 리뷰가 실측으로 보였다: `model-choice.ts:105` 의
   * `const idealPixels = width * height` 를 `limits.minPixels` 로 바꾸면
   * **시험 1,735개가 전부 통과하면서** 마스터가 조용히 줄어든다
   * (1200×1200 → 816×816). 그러면 1200×1200 규격을 뽑을 때 1.47배 확대가 걸려,
   * 설계 §3.2 의 「절대 확대하지 않는다」가 뒤집힌다.
   *
   * `AD_MASTERS` 를 그대로 순회한다. 픽셀을 여기 다시 적으면 같은 값이 두 곳에
   * 남는데, 이 저장소는 최근 그 형태로 두 번 사고가 났다.
   */
  it("마스터가 `sizeFromSource` 를 왕복해도 그대로다 — 무접촉 경로의 전제다", () => {
    const gpt = modelById("gpt-image-2");
    for (const master of AD_MASTERS) {
      const resolved = sizeFromSource({ width: master.width, height: master.height }, gpt);
      expect(resolved.rejected, master.id).toBeUndefined();
      expect(resolved.pixel, master.id).toEqual({ width: master.width, height: master.height });
    }
  });

  it("계획이 가리키는 마스터가 실재한다", () => {
    for (const { spec, plan } of derivable) {
      expect(masterById((plan as { master: string }).master), spec.id).toBeTruthy();
    }
  });
});

describe("확대하지 않는다", () => {
  /**
   * 확대 보간이 걸리면 흐려지고, 「이미지가 흐림」은 실제 광고 심사 반려 사유다.
   *
   * 초판은 네이버 메인 배너(1250×560)에 1216×608 마스터를 붙여 1.03배 확대가
   * 필요했다. **원인은 비교 방식이 아니라 아무 검사도 안 한 것**이었다 —
   * 표를 손으로 적었다.
   */
  it("크롭한 뒤의 크기가 목표 이상이다", () => {
    for (const { spec, plan } of derivable) {
      const master = masterById((plan as { master: string }).master)!;
      const after = cropped(master, spec.target);
      expect(after.width, `${spec.id} 가로`).toBeGreaterThanOrEqual(spec.target.width);
      expect(after.height, `${spec.id} 세로`).toBeGreaterThanOrEqual(spec.target.height);
    }
  });

  /**
   * **규칙 자체를 밟는다.** 위 검사는 지금 실린 규격에 대한 결과만 본다 —
   * 확대 금지를 통째로 걷어내도 지금 배정은 안 바뀌므로 통과해 버린다
   * (뮤테이션으로 확인했다). 어떤 마스터로도 못 덮는 규격을 넣어야 그 가지가
   * 실제로 돈다.
   */
  it("어떤 마스터로도 못 덮는 규격은 만들지 않는다", () => {
    const huge: AdSpec = {
      ...AD_SPECS[0]!, id: "시험용-거대", target: { width: 3000, height: 3000 },
    };
    const plan = planDerivation(huge);
    expect(plan.kind).toBe("unsupported");
    expect((plan as { reason: string }).reason).toMatch(/확대/);
  });

  /**
   * **경계에서 부동소수점이 판정을 뒤집었다.**
   *
   * 크롭 결과로 비교하면 `1088 / (997/1360)` 이 `996.9999999999999` 로 떨어져
   * `ad-4x5`(유지율 91.6%)가 탈락하고 `ad-9x16`(76.7%)이 뽑혔다. 오차 1e-13
   * 때문에 화면의 15%p 를 더 버린 것이다.
   *
   * 이런 목표는 `목표 세로 == 마스터 세로` 같은 **측도 0 의 경계**라 무작위
   * 표본으로는 거의 안 뽑힌다 — 격자로 쓸어야 보인다. 그래서 그 값을 직접 박는다.
   */
  it("마스터와 한 변이 정확히 같은 목표에서도 최적 마스터를 고른다", () => {
    const edge: AdSpec = {
      ...AD_SPECS[0]!, id: "시험용-경계", target: { width: 997, height: 1360 },
    };
    const plan = planDerivation(edge);
    expect(plan.kind).toBe("crop");
    expect((plan as { master: string }).master).toBe("ad-4x5");
  });

  it("마스터가 통째로 덮는 목표를 못 만든다고 하지 않는다", () => {
    const inside: AdSpec = {
      ...AD_SPECS[0]!, id: "시험용-내부", target: { width: 1152, height: 1550 },
    };
    expect(planDerivation(inside).kind).not.toBe("unsupported");
  });

  it("세로로만 넘쳐도 만들지 않는다", () => {
    const tall: AdSpec = {
      ...AD_SPECS[0]!, id: "시험용-긴세로", target: { width: 900, height: 2500 },
    };
    expect(planDerivation(tall).kind).toBe("unsupported");
  });
});

describe("마스터와 규격의 방향이 같다", () => {
  /**
   * 확대 금지만으로는 못 잡는다. `ad-2x1`(1600×800)을 0.5 비율로 깎으면
   * 400×800 이라 300×600 목표를 「확대 없이」 덮지만, 면적의 25% 만 남는다.
   * 초판이 실제로 그 배정을 했었다.
   */
  const orient = (size: { width: number; height: number }) =>
    size.width === size.height ? "square" : size.width > size.height ? "landscape" : "portrait";

  it("가로 마스터에서 세로 규격을 뽑지 않는다", () => {
    for (const { spec, plan } of derivable) {
      const master = masterById((plan as { master: string }).master)!;
      const specSide = orient(spec.target);
      const masterSide = orient(master);
      if (specSide === "square" || masterSide === "square") continue;
      expect(masterSide, `${spec.id}`).toBe(specSide);
    }
  });
});

describe("투명 배경 규격은 새어 나가지 않는다", () => {
  /**
   * 크롭으로 새어 나가면 투명 없이 만들어져 **등록 자체가 거부된다.**
   * 규격 검증(§5.1)은 픽셀만 보므로 통과시킨다.
   */
  it("`png-alpha` 는 반드시 미지원이다", () => {
    const alpha = AD_SPECS.filter((spec) => spec.format === "png-alpha");
    expect(alpha.length).toBeGreaterThan(0);
    for (const spec of alpha) {
      expect(planDerivation(spec).kind, spec.id).toBe("unsupported");
    }
  });

  it("카카오 비즈보드와 네이버 스마트채널이 그 갈래다", () => {
    const ids = AD_SPECS.filter((spec) => spec.format === "png-alpha").map((spec) => spec.id);
    expect(ids).toContain("kakao-bizboard");
    expect(ids).toContain("naver-smartchannel");
  });
});

describe("로고는 만들지 않고 받는다", () => {
  it("브랜드 로고를 모델이 지어내면 안 된다", () => {
    const logo = AD_SPECS.find((spec) => spec.id === "google-rda-logo")!;
    expect(planDerivation(logo).kind).toBe("upload");
  });
});

describe("배정이 설계 §6.2 와 같다", () => {
  const expected: Record<string, { master: string; kind: string }> = {
    "google-rda-square": { master: "ad-1x1", kind: "resize" },
    "google-rda-landscape": { master: "ad-191x1", kind: "resize" },
    "google-rda-portrait": { master: "ad-4x5", kind: "resize" },
    "kakao-display-square": { master: "ad-1x1", kind: "resize" },
    "kakao-display-2x1": { master: "ad-2x1", kind: "resize" },
    "kakao-display-9x16": { master: "ad-9x16", kind: "resize" },
    "kakao-display-4x5": { master: "ad-4x5", kind: "resize" },
    "naver-gfa-native": { master: "ad-1x1", kind: "resize" },
    "naver-gfa-banner": { master: "ad-191x1", kind: "resize" },
    "naver-gfa-thumb": { master: "ad-1x1", kind: "resize" },
    "naver-powerlink": { master: "ad-1x1", kind: "resize" },
    "naver-gfa-main": { master: "ad-2x1", kind: "crop" },
    "naver-brand-pc": { master: "ad-191x1", kind: "crop" },
    "naver-brand-mobile": { master: "ad-191x1", kind: "crop" },
  };

  it("모든 파생 규격의 마스터와 방법이 설계와 일치한다", () => {
    const actual = Object.fromEntries(
      derivable.map(({ spec, plan }) => [
        spec.id,
        { master: (plan as { master: string }).master, kind: plan.kind },
      ]),
    );
    expect(actual).toEqual(expected);
  });

  it("크롭은 셋뿐이고 나머지는 구도를 안 바꾼다", () => {
    const crops = derivable.filter(({ plan }) => plan.kind === "crop").map(({ spec }) => spec.id);
    expect(crops.sort()).toEqual(["naver-brand-mobile", "naver-brand-pc", "naver-gfa-main"]);
  });

  it("가장 많이 깎는 규격도 면적의 3/4 은 남는다", () => {
    for (const { spec, plan } of derivable) {
      if (plan.kind !== "crop") continue;
      expect(plan.keep, spec.id).toBeGreaterThan(0.75);
    }
  });
});

describe("필수와 선택을 가른다", () => {
  it("필수 규격이 포털마다 있다", () => {
    for (const portal of ["google", "kakao", "naver"] as const) {
      const required = AD_SPECS.filter((spec) => spec.portal === portal && spec.required);
      expect(required.length, portal).toBeGreaterThan(0);
    }
  });

  it("구글 로고는 선택이다 — 없어도 등록된다", () => {
    expect(AD_SPECS.find((spec) => spec.id === "google-rda-logo")!.required).toBe(false);
  });

  it("네이버 확장소재는 선택이다 — 없어도 광고가 나간다", () => {
    expect(AD_SPECS.find((spec) => spec.id === "naver-powerlink")!.required).toBe(false);
  });

  it("모든 규격에 확인 날짜와 출처가 있다 — 규격은 조용히 바뀐다", () => {
    for (const spec of AD_SPECS) {
      expect(spec.verifiedAt, spec.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(spec.source, spec.id).toMatch(/^https?:\/\//);
    }
  });

  /**
   * **`verifiedAt` 만으로는 「확인했다」와 「옮겨 적었다」가 구분되지 않는다.**
   *
   * 네이버 공식 문서가 광고주 로그인 뒤에 있어 공개 확인이 안 됐다. 그 사실이
   * 데이터에 없으면 화면이 구글·카카오와 똑같이 보여 주게 되고, 확인 날짜가
   * 검증되지 않은 값에 검증 도장을 찍는 꼴이 된다(설계 §11).
   */
  it("네이버는 전부 `reference` 다 — 공식 확인이 안 됐다", () => {
    const naver = AD_SPECS.filter((spec) => spec.portal === "naver");
    expect(naver.length).toBeGreaterThan(0);
    for (const spec of naver) expect(spec.sourceKind, spec.id).toBe("reference");
  });

  it("구글·카카오는 전부 `official` 이다 — 공식 문서를 직접 봤다", () => {
    const official = AD_SPECS.filter((spec) => spec.portal !== "naver");
    expect(official.length).toBeGreaterThan(0);
    for (const spec of official) expect(spec.sourceKind, spec.id).toBe("official");
  });
});
