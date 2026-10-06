import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * **방문 분석 화면이 무엇을 말하나**(계획 2026-10-06 site-analytics).
 * 준비 전 안내, 「하루 단위」·동의율 한계 문구, 이름표, 가입자 첫 유입, 회원·기능 표.
 */
vi.mock("server-only", () => ({}));
const { TrafficPanel } = await import("../analytics/traffic-panel");
const { SourcesPanel } = await import("../analytics/sources-panel");
const { PeoplePanel } = await import("../analytics/people-panel");
const { pickDays } = await import("../analytics/range");

const traffic = {
  days: 7, todayVisitors: 2, visitorDays: 4, views: 6, members: 2, sessions: 5, avgSessionSeconds: 150, avgViewsPerSession: 1.2,
  consentRate: 0.5, knownBrowsers: 1, returningBrowsers: 1,
  daily: [{ day: "2026-10-05", visitors: 1, members: 1, views: 1, signups: 0 }, { day: "2026-10-06", visitors: 2, members: 1, views: 4, signups: 1 }],
  sources: [{ key: "(direct)", views: 2, visitors: 2 }, { key: "instagram", views: 1, visitors: 1 }],
  campaigns: [{ key: "launch", views: 1, visitors: 1 }], landingPages: [{ key: "/", views: 3, visitors: 3 }],
  pages: [{ key: "/create", views: 1, visitors: 1 }], devices: [{ key: "mobile", views: 3, visitors: 1 }], browsers: [{ key: "kakaotalk", views: 3, visitors: 1 }],
};
const people = {
  days: 7, activeMembers: 2, newMembers: 1, withReferral: 1, byProvider: [{ key: "kakao", members: 1 }],
  signupSources: [{ key: "youtube", members: 1 }, { key: "(unknown)", members: 1 }],
  features: [{ key: "poster", calls: 2, users: 1, failed: 1 }],
  topMembers: [{ id: "u1", email: "kim@example.invalid", name: "김", views: 2, calls: 2, lastSeen: "2026-10-06T02:00:00+00:00" }],
};

describe("TrafficPanel", () => {
  it("준비 전이면 무엇을 먼저 해야 하는지 말한다", () => {
    expect(renderToStaticMarkup(<TrafficPanel report={null} />)).toContain("202610060002");
  });
  it("오늘 방문자·평균 머문 시간·동의율·하루 단위 한계를 보인다", () => {
    const html = renderToStaticMarkup(<TrafficPanel report={traffic} />);
    expect(html).toContain("오늘 방문자");
    expect(html).toContain("2분 30초");
    expect(html).toContain("50%");
    expect(html).toContain("하루 단위");
  });
});

describe("SourcesPanel", () => {
  it("직접 방문·기기·브라우저를 우리말로", () => {
    const html = renderToStaticMarkup(<SourcesPanel report={traffic} />);
    expect(html).toContain("직접 방문");
    expect(html).toContain("휴대폰");
    expect(html).toContain("카카오톡");
  });
});

describe("PeoplePanel", () => {
  it("기능 이름표·회원 이메일·가입 방법·가입자 첫 유입", () => {
    const html = renderToStaticMarkup(<PeoplePanel report={people} />);
    expect(html).toContain("포스터 · 그림");
    expect(html).toContain("kim@example.invalid");
    expect(html).toContain("카카오");
    expect(html).toContain("가입자가 처음 들어온 경로");
    expect(html).toContain("유튜브 1명");
    expect(html).toContain("확인 못 함");
  });
  it("준비 전이면 null 을 받아도 깨지지 않는다", () => {
    expect(renderToStaticMarkup(<PeoplePanel report={null} />)).toContain("읽지 못했습니다");
  });
});

describe("pickDays", () => {
  it.each([["7", 7], ["30", 30], ["90", 90], [undefined, 30], ["365", 30], ["abc", 30]])("%s → %s", (raw, expected) =>
    expect(pickDays(raw)).toBe(expected));
});
