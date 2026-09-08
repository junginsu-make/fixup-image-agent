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
    // 그리는 차례로 본다. `SLOT_LABELS.map` 은 위쪽 유도에도 나와서 기준이 안 된다.
    expect(source.indexOf("userWords.map")).toBeLessThan(source.indexOf("filledFields.map(renderSlot)"));
  });

  it("고칠 수 없다 — 이 화면은 기획 칸만 고친다", () => {
    // 여기서 고치게 하면 저장 경로가 하나 더 생긴다. 01·03 으로 돌아가면 된다.
    expect(source).not.toMatch(/setAttachmentIntent|setUserInstruction/);
  });
});

/**
 * 04 는 패널, 05 는 페이지 (2026-09-08 사용자 결정).
 *
 * **한 페이지를 통째로 쓸 내용이 아니었다.** 칸 열한 개가 늘 다 보였고, 글자가
 * 없는 그림인데 「글자와 피사체의 관계」까지 있었다.
 */
describe("기획은 옆에서 나오고 결과가 페이지를 갖는다", () => {
  it("기획을 오른쪽 패널로 연다", () => {
    expect(source).toContain("<SidePanel open={planOpen} onOpenChange={setPlanOpen}>");
  });

  it("아직 아무것도 안 만들었으면 저절로 연다", () => {
    // 안 열면 「빈 결과 화면」만 보이고 다음에 뭘 해야 할지 알 수 없다.
    expect(source).toMatch(/if \(images\.length\) return;[\s\S]{0,120}setPlanOpen\(true\)/);
  });

  it("한 번만 연다 — 닫은 것을 다시 열면 성가시다", () => {
    expect(source).toContain("if (openedOnce.current) return;");
  });

  it("언제든 다시 열 수 있다", () => {
    expect(source).toMatch(/onClick=\{\(\) => setPlanOpen\(true\)\}/);
  });

  it("만들기를 누르면 패널이 닫힌다 — 결과 자리를 가리면 안 된다", () => {
    expect(source).toContain("setPlanOpen(false); void generate();");
  });

  it("결과는 페이지에 그대로 남는다", () => {
    expect(source).toContain("<CardTitle>결과</CardTitle>");
    // 패널이 **닫힌 뒤에** 결과가 온다. 안이면 결과가 패널에 갇힌다.
    expect(source.indexOf("</SidePanel>"), "결과까지 패널로 가면 안 된다")
      .toBeLessThan(source.indexOf("<CardTitle>결과</CardTitle>"));
  });
});

describe("칸을 걸러서 보여주는가", () => {
  it("규칙을 여기 다시 적지 않고 부른다", () => {
    expect(source).toContain("splitFilledSlots(");
    expect(source).toContain("showsTypeInteraction(slots)");
  });

  it("채운 칸을 먼저 그린다", () => {
    expect(source).toContain("filledFields.map(renderSlot)");
  });

  it("빈 칸은 접어 두되 없애지 않는다 — 없으면 고를 방법이 사라진다", () => {
    expect(source).toContain("emptyFields.map(renderSlot)");
    expect(source).toMatch(/showEmpty \? <div[\s\S]{0,80}emptyFields\.map/);
  });

  it("채운 칸과 접힌 칸이 같은 모양이다", () => {
    // 두 벌로 그리면 한쪽만 고쳐져 모양이 갈린다.
    expect(source).toMatch(/function renderSlot\(field: TextSlot\)/);
  });
});
