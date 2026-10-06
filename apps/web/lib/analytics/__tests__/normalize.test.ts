import { describe, expect, it } from "vitest";
import {
  browserFrom, clientIp, deviceFrom, isBot, isTrackedPath, normalizePath, referrerHost, utmFrom, utmOnly,
} from "../normalize";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_TAB = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const ANDROID_PHONE_SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36";
const KAKAO_INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const NAVER_INAPP = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.1)";
const WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0";
const WIN_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const MAC_FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0";

describe("normalizePath — 주소에 든 값은 남기지 않는다", () => {
  it("조회 값과 # 뒤를 지운다", () => {
    expect(normalizePath("/auth/confirm?token_hash=abc&type=signup")).toBe("/auth/confirm");
    expect(normalizePath("/reset-password#access_token=xyz")).toBe("/reset-password");
  });
  it("uuid·숫자·긴 토큰 조각을 :id 로 바꾼다", () => {
    expect(normalizePath("/library/3f2c9a1e-1b2c-4d5e-8f90-123456789abc")).toBe("/library/:id");
    expect(normalizePath("/characters/12345/edit")).toBe("/characters/:id/edit");
    expect(normalizePath("/share/aB3dE5fG7hJ9kL1m")).toBe("/share/:id");
  });
  it("평범한 이름 조각과 한글은 그대로 둔다", () => {
    expect(normalizePath("/guide/ad")).toBe("/guide/ad");
    expect(normalizePath("/create/poster")).toBe("/create/poster");
    expect(normalizePath("/guide/%EA%B4%91%EA%B3%A0")).toBe("/guide/광고");
  });
  it("/ 로 시작하지 않으면 버리고, 200자에서 자른다", () => {
    expect(normalizePath("https://evil.example/x")).toBeNull();
    expect(normalizePath("")).toBeNull();
    expect(normalizePath(`/${"a".repeat(300)}`)!.length).toBe(200);
  });
  it("끝 / 를 하나로 맞춘다", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/guide/")).toBe("/guide");
  });
});

describe("isTrackedPath — 관리자·API 는 세지 않는다", () => {
  it.each([["/admin", false], ["/admin/system", false], ["/api/track", false], ["/administrator", true], ["/", true], ["/guide", true]])(
    "%s → %s", (path, expected) => expect(isTrackedPath(path)).toBe(expected),
  );
});

describe("referrerHost — 들어오기 직전 사이트의 도메인만", () => {
  it("도메인만 남기고 www 를 뗀다", () => {
    expect(referrerHost("https://www.instagram.com/p/abc?igsh=secret", "formwith.fix-up.kr")).toBe("instagram.com");
    expect(referrerHost("https://search.naver.com/search.naver?query=카드뉴스", "formwith.fix-up.kr")).toBe("search.naver.com");
  });
  it("우리 사이트·빈 값·이상한 주소는 null", () => {
    expect(referrerHost("https://formwith.fix-up.kr/guide", "formwith.fix-up.kr")).toBeNull();
    expect(referrerHost("https://formwith.fix-up.kr/guide", "formwith.fix-up.kr:443")).toBeNull();
    expect(referrerHost("", "formwith.fix-up.kr")).toBeNull();
    expect(referrerHost(undefined, "formwith.fix-up.kr")).toBeNull();
    expect(referrerHost("android-app://com.google.android.gm/", "formwith.fix-up.kr")).toBeNull();
    expect(referrerHost("not a url", "formwith.fix-up.kr")).toBeNull();
  });
});

describe("utm — 광고 꼬리표만", () => {
  it("utm 셋만 남긴 조회 문자열을 만든다", () => {
    expect(utmOnly("?utm_source=Instagram&token=abc&utm_campaign=Launch")).toBe("utm_source=Instagram&utm_campaign=Launch");
    expect(utmOnly("?token=abc")).toBe("");
  });
  it("소문자로, 80자까지, 빈 값은 null", () => {
    expect(utmFrom("utm_source=Instagram&utm_medium=%20&utm_campaign=" + "x".repeat(100))).toEqual({
      source: "instagram", medium: null, campaign: "x".repeat(80),
    });
    expect(utmFrom("")).toEqual({ source: null, medium: null, campaign: null });
  });
});

describe("기기·브라우저", () => {
  it.each([[IPHONE, "mobile"], [ANDROID_PHONE_SAMSUNG, "mobile"], [IPAD, "tablet"], [ANDROID_TAB, "tablet"], [WIN_CHROME, "desktop"], [MAC_FIREFOX, "desktop"]])(
    "기기 %#", (ua, expected) => expect(deviceFrom(ua)).toBe(expected),
  );
  it.each([[KAKAO_INAPP, "kakaotalk"], [NAVER_INAPP, "naver"], [ANDROID_PHONE_SAMSUNG, "samsung"], [WIN_EDGE, "edge"], [MAC_FIREFOX, "firefox"], [WIN_CHROME, "chrome"], [IPHONE, "safari"], ["", "other"]])(
    "브라우저 %#", (ua, expected) => expect(browserFrom(ua)).toBe(expected),
  );
});

describe("isBot — 사람이 아닌 것은 뺀다", () => {
  it.each([
    "facebookexternalhit/1.1", "kakaotalk-scrap/1.0", "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
    "Mozilla/5.0 (compatible; Googlebot/2.1)", "Mozilla/5.0 HeadlessChrome/129.0", "Daum/4.1", "curl/8.5.0", "python-requests/2.32", "",
  ])("봇: %s", (ua) => expect(isBot(ua)).toBe(true));
  it.each([KAKAO_INAPP, NAVER_INAPP, IPHONE, WIN_CHROME, "Mozilla/5.0 (Linux; Android 14) DaumApps/6.0"])(
    "사람: %s", (ua) => expect(isBot(ua)).toBe(false),
  );
});

describe("clientIp — 앞단(Caddy)이 붙인 마지막 값", () => {
  const h = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });
  it("x-forwarded-for 의 마지막을 쓴다 — 앞쪽은 요청자가 지어낼 수 있다", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });
  it("없으면 x-real-ip, 그것도 없으면 null", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(h({}))).toBeNull();
  });
});
