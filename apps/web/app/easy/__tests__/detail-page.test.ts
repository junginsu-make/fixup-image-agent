import { describe, expect, it } from "vitest";
import { DETAIL_PAGE_GUIDE, DETAIL_PAGE_HREF, isDetailPageGuide } from "../detail-page";
import { guideBody } from "../row-marks";

/**
 * **상세페이지는 「쉽게」에서 안 만든다 — 안내로 끝낸다**(설계 §2-7).
 *
 * 화면은 대화 표에 갈래를 더하지 않고, **이 문장과 똑같은 도우미 줄**에만
 * 단추를 단다. 그래서 판별이 느슨하면 아무 말에나 단추가 붙는다.
 */
describe("상세페이지 안내", () => {
  it("도우미가 남긴 그 문장에만 단추를 단다", () => {
    expect(isDetailPageGuide({ role: "assistant", body: DETAIL_PAGE_GUIDE })).toBe(true);
  });

  it("사용자가 같은 말을 쳐도 단추를 달지 않는다", () => {
    expect(isDetailPageGuide({ role: "user", body: DETAIL_PAGE_GUIDE })).toBe(false);
  });

  it("한 글자라도 다르면 달지 않는다 — 모델이 지은 비슷한 말", () => {
    expect(isDetailPageGuide({ role: "assistant", body: `${DETAIL_PAGE_GUIDE} ` })).toBe(false);
  });

  it("상세페이지 만들기 화면으로 보낸다", () => {
    expect(DETAIL_PAGE_HREF).toBe("/create");
  });

  /** 2차 D4 — 안내 문장은 AI 가 쓰고 단추는 표시로 단다. Review Focus 6 — 옛 완전일치 줄도 안내다. */
  it("AI 가 쓴 안내는 표시(guide:detail:)로 알아보고, 옛 완전일치 줄도 안내로 본다", () => {
    expect(isDetailPageGuide({ role: "assistant", body: guideBody("detail", "상세페이지는 「상세페이지 만들기」에서 만들어요.") })).toBe(true);
    expect(isDetailPageGuide({ role: "assistant", body: DETAIL_PAGE_GUIDE })).toBe(true);
    expect(isDetailPageGuide({ role: "user", body: guideBody("detail", "x") })).toBe(false);
    expect(isDetailPageGuide({ role: "assistant", body: guideBody("ad", "x") })).toBe(false);
  });
});
