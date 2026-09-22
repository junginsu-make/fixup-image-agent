import { describe, expect, it } from "vitest";
import { MATCH_SOURCE } from "@fixup/sns-core";
import {
  adProjectBodies, canCreatePoster, effectiveRatio, planSlotRows, posterSpecSections, projectCount, showsTypeInteraction, splitFilledSlots,
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
    styleCount: 1, referenceCount: 1, instruction: "가을 사진전 포스터", estimateRejected: false,
    overReferenceLimit: false, adMode: false, adReady: false,
  };

  it("일반 모드는 광고 상태와 무관하다", () => {
    expect(canCreatePoster(ok)).toBe(true);
  });

  /**
   * **레퍼런스 없이도 만들 수 있다.**
   *
   * 예전에는 여기서 막혔다 — 「따라 만들 그림」이 첫 단계라 글만으로는 시작조차
   * 못 했다(2026-09-16 사용자 보고). 그런데 엔진은 진작부터 할 줄 알았다:
   * `pickEndpoint` 가 첨부 유무로 t2i·i2i 를 갈라 부르고, 값도 `pricing.ts` 가
   * 따로 잡고, 프롬프트도 `if (!images.length) return []` 로 비워 보낸다.
   * 막고 있던 것은 이 버튼과 스키마뿐이었다.
   */
  it("그림이 없어도 누를 수 있다", () => {
    expect(canCreatePoster({ ...ok, styleCount: 0, referenceCount: 0 })).toBe(true);
  });

  /**
   * **광고 모드는 예외다.** 비율을 `match-source` 로 보내 첨부한 그림의 크기를
   * 그대로 따라가는데(`effectiveRatio`), 맞출 원본이 없으면 성립하지 않는다.
   */
  it("광고 모드는 그림이 있어야 한다", () => {
    expect(canCreatePoster({ ...ok, styleCount: 0, adMode: true, adReady: true })).toBe(false);
    expect(canCreatePoster({ ...ok, styleCount: 1, adMode: true, adReady: true })).toBe(true);
  });

  /**
   * **그림만으로도 만들 수 있다** (2026-09-22 사용자 보고).
   *
   * 글만으로 만드는 길은 2026-09-16 에 열었는데 그 반대는 막혀 있었다. 01 지시를
   * 비운 채 레퍼런스부터 붙이고 「이 그림들을 어떻게 쓸까요」에 적는 사람이 있다.
   */
  it("지시가 비어도 그림이 있으면 누를 수 있다", () => {
    expect(canCreatePoster({ ...ok, instruction: "   " })).toBe(true);
  });

  /**
   * **지키려고 붙인 그림도 근거다.**
   *
   * `styleCount` 로 재면 제품·인물을 지키려고만 붙인 사람이 막힌다 — 그 사람도
   * 화면에는 그림을 붙여 놨다.
   */
  it("따라 만들기가 없어도 지킬 그림이 있으면 누를 수 있다", () => {
    expect(canCreatePoster({ ...ok, instruction: "", styleCount: 0, referenceCount: 1 })).toBe(true);
  });

  /** 글도 그림도 없으면 무엇을 그릴지 말해 주는 것이 프롬프트에 한 줄도 없다. */
  it("지시도 그림도 없으면 못 누른다", () => {
    expect(canCreatePoster({ ...ok, instruction: "   ", styleCount: 0, referenceCount: 0 })).toBe(false);
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


/**
 * 기획 확인에서 어떤 칸을 바로 보여줄까 (2026-09-08 사용자 결정).
 *
 * 칸 열한 개가 늘 다 보였다. 글자가 하나도 없는 그림인데 「글자와 피사체의
 * 관계」가 버젓이 있었고, 그 화면 하나가 페이지를 통째로 썼다.
 */
describe("채운 칸과 빈 칸을 가른다", () => {
  const value: Record<string, string> = { scene: "강가 바위", subject: "청년 다섯", kind: "  " };

  it("값이 있는 칸과 없는 칸으로 나눈다", () => {
    const { filled, empty } = splitFilledSlots(
      ["scene", "subject", "kind", "action"],
      (field) => value[field] ?? "",
    );
    expect(filled).toEqual(["scene", "subject"]);
    expect(empty).toEqual(["kind", "action"]);
  });

  it("공백만 있는 칸은 빈 칸이다", () => {
    // 기획이 실패하면 공백이 들어오기도 한다. 그걸 「채웠다」로 보면 안 된다.
    const { filled } = splitFilledSlots(["kind"], (field) => value[field] ?? "");
    expect(filled).toEqual([]);
  });

  it("차례는 그대로 지킨다 — 화면 순서가 매번 달라지면 안 된다", () => {
    const { filled } = splitFilledSlots(["subject", "scene"], (field) => value[field] ?? "");
    expect(filled).toEqual(["subject", "scene"]);
  });

  it("아무것도 없으면 둘 다 빈 목록", () => {
    expect(splitFilledSlots([], () => "")).toEqual({ filled: [], empty: [] });
  });
});

describe("글자와 피사체의 관계를 보여줄까", () => {
  it("글자가 하나도 없으면 안 보여준다 — 관계를 맺을 대상이 없다", () => {
    expect(showsTypeInteraction({ headline: "", subline: "", sideTexts: [] })).toBe(false);
    expect(showsTypeInteraction({})).toBe(false);
  });

  it("헤드라인이 있으면 보여준다", () => {
    expect(showsTypeInteraction({ headline: "가을, 셔터를 누르다" })).toBe(true);
  });

  it("곁텍스트만 있어도 보여준다", () => {
    expect(showsTypeInteraction({ sideTexts: ["28MM F2.0"] })).toBe(true);
  });

  it("**이미 고른 값이 있으면 글자가 없어도 보여준다**", () => {
    // 안 그러면 글자를 지우는 순간 고른 값이 화면에서 사라져 되돌릴 수 없다.
    expect(showsTypeInteraction({ typeInteraction: "통과" })).toBe(true);
  });

  it("빈 곁텍스트 줄은 글자로 안 본다", () => {
    expect(showsTypeInteraction({ sideTexts: ["", "  "] })).toBe(false);
  });
});

/**
 * 기획 확인 패널의 칸 차례 (2026-09-17 사용자 보고).
 *
 * 채운 칸을 위로 모아 놓았더니, **빈 칸에 글자를 넣는 순간 그 칸이 위로
 * 올라가고 커서가 빠졌다.** 한 글자 적을 때마다 화면이 뒤집히는 셈이다.
 *
 * 차례는 언제나 정해진 순서 그대로 두고, 채운 칸과 빈 칸은 **자리가 아니라
 * 모양으로** 가른다.
 */
describe("기획 확인 패널에 그릴 칸", () => {
  const FIELDS = ["kind", "headline", "subline", "scene"] as const;
  const value: Record<string, string> = { kind: "포스터", subline: "가을 밤", headline: "  " };
  const valueOf = (field: (typeof FIELDS)[number]) => value[field] ?? "";

  it("**차례가 정해진 순서 그대로다** — 채웠다고 위로 오지 않는다", () => {
    const rows = planSlotRows([...FIELDS], valueOf, { showEmpty: true });
    expect(rows.map((row) => row.field)).toEqual(["kind", "headline", "subline", "scene"]);
  });

  it("빈 칸인지 함께 알려준다 — 모양으로 가르는 쪽이 화면의 일이다", () => {
    const rows = planSlotRows([...FIELDS], valueOf, { showEmpty: true });
    expect(rows.map((row) => row.empty)).toEqual([false, true, false, true]);
  });

  it("접어 두면 빈 칸은 빠지되, 남는 칸의 차례는 그대로다", () => {
    const rows = planSlotRows([...FIELDS], valueOf, { showEmpty: false });
    expect(rows.map((row) => row.field)).toEqual(["kind", "subline"]);
  });

  it("**한 번 보인 칸은 비워도 안 사라진다** — 지우는 중에 칸이 없어지면 안 된다", () => {
    const rows = planSlotRows([...FIELDS], valueOf, { showEmpty: false, keep: ["headline"] });
    expect(rows.map((row) => row.field)).toEqual(["kind", "headline", "subline"]);
    expect(rows.find((row) => row.field === "headline")?.empty).toBe(true);
  });

  it("칸이 없으면 빈 목록", () => {
    expect(planSlotRows([], () => "", { showEmpty: true })).toEqual([]);
  });
});
