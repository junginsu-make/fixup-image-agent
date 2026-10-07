import { describe, expect, it } from "vitest";
import { browserLabel, deviceLabel, mergeByLabel, pageLabel, providerLabel, sourceLabel } from "../analytics/labels";

describe("pageLabel", () => {
  it("정확히 같은 주소", () => {
    expect(pageLabel("/")).toBe("첫 화면");
    expect(pageLabel("/login")).toBe("로그인");
    expect(pageLabel("/poster")).toBe("이미지 만들기");
    expect(pageLabel("/auth/confirm")).toBe("메일 인증");
    expect(pageLabel("/ad")).toBe("광고 규격 만들기");
  });
  it("가장 긴 앞부분 + 나머지 조각", () => {
    expect(pageLabel("/guide/ad")).toBe("사용 설명서 · ad");
    expect(pageLabel("/library/:id")).toBe("라이브러리 · 하나 보기");
  });
  it("모르면 원래 주소", () => expect(pageLabel("/nothing/here")).toBe("/nothing/here"));
  it("키워드 소개 화면은 대표 검색어로(계획 2026-10-07 seo-keyword-pages)", () => {
    expect(pageLabel("/features")).toBe("기능 소개");
    expect(pageLabel("/features/cardnews")).toBe("기능 소개 · AI 카드뉴스 만들기");
  });
});

describe("sourceLabel", () => {
  it("기존 값 유지", () => {
    expect(sourceLabel("(direct)")).toContain("직접 방문");
    expect(sourceLabel("(unknown)")).toContain("확인 못 함");
  });
  it.each([
    ["instagram", "인스타그램"], ["l.instagram.com", "인스타그램"], ["Instagram.com", "인스타그램"],
    ["facebook", "페이스북"], ["m.facebook.com", "페이스북"], ["l.facebook.com", "페이스북"],
    ["youtube", "유튜브"], ["m.youtube.com", "유튜브"],
    ["naver", "네이버"], ["m.naver.com", "네이버"],
    ["search.naver.com", "네이버 검색"], ["m.search.naver.com", "네이버 검색"],
    ["blog.naver.com", "네이버 블로그"], ["m.blog.naver.com", "네이버 블로그"],
    ["google", "구글 검색"], ["google.com", "구글 검색"], ["google.co.kr", "구글 검색"],
    ["daum.net", "다음 검색"], ["search.daum.net", "다음 검색"], ["m.search.daum.net", "다음 검색"],
    ["kakao", "카카오톡"], ["kakaotalk", "카카오톡"],
    ["threads.net", "스레드"], ["threads.com", "스레드"],
    ["x.com", "X(트위터)"], ["t.co", "X(트위터)"], ["twitter.com", "X(트위터)"],
  ])("%s -> %s", (key, label) => expect(sourceLabel(key)).toBe(label));
  it("모르는 값은 그대로", () => expect(sourceLabel("example.org")).toBe("example.org"));
});

describe("기존 이름표", () => {
  it("그대로", () => {
    expect(deviceLabel("mobile")).toBe("휴대폰");
    expect(browserLabel("chrome")).toBe("크롬");
    expect(providerLabel("kakao")).toBe("카카오");
  });
});

describe("물려받은 이름은 이름표가 아니다", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])("%s 는 그대로", (key) => {
    expect(sourceLabel(key)).toBe(key);
    expect(deviceLabel(key)).toBe(key);
    expect(browserLabel(key)).toBe(key);
    expect(providerLabel(key)).toBe(key);
    expect(pageLabel(key)).toBe(key);
    expect(pageLabel(`/${key}`)).toBe(`/${key}`);
    expect(pageLabel(`/${key}/x`)).toBe(`/${key}/x`);
  });
});

describe("mergeByLabel", () => {
  it("같은 한글 이름의 줄을 합치고 순서를 다시 세운다", () => {
    const rows = [
      { key: "(direct)", views: 5, visitors: 4 },
      { key: "instagram", views: 3, visitors: 3 },
      { key: "naver.com", views: 2, visitors: 2 },
      { key: "l.instagram.com", views: 4, visitors: 2 },
      { key: "m.naver.com", views: 1, visitors: 1 },
      { key: "example.org", views: 3, visitors: 1 },
    ];
    expect(mergeByLabel(rows, sourceLabel, (row) => row.views)).toEqual([
      { key: "instagram", views: 7, visitors: 5 },
      { key: "(direct)", views: 5, visitors: 4 },
      { key: "naver.com", views: 3, visitors: 3 },
      { key: "example.org", views: 3, visitors: 1 },
    ]);
  });
  it("회원 수 목록도 합친다", () => {
    const rows = [{ key: "kakao", members: 1 }, { key: "youtube", members: 2 }, { key: "kakaotalk", members: 2 }];
    expect(mergeByLabel(rows, sourceLabel, (row) => row.members)).toEqual([
      { key: "kakao", members: 3 }, { key: "youtube", members: 2 },
    ]);
  });
  it("원래 배열을 바꾸지 않는다", () => {
    const rows = [{ key: "kakao", members: 1 }, { key: "kakaotalk", members: 2 }];
    mergeByLabel(rows, sourceLabel, (row) => row.members);
    expect(rows).toEqual([{ key: "kakao", members: 1 }, { key: "kakaotalk", members: 2 }]);
  });
});
