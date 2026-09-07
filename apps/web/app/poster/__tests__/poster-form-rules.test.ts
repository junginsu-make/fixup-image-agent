import { describe, expect, it } from "vitest";
import { MATCH_SOURCE } from "@fixup/sns-core";
import {
  adProjectBodies, canCreatePoster, effectiveRatio, posterSpecSections, projectCount,
} from "../poster-form-rules";

/**
 * 만들기 화면의 판단들 (설계 §10 3-c·3-d).
 *
 * **컴포넌트 안에 두면 시험이 못 간다.** 이 저장소에는 jsdom 이 없고,
 * `package.json` 을 건드리면 격리 계약이 깨진다. 그래서 판단만 밖으로 뽑는다 —
 * 뽑기 전에는 뮤테이션 넷이 전부 통과했다(계약 5 삭제 · 과금 전 차단 삭제 ·
 * 마스터 비율 뒤바꿈 · N장을 1장으로).
 */

describe("무엇을 그리는가", () => {
  /**
   * **일반 모드가 예전과 한 픽셀도 다르지 않다**를 못 박는 자리다.
   * 스위치가 꺼져 있으면 비율 하나뿐 — 토글도 규격 목록도 없다(계약 5).
   */
  it("스위치가 꺼져 있으면 예전 그대로다", () => {
    expect(posterSpecSections({ adEnabled: false, adMode: false })).toEqual(["ratio"]);
    // 스위치가 꺼졌는데 모드 상태가 남아 있어도 마찬가지다.
    expect(posterSpecSections({ adEnabled: false, adMode: true })).toEqual(["ratio"]);
  });

  it("켜져 있으면 토글이 붙고, 일반 모드는 여전히 비율이다", () => {
    expect(posterSpecSections({ adEnabled: true, adMode: false })).toEqual(["mode-toggle", "ratio"]);
  });

  it("광고 모드는 비율 대신 규격이다 — 둘을 같이 그리지 않는다", () => {
    expect(posterSpecSections({ adEnabled: true, adMode: true })).toEqual(["mode-toggle", "ad-specs"]);
  });
});

describe("어떤 비율로 재는가", () => {
  /**
   * **가드가 보는 값과 본문에 싣는 값이 같아야 한다.**
   *
   * 초판은 가드를 화면 상태(`"2:3"`)로 돌리고 본문에는 `match-source` 를 실었다.
   * 그래서 nano 계열을 고르면 화면은 전부 통과시키고 서버가 「첨부한 비율을
   * 그대로 쓰려면…」으로 거절했다 — **모델 넷 중 셋에서 광고 모드가 죽어 있었다.**
   */
  it("광고 모드는 첨부 비율로 잰다", () => {
    expect(effectiveRatio(true, "2:3")).toBe(MATCH_SOURCE);
  });

  it("일반 모드는 고른 비율 그대로다", () => {
    expect(effectiveRatio(false, "2:3")).toBe("2:3");
    expect(effectiveRatio(false, "16:9")).toBe("16:9");
  });
});

describe("몇 개를 만드는가", () => {
  /** 비용은 프로젝트 수만큼 곱해야 한다 — 안 곱하면 실제보다 낮게 보인다. */
  it("광고 모드는 마스터 수만큼이다", () => {
    expect(projectCount(true, 2)).toBe(2);
    expect(projectCount(true, 5)).toBe(5);
  });

  it("일반 모드는 언제나 하나다", () => {
    expect(projectCount(false, 5)).toBe(1);
  });

  /** 아직 못 만드는 상태에서 0 을 곱해 「무료」로 보이면 안 된다. */
  it("만들 것이 없어도 0 원으로 보이지 않는다", () => {
    expect(projectCount(true, 0)).toBe(1);
  });
});

describe("만들기를 누를 수 있는가", () => {
  const ok = {
    styleCount: 1, instruction: "가을 사진전 포스터", estimateRejected: false,
    overReferenceLimit: false, adMode: false, adReady: false,
  };

  it("일반 모드는 광고 상태와 무관하다", () => {
    expect(canCreatePoster(ok)).toBe(true);
  });

  it("따라 만들 그림이 없으면 못 누른다", () => {
    expect(canCreatePoster({ ...ok, styleCount: 0 })).toBe(false);
  });

  it("지시가 비어 있으면 못 누른다", () => {
    expect(canCreatePoster({ ...ok, instruction: "   " })).toBe(false);
  });

  it("추정이 거절이거나 레퍼런스가 넘치면 못 누른다", () => {
    expect(canCreatePoster({ ...ok, estimateRejected: true })).toBe(false);
    expect(canCreatePoster({ ...ok, overReferenceLimit: true })).toBe(false);
  });

  /**
   * **§4.4 의 「생성 전에 막는다」가 여기서 버튼에 닿는다.**
   * `adSubmitPlan` 이 `ready: false` 를 돌려주는 것만으로는 아무것도 안 막힌다.
   */
  it("광고 모드에서 못 만드는 규격이 있으면 못 누른다", () => {
    expect(canCreatePoster({ ...ok, adMode: true, adReady: false })).toBe(false);
    expect(canCreatePoster({ ...ok, adMode: true, adReady: true })).toBe(true);
  });
});

describe("무엇을 보내는가", () => {
  const masters = [
    { id: "ad-191x1", width: 2048, height: 1072 },
    { id: "ad-1x1", width: 1200, height: 1200 },
  ];

  it("마스터마다 본문을 하나씩 만든다", () => {
    expect(adProjectBodies({ variants: 3 }, masters, "가을 사진전")).toHaveLength(2);
  });

  /**
   * **본문마다 마스터가 달라야 한다.** 같으면 같은 그림을 두 번 만들고,
   * 그것이 곧 「N장이 서로를 덮는다」의 앞단이다(설계 3-0).
   */
  it("마스터가 서로 다르다", () => {
    const bodies = adProjectBodies({}, masters, "가을 사진전");
    expect(bodies.map((body) => body.adMasterId)).toEqual(["ad-191x1", "ad-1x1"]);
  });

  it("전부 첨부 비율로 보낸다 — 이 값이 아니면 마스터 크기가 안 나온다", () => {
    for (const body of adProjectBodies({}, masters, "가을")) {
      expect(body.ratio).toBe(MATCH_SOURCE);
    }
  });

  /** 제목이 같으면 라이브러리에서 어느 것이 어느 규격인지 구분할 수 없다. */
  it("제목으로 크기를 구분할 수 있다", () => {
    const titles = adProjectBodies({}, masters, "가을 사진전").map((body) => body.title);
    expect(new Set(titles).size).toBe(2);
    expect(titles[0]).toContain("2048");
  });

  it("공통 값을 그대로 실어 나른다", () => {
    const bodies = adProjectBodies({ variants: 3, look: "auto" }, masters, "가을");
    expect(bodies[0]).toMatchObject({ variants: 3, look: "auto" });
  });

  it("제목이 비어 있어도 이름을 준다", () => {
    expect(adProjectBodies({}, masters, "   ")[0]!.title.trim().length).toBeGreaterThan(0);
  });
});
