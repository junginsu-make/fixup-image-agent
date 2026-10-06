import { describe, expect, it } from "vitest";
import { HOME_AFTER_LOGIN, publicOrigin, safeNext, signupRequiredPath } from "../routes";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("밖에서 보이는 주소 찾기", () => {
  it("프록시가 알려 준 host 를 쓴다", () => {
    // standalone 뒤에서 request.url 은 내부 주소(localhost:3000)다.
    // 그대로 쓰면 로그인으로 돌려보낼 때 사용자를 localhost 로 보낸다.
    expect(publicOrigin(headers({
      "x-forwarded-host": "54.180.68.212",
      "x-forwarded-proto": "http",
    }), "http://localhost:3000")).toBe("http://54.180.68.212");
  });

  it("x-forwarded-host 가 없으면 host 를 본다", () => {
    expect(publicOrigin(headers({ host: "54.180.68.212" }), "http://localhost:3000"))
      .toBe("http://54.180.68.212");
  });

  it("proto 를 안 알려 주면 물려받은 것을 쓴다", () => {
    expect(publicOrigin(headers({ host: "studio.example.com" }), "https://localhost:3000"))
      .toBe("https://studio.example.com");
  });

  it("프록시가 여럿이면 맨 앞이 원래 주소다", () => {
    expect(publicOrigin(headers({
      "x-forwarded-host": "studio.example.com, inner.local",
      "x-forwarded-proto": "https, http",
    }), "http://localhost:3000")).toBe("https://studio.example.com");
  });

  it("아무 단서도 없으면 물려받은 것을 그대로 쓴다", () => {
    expect(publicOrigin(headers({}), "http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("이상한 host 는 믿지 않는다", () => {
    // host 는 요청자가 마음대로 넣을 수 있다. 주소 모양이 아니면 버린다.
    expect(publicOrigin(headers({ host: "evil.example.com/path" }), "http://localhost:3000"))
      .toBe("http://localhost:3000");
    expect(publicOrigin(headers({ host: "" }), "http://localhost:3000"))
      .toBe("http://localhost:3000");
  });
});

describe("로그인 뒤 처음 열리는 곳", () => {
  it("사용 설명서다", () => {
    // 만들기부터 열면 무엇을 하는 도구인지 모르는 채로 시작한다. 라이브러리도
    // 도구를 아는 사람에게나 쓸모가 있다. 설명서를 먼저 보이고, 거기서 각
    // 도구로 들어가게 한다.
    expect(HOME_AFTER_LOGIN).toBe("/guide");
  });
});

describe("가려던 곳으로 돌려보내기", () => {
  it("원래 가려던 화면이 있으면 그리로", () => {
    expect(safeNext("/sns/abc")).toBe("/sns/abc");
  });

  it("없으면 처음 열리는 곳으로", () => {
    // 값을 여기 또 적지 않는다. 첫 화면이 바뀌면 이 시험도 따라와야 한다.
    expect(safeNext(null)).toBe(HOME_AFTER_LOGIN);
    expect(safeNext("")).toBe(HOME_AFTER_LOGIN);
  });

  it("바깥 주소로는 보내지 않는다", () => {
    // //evil.example.com 은 브라우저가 다른 사이트로 읽는다.
    expect(safeNext("//evil.example.com")).toBe(HOME_AFTER_LOGIN);
    expect(safeNext("https://evil.example.com")).toBe(HOME_AFTER_LOGIN);
    expect(safeNext("evil.example.com")).toBe(HOME_AFTER_LOGIN);
  });

  it("역슬래시로 시작하는 것도 바깥 주소다 (2026-09-30 독립 리뷰)", () => {
    // 브라우저는 경로의 역슬래시를 슬래시로 바꿔 읽는다 — `/\evil.example.com` 은
    // `//evil.example.com` 이 되어 로그인 뒤 router.replace 가 다른 사이트로 보냈다.
    expect(safeNext("/\\evil.example.com")).toBe(HOME_AFTER_LOGIN);
    expect(safeNext("/\\\\evil.example.com")).toBe(HOME_AFTER_LOGIN);
  });

  /**
   * **탭·줄바꿈도 바깥 주소다** (2026-10-06 조사).
   *
   * 주소를 읽을 때 브라우저와 `new URL` 은 탭·줄바꿈을 지운다 — `/<탭>/evil` 은
   * `//evil` 이 되어 다른 사이트로 간다. 메일 인증 링크(`auth/confirm`)에서
   * 실제로 `https://evil.example.com/` 으로 보내는 것을 재현했다.
   */
  it.each([
    ["탭", "/\t/evil.example.com"],
    ["줄바꿈", "/\n/evil.example.com"],
    ["캐리지 리턴", "/\r/evil.example.com"],
    ["널", "/\u0000/evil.example.com"],
    ["DEL", "/\u007f/evil.example.com"],
  ])("%s 이 섞여도 바깥으로 보내지 않는다", (_label, next) => {
    expect(safeNext(next)).toBe(HOME_AFTER_LOGIN);
  });

  it("돌려준 값을 우리 주소에 붙이면 언제나 우리 사이트다", () => {
    const base = "https://formwith.example";
    const tricky = [
      "/\t/evil.example.com", "/\n\n/evil.example.com", "/\\evil.example.com", "//evil.example.com",
      "/./\t/evil.example.com", "/%09/evil.example.com", "/ /evil.example.com", "/sns/abc?x=1#y",
      // 점 경로는 풀면 `//evil` 이 된다 — 출처는 같아도 경로가 바깥 주소 모양이다(보안 리뷰).
      "/.//evil.example.com", "/..//evil.example.com", "/a/..//evil.example.com", "/%2e%2e//evil.example.com",
    ];
    for (const next of tricky) {
      const resolved = new URL(safeNext(next), base);
      expect(resolved.origin, JSON.stringify(next)).toBe(base);
      expect(resolved.pathname.startsWith("//"), JSON.stringify(next)).toBe(false);
    }
  });

  it("퍼센트 인코딩된 역슬래시는 그대로 둔다 — 풀어보지 않으니 안전하다", () => {
    // `%5C` 는 글자 그대로 남는다. 이 함수가 디코딩해서 판정하지 않는 한
    // 브라우저는 이것을 같은 자리의 경로로 읽는다(다른 사이트로 가지 않는다).
    expect(safeNext("/%5Cevil.example.com")).toBe("/%5Cevil.example.com");
  });
});

describe("비회원 안내 주소 (설계 §3.5)", () => {
  it("첫 화면에 안내 표시와 가려던 곳을 싣는다", () => {
    expect(signupRequiredPath("/create")).toBe("/?signup=required&next=%2Fcreate");
  });

  it("하위 경로도 그대로 싣는다", () => {
    expect(signupRequiredPath("/sns/abc123")).toBe("/?signup=required&next=%2Fsns%2Fabc123");
  });
});
