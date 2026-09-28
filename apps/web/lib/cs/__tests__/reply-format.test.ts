import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { breakLongParagraph, formatReply, tidyReply } from "../reply-format";

/**
 * **답이 한 줄로 쭉 나오던 것**(2026-09-28 사용자 신고).
 *
 * > 지금 챗에 결과물들이 한 줄로만 쭉 나오고 있습니다. 그래서 가독성이 매우
 * > 떨어집니다.
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * **모양만 바뀌고 낱말은 그대로인가.** 다듬는다면서 글자를 잃으면 근거대로
 * 답한다는 약속이 깨진다.
 */

describe("모양 다듬기", () => {
  it("**굵게 표시를 걷어 낸다** — 화면은 별표를 그대로 그린다", () => {
    expect(tidyReply("이미지 **1장**에 1크레딧입니다.")).toBe("이미지 1장에 1크레딧입니다.");
    expect(tidyReply("__밑줄__도 걷는다")).toBe("밑줄도 걷는다");
  });

  it("**곱셈 별표는 건드리지 않는다**", () => {
    expect(tidyReply("카드 6장 * 1크레딧")).toBe("카드 6장 * 1크레딧");
  });

  it("**목록 표시를 가운뎃점으로 맞춘다**", () => {
    expect(tidyReply("- 첫째\n- 둘째")).toBe("· 첫째\n· 둘째");
    expect(tidyReply("* 별표도")).toBe("· 별표도");
  });

  /** 차례가 있는 것은 번호가 맞다. */
  it("**번호는 그대로 둔다**", () => {
    expect(tidyReply("1. 사진을 올립니다\n2. 분석을 시작합니다")).toBe("1. 사진을 올립니다\n2. 분석을 시작합니다");
  });

  it("**빈 줄이 여럿이면 하나로 줄인다**", () => {
    expect(tidyReply("첫 줄\n\n\n\n둘째 줄")).toBe("첫 줄\n\n둘째 줄");
  });

  it("**줄 끝 빈칸을 턴다**", () => {
    expect(tidyReply("첫 줄   \n둘째 줄  ")).toBe("첫 줄\n둘째 줄");
  });

  it("**앞뒤 빈 줄을 턴다**", () => {
    expect(tidyReply("\n\n답입니다.\n\n")).toBe("답입니다.");
  });

  it("**글이 아니면 빈 글자다**", () => {
    expect(tidyReply(undefined as never)).toBe("");
    expect(tidyReply(12 as never)).toBe("");
  });

  /** 좁은 칸에서 끝없이 이어지면 읽히지 않는다. */
  it("**너무 길면 자른다**", () => {
    const 긴것 = Array.from({ length: 40 }, (_, i) => `${i}번째 줄`).join("\n");

    expect(tidyReply(긴것).split("\n").length).toBe(20);
  });
});

describe("한 덩어리로 온 글", () => {
  /**
   * **이것이 사용자가 본 그 화면이다.** 모델이 줄을 안 나눠 보냈고 화면도
   * 줄바꿈을 버려서 한 문단이 통째로 쏟아졌다.
   */
  it("**문장마다 끊는다**", () => {
    const 한덩어리 =
      "상세페이지 만들기는 상품 사진에서 출발합니다. 사진 1장을 올리고 분석을 시작하면 섹션이 만들어집니다. " +
      "이후 편집 화면에서 문구를 이미지 위에 얹어 내보냅니다. 구매 버튼은 이미지에 그리지 않습니다.";

    const 나온것 = breakLongParagraph(한덩어리);

    expect(나온것.split("\n").length, "안 끊었다").toBe(4);
    // **낱말은 그대로다.** 다듬는다면서 글자를 잃으면 안 된다.
    expect(나온것.replace(/\n/g, " ")).toBe(한덩어리);
  });

  /** 두세 문장짜리를 굳이 쪼개면 뚝뚝 끊겨 보인다. */
  it("**짧으면 그대로 둔다**", () => {
    const 짧은것 = "이미지 1장에 1크레딧입니다. 모델을 무엇으로 고르든 같습니다.";

    expect(breakLongParagraph(짧은것)).toBe(짧은것);
  });

  it("**이미 줄이 있으면 손대지 않는다**", () => {
    const 이미나뉜것 = "첫 줄입니다.\n둘째 줄입니다. 셋째 문장입니다. 넷째 문장입니다. 다섯째입니다.";

    expect(breakLongParagraph(이미나뉜것)).toBe(이미나뉜것);
  });

  /** 숫자 사이의 점은 문장 끝이 아니다. */
  it("**소수점에서 끊지 않는다**", () => {
    const 글 = "가로세로 1.5배입니다. 그래서 2크레딧입니다. 큰 그림이기 때문입니다. 인쇄용입니다.";

    expect(breakLongParagraph(글).split("\n")[0]).toBe("가로세로 1.5배입니다.");
  });
});

describe("화면에 놓기 전", () => {
  it("**걷어 내고 끊는 일을 한 번에 한다**", () => {
    const 모델이보낸것 =
      "**상세페이지**는 사진에서 출발합니다. 사진을 올립니다. 분석이 섹션을 만듭니다. 문구를 얹어 내보냅니다.";

    const 나온것 = formatReply(모델이보낸것);

    expect(나온것).not.toContain("**");
    expect(나온것.split("\n").length).toBe(4);
  });

  it("**빈 글자는 빈 글자다**", () => {
    expect(formatReply("   ")).toBe("");
  });
});

/**
 * **고칠 자리가 둘이었다.** 하나만 고치면 그대로다.
 *
 *   · 화면이 줄바꿈을 버렸다 → `cs-panel-wiring.test.ts` 가 본다
 *   · 모델에게 줄을 나누라고 안 시켰다 → 여기서 본다
 */
describe("배선", () => {
  const web = join(__dirname, "..", "..", "..");
  const read = (file: string) => readFileSync(join(web, file), "utf8");

  it("**라우트가 놓기 전에 다듬는다**", () => {
    const route = read("app/api/cs/ask/route.ts");

    expect(route).toContain("formatReply");
    expect(route, "다듬지 않은 글을 그대로 내보낸다").not.toMatch(/reply = 못했다 \? NO_EVIDENCE : String\(답\.reply\)\.trim\(\)/);
  });

  /**
   * **시키는 것도 함께 한다.** 다듬기는 한 덩어리로 온 글을 문장마다 끊을 뿐,
   * 차례를 번호로 놓거나 나열을 줄로 가르는 것은 모델이 해야 한다.
   */
  it("**모델에게 줄을 나누라고 시킨다**", () => {
    const prompt = read("lib/cs/prompt.ts");

    expect(prompt).toContain("줄을 바꿔라");
    expect(prompt, "번호를 붙이라고 안 한다").toContain("번호를 붙여");
    expect(prompt, "별표를 쓰지 말라고 안 한다").toContain("별표로 굵게 하지 마라");
  });
});
