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
    expect(html).toContain("유튜브");
    expect(html).toContain("확인 못 함");
  });
  it("준비 전이면 null 을 받아도 깨지지 않는다", () => {
    expect(renderToStaticMarkup(<PeoplePanel report={null} />)).toContain("읽지 못했습니다");
  });
});

const empty = {
  ...traffic, todayVisitors: 0, visitorDays: 0, views: 0, members: 0, sessions: 0, avgSessionSeconds: 0, avgViewsPerSession: 0,
  consentRate: 0, knownBrowsers: 0, returningBrowsers: 0,
  daily: [], sources: [], campaigns: [], landingPages: [], pages: [], devices: [], browsers: [],
};

describe("증감 배지", () => {
  it("지난 기간보다 늘면 ▲ 와 앞선 값", () => {
    const html = renderToStaticMarkup(<TrafficPanel report={traffic} previous={{ ...traffic, visitorDays: 2, members: 4, views: 6 }} />);
    expect(html).toContain("▲ 100%");
    expect(html).toContain("▼ 50%");
    expect(html).toContain("변화 없음");
    expect(html).toContain("앞선 7일(같은 시각까지) 2명");
    expect(html).toContain("앞선 7일(같은 시각까지) 4명");
    expect(html).toContain("앞선 7일(같은 시각까지) 6번");
  });
  it("지난 기간이 0 이면 「새로 생김」, 무한대·NaN 은 없다", () => {
    const html = renderToStaticMarkup(<TrafficPanel report={traffic} previous={empty} />);
    expect(html).toContain("새로 생김");
    expect(html).not.toMatch(/Infinity|NaN/);
  });
  it("지난 기간 null 이면 기간 증감 배지가 없다", () => {
    const oneDay = { ...traffic, daily: [traffic.daily[1]!] };
    const html = renderToStaticMarkup(<TrafficPanel report={oneDay} previous={null} />);
    expect(html).not.toMatch(/▲|▼|새로 생김|변화 없음|앞선/);
  });
  it("오늘 방문자는 배지 없이 어제 하루 숫자만 곁들인다", () => {
    const html = renderToStaticMarkup(<TrafficPanel report={traffic} previous={null} />);
    expect(html).toContain("어제 하루 1명");
    expect(html).not.toMatch(/▲|▼|새로 생김|변화 없음/);
  });
  it("오늘 방문자는 지난 기간이 있어도 배지가 없다", () => {
    const html = renderToStaticMarkup(<TrafficPanel report={traffic} previous={traffic} />);
    const today = html.slice(html.indexOf("오늘 방문자"), html.indexOf("하루 단위 합"));
    expect(today).toContain("어제 하루 1명");
    expect(today).not.toMatch(/▲|▼|새로 생김|변화 없음/);
  });
  it("활동 회원도 증감과 앞선 값을 보인다", () => {
    const html = renderToStaticMarkup(<PeoplePanel report={people} previous={{ ...people, activeMembers: 1 }} />);
    expect(html).toContain("▲ 100%");
    expect(html).toContain("앞선 7일(같은 시각까지) 1명");
  });
});

describe("방문 그래프", () => {
  it("요약 aria-label 에 최고·합계, 막대마다 title", () => {
    const html = renderToStaticMarkup(<TrafficPanel report={traffic} />);
    expect(html).toContain('role="img"');
    expect(html).toContain("최근 2일 방문자, 최고 2명(10/06), 합계 3");
    expect(html).toContain("<title>10/06 방문 2 · 회원 1 · 가입 1</title>");
    expect(html).toContain("10/05");
  });
  it("모든 날이 0 명이어도 깨지지 않는다", () => {
    const daily = ["2026-10-04", "2026-10-05", "2026-10-06"].map((day) => ({ day, visitors: 0, members: 0, views: 0, signups: 0 }));
    const html = renderToStaticMarkup(<TrafficPanel report={{ ...empty, days: 3, daily }} />);
    expect(html).toContain("최근 3일 방문자, 최고 0명, 합계 0");
    expect(html).not.toContain("fill-primary");
    expect(html).not.toMatch(/Infinity|NaN/);
  });
  it("빈 데이터에서도 깨지지 않는다", () => {
    const html = renderToStaticMarkup(<><TrafficPanel report={empty} previous={empty} /><SourcesPanel report={empty} /></>);
    expect(html).toContain("기록이 없습니다");
    expect(html).not.toMatch(/Infinity|NaN/);
  });
  it("날짜는 최대 7개", () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, visitors: i, members: 0, views: i, signups: 0 }));
    const html = renderToStaticMarkup(<TrafficPanel report={{ ...traffic, days: 30, daily }} />);
    const axis = html.slice(html.indexOf('data-axis="days"'));
    expect(axis.match(/09\/\d\d</g)).toHaveLength(7);
    expect(axis).toContain("09/01");
    expect(axis).toContain("09/30");
  });
});

describe("비율 막대 목록", () => {
  it("화면 이름은 한글, 원래 주소는 작은 글씨", () => {
    const html = renderToStaticMarkup(<SourcesPanel report={traffic} />);
    expect(html).toContain("상세페이지 만들기");
    expect(html).toContain("/create");
    expect(html).toContain("67%");
  });
  it("8개 넘으면 「더 보기」", () => {
    const sources = Array.from({ length: 10 }, (_, i) => ({ key: `site${i}.example`, views: 10 - i, visitors: 1 }));
    const html = renderToStaticMarkup(<SourcesPanel report={{ ...traffic, sources }} />);
    expect(html).toContain("더 보기 (2개)");
  });
  it("기능은 쓴 회원·실패를 작은 글씨로", () => {
    expect(renderToStaticMarkup(<PeoplePanel report={people} />)).toContain("쓴 회원 1명 · 실패 1번");
  });
});

describe("읽기 좋게", () => {
  it("한글 라벨은 낱말 가운데서 안 끊고, 이메일은 아무 데서나 끊는다", () => {
    const tiles = renderToStaticMarkup(<TrafficPanel report={traffic} />);
    const label = tiles.slice(0, tiles.indexOf("최근 7일 들어온 회원"));
    expect(label.slice(label.lastIndexOf("<dt"))).toContain("break-keep");
    const list = renderToStaticMarkup(<SourcesPanel report={traffic} />);
    expect(list).toMatch(/class="[^"]*break-keep[^"]*\[overflow-wrap:anywhere\][^"]*">크롬|class="[^"]*break-keep[^"]*\[overflow-wrap:anywhere\][^"]*">카카오톡 앱 안/);
    expect(renderToStaticMarkup(<PeoplePanel report={people} />)).toMatch(/class="[^"]*break-all[^"]*">kim@example.invalid/);
  });
  it("증감 배지는 어두운 화면용 색이 따로 있다", () => {
    const up = renderToStaticMarkup(<TrafficPanel report={traffic} previous={{ ...traffic, visitorDays: 2, members: 4 }} />);
    expect(up).toMatch(/dark:bg-emerald-[^"]*">▲/);
    expect(up).toMatch(/dark:text-red-[^"]*">▼|dark:bg-red-[^"]*">▼/);
  });
  it("상위 20개만 받는 목록에는 비율 범위를 적는다", () => {
    const html = renderToStaticMarkup(<SourcesPanel report={traffic} />);
    expect(html.match(/상위 20개 안에서의 비율/g)).toHaveLength(3);
  });
});

describe("같은 이름 합치기와 겹치는 작은 글씨", () => {
  it("들어온 경로는 같은 한글 이름을 한 줄로", () => {
    const sources = [{ key: "instagram", views: 2, visitors: 2 }, { key: "(direct)", views: 2, visitors: 2 }, { key: "l.instagram.com", views: 1, visitors: 1 }];
    const html = renderToStaticMarkup(<SourcesPanel report={{ ...traffic, sources }} />);
    expect(html.match(/>인스타그램</g)).toHaveLength(1);
    expect(html).toContain("3번");
  });
  it("가입자 첫 경로도 같은 한글 이름을 한 줄로", () => {
    const signupSources = [{ key: "kakao", members: 1 }, { key: "kakaotalk", members: 2 }];
    const html = renderToStaticMarkup(<PeoplePanel report={{ ...people, signupSources }} />);
    expect(html.match(/>카카오톡</g)).toHaveLength(1);
    expect(html).toContain("3명");
  });
  it("들어온 횟수와 방문자가 같으면 방문자 글씨를 빼고, 다르면 둔다", () => {
    expect(renderToStaticMarkup(<SourcesPanel report={traffic} />).match(/방문자 \d+명/g)).toEqual(["방문자 1명"]);
    const html = renderToStaticMarkup(<SourcesPanel report={{ ...traffic, sources: [{ key: "(direct)", views: 3, visitors: 2 }] }} />);
    expect(html).toContain("방문자 2명");
  });
});

describe("pickDays", () => {
  it.each([["7", 7], ["30", 30], ["90", 90], [undefined, 30], ["365", 30], ["abc", 30]])("%s → %s", (raw, expected) =>
    expect(pickDays(raw)).toBe(expected));
});
