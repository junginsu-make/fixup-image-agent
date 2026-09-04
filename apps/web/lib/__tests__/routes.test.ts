import { describe, expect, it } from "vitest";
import { HOME_AFTER_LOGIN, publicOrigin, safeNext } from "../routes";

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
});
