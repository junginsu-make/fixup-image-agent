import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 04 기획 확인 화면이 **사용자가 친 말**을 보여주는가.
 *
 * 이 화면은 「AI 가 채운 칸이 내가 시킨 것과 맞나」를 판단하는 자리다. 그런데
 * 자기가 01·03 에서 뭐라고 적었는지는 그 화면을 떠나면 다시 볼 수 없었다.
 * 아래 칸들보다 그 말이 세다는 것도 여기서만 말할 수 있다.
 *
 * **왜 소스 문자열을 보는가** — `new-client-wiring.test.ts` 와 같은 이유다.
 * 이 저장소에는 jsdom 이 없어 컴포넌트를 렌더할 수 없다.
 */

const source = readFileSync(new URL("../[id]/poster-client.tsx", import.meta.url), "utf8");

describe("내가 적은 말이 기획 확인 화면에 보이는가", () => {
  it("01의 말과 03의 말을 둘 다 읽는다", () => {
    expect(source).toContain("project.data.attachmentIntent?.trim()");
    expect(source).toContain("project.data.userInstruction?.trim()");
  });

  it("빈 것은 거른다 — 옛 작업에는 둘 다 없다", () => {
    // 안 거르면 「첨부한 그림에 대해 · 」만 있는 빈 줄이 남는다.
    expect(source).toMatch(/userWords[\s\S]{0,400}?\.filter\(/);
  });

  it("기획 칸보다 위에 둔다 — 무엇이 더 센지 그 자리에서 말한다", () => {
    expect(source).toContain("아래 칸보다 우선합니다");
    expect(source.indexOf("userWords.map")).toBeLessThan(source.indexOf("SLOT_LABELS.map"));
  });

  it("고칠 수 없다 — 이 화면은 기획 칸만 고친다", () => {
    // 여기서 고치게 하면 저장 경로가 하나 더 생긴다. 01·03 으로 돌아가면 된다.
    expect(source).not.toMatch(/setAttachmentIntent|setUserInstruction/);
  });
});
