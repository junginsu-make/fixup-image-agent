import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **문의 남기기는 실제로 보내야 한다**(2026-09-23 사용자 결정, 설계 §10).
 *
 * ── 왜 글을 읽는 시험인가 ──────────────────────────────────
 *
 * 이 저장소는 jsdom 이 없다(`vitest.config.ts`). `SidePanel` 은 Radix 포털을
 * 쓰므로 붙여서 눌러 볼 수 없다. **화면을 못 누르면 배선을 읽는다.**
 *
 * ── 왜 이 시험이 필요한가 ──────────────────────────────────
 *
 * 처음 만들 때 이 단추는 `/settings` 로 가는 그냥 링크였다. 표도 있고 문도
 * 있는데 **넣는 길만 없었다** — 사용자에게는 「문의 남기기」라고 적힌 것이
 * 아무 일도 안 하는 것이 가장 나쁘다. 보냈다고 믿고 답을 기다린다.
 */

const panel = readFileSync(new URL("../cs-panel.tsx", import.meta.url), "utf8");

describe("문의 남기기", () => {
  it("문의 라우트로 보낸다", () => {
    expect(panel).toContain('"/api/cs/inquiry"');
  });

  /**
   * **링크로 돌아가지 않는다.** 딴 화면으로 보내면 그 사람은 대화를 잃고
   * 처음부터 다시 적어야 한다.
   */
  it("딴 화면으로 떠넘기지 않는다", () => {
    expect(panel).not.toContain('href="/settings"');
  });

  /**
   * **대화는 번호만 보낸다**(`app/api/cs/inquiry/route.ts` 주석). 통째로
   * 보내게 하면 아무 글이나 「내 대화」로 넣을 수 있다.
   */
  it("대화를 통째로 싣지 않는다", () => {
    const 문의보내는곳 = panel.slice(panel.indexOf('"/api/cs/inquiry"'));
    const 몸통 = 문의보내는곳.slice(0, 문의보내는곳.indexOf("});"));

    expect(몸통).toContain("sessionId");
    expect(몸통, "대화를 통째로 보내고 있다").not.toContain("turns");
    expect(몸통, "대화를 통째로 보내고 있다").not.toContain("transcript");
  });

  /**
   * **근거도 화면이 정하지 않는다.** 그 주소는 관리자 화면에서 눌리는 링크가
   * 되므로, 화면이 보내면 회원이 관리자에게 링크를 먹일 수 있다.
   */
  it("근거를 보내지 않는다", () => {
    const 문의보내는곳 = panel.slice(panel.indexOf('"/api/cs/inquiry"'));
    const 몸통 = 문의보내는곳.slice(0, 문의보내는곳.indexOf("});"));

    expect(몸통, "근거를 화면이 정하고 있다").not.toContain("sources");
  });

  /** 보낸 결과를 말해 준다. 조용히 끝나면 보냈는지 알 수 없다. */
  it("보낸 결과를 화면에 보여 준다", () => {
    expect(panel).toContain("문의결과");
    expect(panel).toMatch(/문의결과 \?/);
  });

  /** 두 번 눌러 두 줄이 남지 않게 막는다. */
  it("보내는 동안 다시 못 누른다", () => {
    expect(panel).toContain("disabled={문의중}");
    expect(panel).toMatch(/if \(문의중\) return;/);
  });
});
