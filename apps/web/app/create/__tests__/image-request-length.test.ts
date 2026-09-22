import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATTACHMENT_INTENT_MAX_LENGTH, MAX_STRATEGY_LENGTH } from "@fixup/pdp-core";
import { imageRequestLengthBlock } from "../image-request-length";

/**
 * **만들기 쪽 문지기**(D-8 후속).
 *
 * 「이미지 연출 요청」과 첨부 지시 세 칸은 기획 요청에 안 실린다 —
 * `buildPageWire` 를 거쳐 **만들기 요청에만** 간다. 처음에는 이 칸들을 기획
 * 문지기에 넣었다가 리뷰가 잡았다: **반대쪽 문에 걸려 있었다.**
 *
 * - 잘못 막았다 — 그 칸 하나로 기획이 중단되고 화면이 「올리기」로 되돌아갔다
 * - 못 막았다 — 정작 만들기는 서버까지 가서 「요청이 올바르지 않습니다」
 *   한 줄로 400 이 났다. **그 화면에는 그 칸을 고칠 입력란조차 없다**
 *
 * 상한이 늦게 붙은 칸들이라 그 전에 저장된 초안이 넘친 값을 담고 복원될 수
 * 있다. U-08 에서 같은 함정에 한 번 빠졌다.
 */

describe("넘치지 않으면 막지 않는다", () => {
  it("빈 값은 막지 않는다", () => {
    expect(imageRequestLengthBlock({})).toBe("");
  });

  it("**딱 맞으면 통과한다** — 상한은 「넘으면」이지 「닿으면」이 아니다", () => {
    expect(
      imageRequestLengthBlock({
        userInstruction: "가".repeat(MAX_STRATEGY_LENGTH),
        anchorIntent: "가".repeat(ATTACHMENT_INTENT_MAX_LENGTH),
      }),
    ).toBe("");
  });
});

describe("넘치면 막고, 무엇이 얼마나 넘쳤는지 말한다", () => {
  it("**연출 요청**", () => {
    const 말 = imageRequestLengthBlock({ userInstruction: "가".repeat(MAX_STRATEGY_LENGTH + 7) });

    expect(말).toContain("이미지 연출 요청");
    expect(말).toContain("7자 초과");
  });

  it.each([
    ["anchorIntent", "제품"],
    ["personIntent", "인물"],
    ["styleIntent", "디자인"],
  ])("**%s → 어느 그림에 적은 말인지 말한다**", (key, 이름) => {
    const 말 = imageRequestLengthBlock({ [key]: "가".repeat(ATTACHMENT_INTENT_MAX_LENGTH + 1) });

    expect(말).toContain(이름);
  });

  /**
   * **어디서 고치는지까지 말한다.**
   *
   * 이 칸들은 시나리오 화면에 입력란이 없다. 막기만 하면 사용자가 풀 길이
   * 없어 막다른 골목이 된다.
   */
  it("**어느 화면에서 고치는지 말한다**", () => {
    expect(imageRequestLengthBlock({ userInstruction: "가".repeat(MAX_STRATEGY_LENGTH + 1) }))
      .toContain("기획 화면");
  });

  it("**여러 칸이 넘치면 다 말한다** — 하나씩 고치게 만들지 않는다", () => {
    const 말 = imageRequestLengthBlock({
      userInstruction: "가".repeat(MAX_STRATEGY_LENGTH + 1),
      personIntent: "가".repeat(ATTACHMENT_INTENT_MAX_LENGTH + 1),
    });

    expect(말).toContain("연출");
    expect(말).toContain("인물");
  });

  /** 첨부 지시는 더 짧은 상한을 쓴다. 긴 쪽 상한으로 재면 안 막힌다. */
  it("**첨부 지시에 긴 칸의 상한을 쓰지 않는다**", () => {
    const 중간 = "가".repeat(ATTACHMENT_INTENT_MAX_LENGTH + 1);

    expect(중간.length).toBeLessThan(MAX_STRATEGY_LENGTH);
    expect(imageRequestLengthBlock({ styleIntent: 중간 })).not.toBe("");
  });
});

/**
 * **문지기가 실제로 두 입구에 걸려 있는가.**
 *
 * 시나리오 화면(`PdpEditor`)은 html2canvas·JSZip·react-rnd 를 들이므로 이
 * 저장소(jsdom 없음)에서는 띄울 수 없다. 그래서 **덩이로 잘라서** 본다 —
 * 글자 두 개를 따로 찾으면 순서가 뒤바뀌어도 통과한다(리뷰가 실증했다).
 */
describe("두 입구가 모두 이 문을 지난다", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

  it.each([
    ["단건 만들기", "const generateSectionImage"],
    ["일괄 만들기", "const handleGenerateAllMissing"],
  ])("**%s 이 보내기 전에 막는다**", (_label, 머리) => {
    const 시작 = editor.indexOf(머리);
    expect(시작, `${머리} 를 못 찾았다`).toBeGreaterThan(-1);
    const 앞부분 = editor.slice(시작, 시작 + 900);

    // 보내기 전에 나와야 한다. 뒤에 있으면 이미 요청이 나간 뒤다.
    const 문지기 = 앞부분.indexOf("lengthBlockedMessage");
    const 보내기 = 앞부분.indexOf("apiJson");
    expect(문지기).toBeGreaterThan(-1);
    if (보내기 > -1) expect(문지기).toBeLessThan(보내기);
  });

  it("**그 값은 코어 판정에서 온다** — 화면이 따로 세면 상한이 갈린다", () => {
    expect(editor).toContain("imageRequestLengthBlock({");
  });
});
