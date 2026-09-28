import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_TTL_MS } from "../chat-store";

/**
 * **기록이 유지되는 규칙이 세 곳에 흩어져 있다**(2026-09-28 사용자 요청).
 *
 * > 페이지를 이동해도 유지 됐으면 합니다. 웹 브라우저를 아예 종료하거나
 * > 로그아웃 하거나, 24시간이 지나면 초기화 되는 기준이였으면 좋겠습니다.
 *
 * 화면(`chat-store.ts`)·서버(`session.ts`)·로그아웃 단추 셋이 같은 규칙을
 * 지켜야 한다. 하나만 어긋나도 사용자가 겪는 것은 제각각이다.
 */

const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("보관 기간", () => {
  /**
   * **서버가 먼저 잊으면 안 된다.**
   *
   * 화면에는 대화가 보이는데 서버가 잊었으면, 도우미는 앞의 말을 모른 채
   * 답한다 — 사용자에게는 그것이 「갑자기 멍청해졌다」로 보인다. 반대로 서버가
   * 더 오래 들고 있는 것은 해가 없다.
   */
  it("서버 보관이 화면 보관보다 짧지 않다", () => {
    const 서버 = read("lib/cs/session.ts");
    const 하루 = /24 \* 60 \* 60 \* 1000/;

    expect(서버, "서버가 여전히 한 시간만 들고 있다").toMatch(하루);
    expect(CHAT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  /** 사용자가 정한 값이다. 몰래 줄이면 안 된다. */
  it("화면 보관이 하루다", () => {
    expect(CHAT_TTL_MS).toBe(86_400_000);
  });
});

describe("초기화 조건", () => {
  /**
   * **로그아웃하면 지운다.**
   *
   * 남겨 두면 같은 브라우저를 쓰는 다음 사람이 앞사람의 대화를 본다 — 거기
   * 잔액이나 플랜 이야기가 있을 수 있다.
   *
   * 로그아웃 단추가 세 곳이라 **하나를 빠뜨리기 쉽다.** 네 번째가 생기면
   * 여기서 붉어진다.
   */
  it("로그아웃하는 모든 자리가 대화를 지운다", () => {
    const 훑는다 = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", "__tests__"].includes(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) 훑는다(path, out);
        else if (/\.tsx?$/.test(name)) out.push(path);
      }
      return out;
    };

    const 로그아웃하는곳 = 훑는다(join(web, "app"))
      .map((path) => ({ path, source: readFileSync(path, "utf8") }))
      // 서버 라우트는 브라우저 저장소를 못 만진다. 화면만 본다.
      .filter((file) => file.source.startsWith('"use client"'))
      .filter((file) => /auth\/signout|auth\.signOut\(\)/.test(file.source));

    expect(로그아웃하는곳.length, "로그아웃하는 화면을 못 찾았다").toBeGreaterThanOrEqual(3);

    const 안지우는곳 = 로그아웃하는곳
      .filter((file) => !file.source.includes("clearCsChat()"))
      .map((file) => file.path.slice(web.length + 1).replace(/\\/g, "/"));

    expect(
      안지우는곳,
      "여기서 로그아웃하면 도우미 대화가 남는다. `clearCsChat()` 을 부른다",
    ).toEqual([]);
  });

  /**
   * **브라우저를 종료하면 사라진다.** `sessionStorage` 가 그 일을 한다.
   * `localStorage` 로 바꾸면 껐다 켜도 남아서 사용자가 정한 조건이 깨진다.
   */
  it("브라우저 종료로 사라지는 창고를 쓴다", () => {
    const 창고 = read("lib/cs/chat-store.ts");

    // **주석은 뺀다.** 왜 `localStorage` 가 아닌지 적어 두는 것은 정당하다.
    const 코드만 = 창고.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(코드만).toContain("window.sessionStorage");
    expect(코드만, "localStorage 는 브라우저를 껐다 켜도 남는다").not.toContain("localStorage");
  });
});

describe("화면 배선", () => {
  const panel = read("app/_components/cs-panel.tsx");

  /** 꺼내지 않으면 저장해 봐야 소용이 없다. */
  it("열 때 저장해 둔 대화를 꺼낸다", () => {
    expect(panel).toContain("readCsChat");
    expect(panel, "꺼낸 번호를 안 쓰면 서버가 들고 있는 것을 못 찾는다")
      .toContain("sessionId.current = 남은것.sessionId");
  });

  /**
   * **부르는 자리를 본다.** import 줄만 보면 쓰지 않고 지워도 초록이다 —
   * 그러면 대화가 저장되지 않아 화면을 옮기는 순간 사라진다.
   */
  it("말이 오갈 때마다 적어 둔다", () => {
    const 부르는자리 = panel.indexOf("writeCsChat({");
    expect(부르는자리, "writeCsChat 을 부르는 자리가 없다").toBeGreaterThan(0);

    // 말이 바뀔 때마다 돌아야 한다. 한 번만 적으면 뒤의 대화를 잃는다.
    const 둘레 = panel.slice(Math.max(0, 부르는자리 - 300), 부르는자리 + 200);
    expect(둘레, "말이 바뀔 때 다시 적지 않는다").toContain("[turns]");
  });

  /**
   * **붙은 뒤에 꺼낸다.** 서버가 그린 첫 화면과 브라우저의 첫 화면이 달라지면
   * React 가 어긋난 것을 알린다.
   */
  it("첫 그리기에서 꺼내지 않는다", () => {
    // **부르는 자리**를 본다. import 줄도 `readCsChat` 을 적고 있어 그것에 속는다.
    const 부르는자리 = panel.indexOf("readCsChat()");
    expect(부르는자리, "readCsChat 을 부르는 자리가 없다").toBeGreaterThan(0);

    const 앞부분 = panel.slice(Math.max(0, 부르는자리 - 300), 부르는자리);
    expect(앞부분, "useEffect 밖에서 꺼내고 있다").toContain("React.useEffect");
  });
});

describe("입력칸", () => {
  const panel = read("app/_components/cs-panel.tsx");

  /**
   * **길게 쓰면 줄이 늘어난다**(2026-09-28 사용자 요청).
   *
   * 한 줄짜리 칸은 길게 쓰면 앞이 밀려 나가 안 보인다 — 자기가 무엇을 썼는지
   * 모르는 채로 보내게 된다.
   */
  it("한 줄 칸이 아니라 늘어나는 칸이다", () => {
    expect(panel, "아직 한 줄짜리 Input 을 쓰고 있다").toContain("<Textarea");
    expect(panel).toContain("rows={1}");
  });

  /** 내용만큼 자라려면 높이를 먼저 되돌려야 한다. 안 그러면 줄어들지 않는다. */
  it("내용만큼 자란다", () => {
    expect(panel).toContain("scrollHeight");
    expect(panel, "높이를 안 되돌리면 지워도 줄어들지 않는다").toMatch(/height = "0px"/);
  });

  /** 끝없이 자라면 대화가 화면 밖으로 밀린다. */
  it("너무 길면 스크롤로 넘긴다", () => {
    expect(panel).toMatch(/max-h-\[[\d.]+rem\]/);
    expect(panel).toContain("overflow-y-auto");
  });

  /**
   * **한글을 조합하는 중에는 안 보낸다.** 글자를 고르는 Enter 까지 보내기로
   * 먹으면 말이 잘린 채 나간다.
   */
  it("조합 중인 Enter 로 보내지 않는다", () => {
    expect(panel, "한글이 잘린 채 나간다").toContain("isComposing");
    expect(panel, "Shift+Enter 로 줄을 바꿀 수 없다").toContain("event.shiftKey");
  });
});
