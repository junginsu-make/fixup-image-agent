import { afterEach, describe, expect, it, vi } from "vitest";
import { HOME_AFTER_LOGIN, publicOrigin, safeNext, canonicalOrigin } from "../routes";
afterEach(()=>vi.unstubAllEnvs());
describe("canonical origin",()=>{
  it("uses configured HTTPS in production regardless of forwarded headers",()=>{
    vi.stubEnv("NODE_ENV","production");vi.stubEnv("NEXT_PUBLIC_SITE_URL","https://studio.example.com");
    expect(publicOrigin(new Headers({host:"attacker.example"}),"http://localhost:3000")).toBe("https://studio.example.com");
  });
  it("preserves the actual loopback development port",()=>{
    vi.stubEnv("NODE_ENV","development");vi.stubEnv("NEXT_PUBLIC_SITE_URL","https://studio.example.com");
    expect(publicOrigin(new Headers({host:"attacker.example"}),"http://localhost:3407")).toBe("http://localhost:3407");
  });
  it("rejects absent, HTTP, credentials and non-origin production configuration",()=>{
    for(const input of [undefined,"http://studio.example.com","https://user:pass@studio.example.com","https://studio.example.com/path","https://studio.example.com?x=1","https://studio.example.com#x"])
      expect(()=>canonicalOrigin(input,true)).toThrow();
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
