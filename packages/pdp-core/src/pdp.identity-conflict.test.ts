import { describe, expect, it } from "vitest";
import { identityConflictOf } from "./pdp.identity-conflict";

/**
 * **바꿔 달라고 적었는데 조용히 무시됐다**(U-18).
 *
 * 「이 그림을 어떻게 쓸까요」 칸은 제품·인물 참조에도 붙는다. 거기에 「제품 색을
 * 파란색으로」를 적으면 어떻게 되나 — 역할 규칙이 **정체성을 지키라**고 못 박고
 * 있어서 모델은 그 말을 따르지 않는다. 그리고 **아무도 그 사실을 말하지 않는다.**
 *
 * 사용자는 적었는데 안 바뀐 이유를 모른다. 다시 적고, 또 적고, 이미지 값을
 * 그만큼 치른다.
 *
 * 설계 §6.1: 「보존 대상에 정체성을 바꾸라는 지시가 섞이면 **충돌을 알려
 * 수정하도록 한다.** 비슷한 새 제품으로 조용히 대체하지 않는다.」
 */

describe("제품 정체성을 바꾸라는 말을 찾는다", () => {
  it.each([
    ["제품 색을 파란색으로 바꿔 주세요", "색"],
    ["라벨 글자를 다른 브랜드로 교체해 주세요", "라벨"],
    ["로고를 지워 주세요", "로고"],
    ["재질을 가죽으로 바꿔 주세요", "재질"],
    ["병 모양을 좀 더 날씬하게 변형해 주세요", "모양"],
  ])("%s → 충돌", (intent) => {
    expect(identityConflictOf(intent, "anchor")?.kind).toBe("product");
  });

  it("**연출 지시는 충돌이 아니다** — 각도·배경·조명은 장면이 정한다", () => {
    for (const intent of [
      "왼쪽에 놓아 주세요",
      "배경을 밤으로",
      "조금 더 위에서 찍은 것처럼",
      "따뜻한 조명으로",
    ]) {
      expect(identityConflictOf(intent, "anchor")).toBeNull();
    }
  });

  /**
   * **언급과 요청은 다르다.**
   *
   * 「색이 잘 나오게 조명을 밝게」는 색을 **바꾸라는 말이 아니다.** 요청의 꼴을
   * 안 보면 색을 말하기만 해도 경고가 뜨고, 그러면 사용자는 그 경고를 넘긴다.
   */
  it.each([
    ["색이 잘 나오게 조명을 밝게"],
    ["라벨이 잘 보이는 각도로"],
    ["로고가 가려지지 않게"],
    ["재질이 잘 드러나는 조명으로"],
  ])("%s → 충돌 아님(언급일 뿐이다)", (intent) => {
    expect(identityConflictOf(intent, "anchor")).toBeNull();
  });

  it("빈 지시는 충돌이 아니다", () => {
    expect(identityConflictOf("", "anchor")).toBeNull();
    expect(identityConflictOf("   ", "anchor")).toBeNull();
    expect(identityConflictOf(undefined, "anchor")).toBeNull();
  });
});

describe("인물 정체성을 바꾸라는 말을 찾는다", () => {
  it.each([
    ["얼굴을 좀 더 갸름하게 바꿔 주세요"],
    ["더 어려 보이게 해 주세요"],
    ["머리를 금발로 바꿔 주세요"],
    ["살을 조금 빼 주세요"],
  ])("%s → 충돌", (intent) => {
    expect(identityConflictOf(intent, "person")?.kind).toBe("person");
  });

  it("**표정·자세는 충돌이 아니다** — 장면이 정한다", () => {
    for (const intent of ["웃는 표정으로", "앉아 있는 자세로", "정면을 보게"]) {
      expect(identityConflictOf(intent, "person")).toBeNull();
    }
  });

  /**
   * **소품·옷은 정체성이 아니다.** 여기 넣으면 칸의 예시(「안경을 꼭 씌워
   * 주세요」)마다 경고가 뜨고, 그러면 사용자는 그 경고를 넘긴다.
   */
  it.each([
    ["안경을 꼭 씌워 주세요"],
    ["모자를 바꿔 주세요"],
    ["가방을 다른 걸로 바꿔 주세요"],
    ["옷을 정장으로 바꿔 주세요"],
  ])("%s → 충돌 아님(연출이다)", (intent) => {
    expect(identityConflictOf(intent, "person")).toBeNull();
  });
});

describe("디자인 레퍼런스에는 지킬 정체성이 없다", () => {
  it("**색을 바꿔 달라고 해도 충돌이 아니다** — 모방만 하는 자리다", () => {
    expect(identityConflictOf("색을 파란색으로 바꿔 주세요", "style")).toBeNull();
  });
});

describe("무엇이 걸렸는지 말한다", () => {
  it("**걸린 말을 돌려준다** — 「충돌합니다」만으로는 어디를 고칠지 모른다", () => {
    const 충돌 = identityConflictOf("제품 색을 파란색으로 바꿔 주세요", "anchor");

    expect(충돌?.matched).toBe("색");
  });

  it("사용자가 읽을 말이 붙는다", () => {
    const 충돌 = identityConflictOf("로고를 지워 주세요", "anchor");

    expect(충돌?.message.length).toBeGreaterThan(10);
    // 무시된다는 사실과 무엇을 하면 되는지가 함께 있어야 한다.
    expect(충돌?.message).toContain("반영되지 않습니다");
  });
});

/**
 * **실제로 쓸 법한 문장들.**
 *
 * 첫 판은 낱말만 봐서 **칸의 placeholder 자체**가 걸렸다 — 「뚜껑 색은 그대로
 * 두고 각도만 바꿔 주세요」. 색을 **지키라는** 말인데 「색」과 「바꿔」가 한 글
 * 안에 있었다. 실측으로 잡았고, 그 뒤 **바꾸라는 말의 목적어**를 찾는 쪽으로
 * 바꿨다.
 *
 * 표로 굳혀 둔다. 규칙을 손볼 때 여기가 먼저 빨개진다.
 */
describe("실사용 문장 fixture", () => {
  it.each([
    // 지키라는 말이 섞인 연출 지시 — 칸의 placeholder 가 여기 있다
    ["뚜껑 색은 그대로 두고 각도만 바꿔 주세요", "anchor", false],
    ["제품은 그대로 두고 배경을 바꿔 주세요", "anchor", false],
    ["디자인은 건드리지 말고 조명만 바꿔 주세요", "anchor", false],
    // 지킬 것을 **언급만** 한 연출 지시
    ["라벨이 잘 보이게 각도를 바꿔 주세요", "anchor", false],
    ["색감을 따뜻하게 보정해 주세요", "anchor", false],
    ["배경만 바꿔 주세요", "anchor", false],
    ["구도를 바꿔 주세요", "anchor", false],
    // 정말 바꿔 달라는 말
    ["제품 색을 파란색으로 바꿔 주세요", "anchor", true],
    ["제품 색을 빨강으로", "anchor", true],
    ["로고를 지워 주세요", "anchor", true],
    ["재질을 가죽으로 바꿔 주세요", "anchor", true],
    ["라벨 글자를 다른 브랜드로 교체해 주세요", "anchor", true],
    ["병 모양을 좀 더 날씬하게 변형해 주세요", "anchor", true],
    // 인물 — 연출
    ["머리 위쪽에 여백을 만들어 주세요", "person", false],
    ["표정을 밝게 바꿔 주세요", "person", false],
    ["안경을 꼭 씌워 주세요", "person", false],
    ["모자를 바꿔 주세요", "person", false],
    ["옷을 정장으로 바꿔 주세요", "person", false],
    ["자세를 바꿔 주세요", "person", false],
    // 인물 — 정체성
    ["얼굴을 갸름하게 바꿔 주세요", "person", true],
    ["머리를 금발로 바꿔 주세요", "person", true],
    ["살을 조금 빼 주세요", "person", true],

    /*
      **두 번째 판이 놓치거나 틀리게 잡은 것들.**

      「…을/를」만 보던 때는 **배경 색**을 바꿔 달라는 말에 경고가 떴고(배경은
      바뀌는 것이 맞다), 「제품 색상을 **바꾸지 말아** 주세요」라는 가장 협조적인
      지시에도 경고가 떴다. 반대로 도착지에 실린 것(「뚜껑을 **빨간색으로**」)과
      조사 없는 한 줄 지시(「색 바꿔줘」)는 통째로 놓쳤다.
    */
    ["배경 색을 파란색으로 바꿔 주세요", "anchor", false],
    ["바닥 재질을 대리석으로 바꿔 주세요", "anchor", false],
    ["제품 색상을 바꾸지 말아 주세요", "anchor", false],
    ["조명을 따뜻하게 바꿔 주세요", "anchor", false],
    ["뚜껑을 빨간색으로 해주세요", "anchor", true],
    ["용기를 유리병으로 바꿔주세요", "anchor", true],
    ["색 바꿔줘", "anchor", true],
    ["로고 빼주세요", "anchor", true],
    ["얼굴 바꿔주세요", "person", true],
    ["피부를 더 하얗게 해주세요", "person", true],
    ["다른 사람으로 바꿔 주세요", "person", true],
    ["코를 오똑하게 해주세요", "person", true],
  ])("%s (%s) → %s", (intent, role, conflict) => {
    expect(Boolean(identityConflictOf(intent as string, role as never))).toBe(conflict);
  });
});
