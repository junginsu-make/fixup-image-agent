import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 규칙과 화면을 잇는 줄들의 자물쇠.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-c·3-d
 *
 * **왜 소스 문자열을 보는가.** 이 저장소에는 jsdom 이 없고 `package.json` 을
 * 건드리면 격리 계약이 깨진다(§4.1). 그래서 컴포넌트를 렌더해서 볼 수 없다.
 *
 * 판단은 전부 `poster-form-rules.ts` 로 뽑아 시험 19개로 잠갔다. 그런데
 * **그것을 부르는 줄은 여전히 아무도 안 봤다.** 호출부 다섯을 동시에 뒤집어도
 * 812개가 전부 초록이었다 — 그 다섯 줄이 정확히 이번에 고친 고장이 살던
 * 자리다:
 *
 * - `effectiveRatio(adMode, …)` 를 `false` 로 → 광고 모드가 nano 에서 죽는다
 * - `projectCount(adMode, …)` 를 `false` 로 → 비용이 절반 이하로 보인다
 * - `posterSpecSections` 의 `adEnabled` 를 `true` 로 → 계약 5 가 사라진다
 * - `canCreatePoster` 의 `adMode` 를 `false` 로 → 과금 전 차단이 사라진다
 * - `modelId: choice.model.id` 를 `modelId` 로 → 화면 안내와 보내는 값이 어긋난다
 *
 * **문자열 대조라 리팩터링에 약하다. 그것이 이 시험의 값이다** — 이 줄들을
 * 건드리면 사람이 한 번 멈춰 서게 만든다. 이 저장소는 같은 판단을 이미 했다
 * (`packages/sns-core/src/__tests__/ad-isolation-lock.test.ts`).
 */

const source = readFileSync(new URL("../new-client.tsx", import.meta.url), "utf8");

describe("판단이 살아 있는 상태에 이어져 있는가", () => {
  it("비율을 광고 모드에 따라 고른다", () => {
    expect(source).toContain("effectiveRatio(adMode, ratio)");
  });

  it("프로젝트 수를 광고 모드에 따라 센다", () => {
    expect(source).toContain("projectCount(adMode,");
  });

  it("무엇을 그릴지 스위치와 모드 양쪽으로 정한다", () => {
    expect(source).toContain("posterSpecSections({ adEnabled, adMode })");
  });

  it("만들기 버튼이 광고 판단을 본다", () => {
    expect(source).toContain("adReady: adPlan.ready");
    expect(source).toMatch(/canCreatePoster\({[\s\S]*?\badMode,/);
  });

  /**
   * 화면이 「GPT Image 2 로 만듭니다」라고 말했으면 그 모델을 **보내야** 한다.
   *
   * **두 곳을 각각 짚는다.** `choice.model.id` 는 추정과 본문 양쪽에 나오는데,
   * 그냥 `toContain` 으로 보면 한쪽을 되돌려도 다른 쪽이 시험을 통과시킨다 —
   * 실제로 그렇게 뮤테이션 하나가 살아남았다.
   */
  it("추정을 바뀐 모델과 실제 비율로 잰다", () => {
    expect(source).toMatch(/estimatePosterCost\(\{\s*modelId: choice\.model\.id, ratioId: submitRatio,/);
  });

  it("본문에도 바뀐 모델을 싣는다", () => {
    expect(source).toMatch(/ratio: submitRatio,[\s\S]{0,500}modelId: choice\.model\.id,/);
  });

  /** 광고 모드가 아니면 마스터 크기가 안 나온다. */
  it("광고 본문은 순수 함수가 만든다", () => {
    expect(source).toContain("adProjectBodies(projectBody(), adPlan.masters, title)");
  });
});

/**
 * 고른 차례가 화면 상태에 이어져 있는가.
 *
 * 규칙은 `@fixup/poster-core` 로 뽑아 시험으로 잠갔는데, **화면이 그것을 부르는
 * 줄은 아무도 안 보고 있었다.** `picked` 를 예전처럼 `references.filter(…)` 로
 * 되돌리거나 세 목록을 `Object.keys(roles)` 에서 뽑아도 시험 1059개가 전부
 * 초록이었다(2026-09-08 리뷰). 그 줄들이 정확히 이번에 고친 고장이 살던 자리다.
 */
describe("고른 차례가 화면 상태에 이어져 있는가", () => {
  it("규칙을 여기 다시 적지 않고 poster-core 를 부른다", () => {
    // 두 벌로 적으면 화면과 서버의 번호가 갈린다.
    expect(source).toContain("nextPickOrder(current, id,");
    expect(source).toMatch(/visibleOrder\(\s*pickOrder,/);
  });

  it("역할을 바꿀 때 차례도 함께 고친다", () => {
    expect(source).toMatch(/setRoles\([\s\S]{0,200}?setPickOrder\(/);
  });

  it("보이는 것만 보낸다 — 목록에 없는 id 를 거른다", () => {
    // 안 거르면 그 뒤 번호가 전부 1씩 밀린다.
    expect(source).toContain("references.some((entry) => entry.id === id)");
  });

  it("세 목록을 전부 고른 차례에서 뽑는다", () => {
    // `roles` 에서 직접 뽑으면 차례에 없는 id 가 서버로 새어 나간다.
    for (const line of [
      "const styleIds = orderedIds.filter",
      "const preservedIds = orderedIds.filter",
      "const personIds = orderedIds.filter",
    ]) {
      expect(source, `${line} 가 orderedIds 에서 나와야 한다`).toContain(line);
    }
  });

  it("차례와 첨부에 대한 말을 서버로 보낸다", () => {
    expect(source).toContain("attachmentOrder: orderedIds");
    expect(source).toContain("attachmentIntent: attachmentIntent.trim()");
  });
});
