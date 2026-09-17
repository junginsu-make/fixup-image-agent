import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canDeleteReference, referenceDeletePrompt } from "../reference-delete-prompt";

/**
 * **남의 그림을 지우는 자리는 한 규칙을 탄다**(2026-09-17 독립 리뷰).
 *
 * 참고 이미지 목록을 이미지 만들기에서도 공용으로 넓히면서, 고르는 창에 남의
 * 그림이 처음으로 들어왔다. 그런데 지우기 단추 규칙은 라이브러리 탭에만
 * 있었다. 그대로 뒀으면:
 *
 *   회원    지울 수 없는 남의 그림에도 단추가 뜨고, 눌러야 「지우지 못했습니다」
 *   관리자  **실제로 지워진다.** 남의 것인 줄 모른 채 누르고, 그 그림을 쓰던
 *           다른 회원의 작업이 함께 깨진다
 */

describe("지우기 전에 누구 것인지 밝힌다", () => {
  it("남의 것이면 올린 사람과 무슨 일이 생기는지 말한다", () => {
    const message = referenceDeletePrompt({
      title: "겨울 로고", mine: false, ownerEmail: "someone@example.com",
    });
    expect(message).toContain("겨울 로고");
    expect(message).toContain("someone@example.com");
    expect(message).toContain("함께 깨집니다");
  });

  it("올린 사람을 모르면 「다른 회원」으로 말한다 — 빈칸으로 두지 않는다", () => {
    const message = referenceDeletePrompt({ title: "로고", mine: false, ownerEmail: null });
    expect(message).toContain("다른 회원");
  });

  it("내 것이면 덧붙이지 않는다 — 늘 겁주면 아무도 안 읽는다", () => {
    expect(referenceDeletePrompt({ title: "로고", mine: true })).toBe(
      "'로고' 를 라이브러리에서 지울까요?",
    );
  });

  it("주인을 모르면 조용히 넘어간다", () => {
    expect(referenceDeletePrompt({ title: "로고" })).not.toContain("함께 깨집니다");
  });

  it("제목이 없어도 문장이 된다", () => {
    expect(referenceDeletePrompt({ title: null, mine: true })).toContain("이 이미지");
  });
});

describe("지우기 단추를 낼까", () => {
  it("내 것에는 낸다", () => {
    expect(canDeleteReference({ mine: true }, { isAdmin: false })).toBe(true);
  });

  it("**남의 것에는 안 낸다** — 못 할 일은 단추부터 없는 편이 낫다", () => {
    expect(canDeleteReference({ mine: false }, { isAdmin: false })).toBe(false);
  });

  it("관리자에게는 남의 것에도 낸다 — 잘못 올라온 것을 내릴 사람이 있어야 한다", () => {
    expect(canDeleteReference({ mine: false }, { isAdmin: true })).toBe(true);
  });

  /**
   * **모르면 안 낸다**(2026-09-17 독립 리뷰).
   *
   * 열린 쪽으로 틀리면 주인을 안 실은 새 화면에서 이번 버그가 조용히
   * 되살아난다. 잘못 닫히면 라이브러리 탭에서 지우면 되고, 잘못 열리면 남의
   * 그림이 사라진다 — 틀릴 방향은 하나뿐이다.
   */
  it("주인을 모르면 안 낸다 — 닫힌 쪽으로 틀린다", () => {
    expect(canDeleteReference({}, { isAdmin: false })).toBe(false);
  });

  it("관리자에게는 주인을 몰라도 낸다", () => {
    expect(canDeleteReference({}, { isAdmin: true })).toBe(true);
  });
});

describe("고르는 창 셋이 같은 규칙을 탄다", () => {
  const picker = readFileSync(new URL("../library-picker.tsx", import.meta.url), "utf8");
  const poster = readFileSync(
    new URL("../../poster/_components/reference-picker.tsx", import.meta.url), "utf8",
  );
  const sns = readFileSync(
    new URL("../../sns/_components/attachment-picker.tsx", import.meta.url), "utf8",
  );

  it("단추 자체를 공용 창이 가른다 — 화면마다 적으면 하나를 빠뜨린다", () => {
    expect(picker).toContain("onDelete && canDeleteReference(image, { isAdmin: canDeleteOthers })");
  });

  it("주인 표시를 창까지 실어 보낸다", () => {
    for (const [이름, 소스] of [["이미지", poster], ["카드뉴스", sns]] as const) {
      expect(소스, 이름).toMatch(/mine: (reference|image)\.mine/);
      expect(소스, 이름).toContain("canDeleteOthers={isAdmin}");
    }
  });

  it("묻는 말도 한 곳에서 가져온다", () => {
    for (const [이름, 소스] of [["이미지", poster], ["카드뉴스", sns]] as const) {
      expect(소스, 이름).toContain("window.confirm(referenceDeletePrompt(");
    }
  });

  it("관리자 여부는 **서버가 준 값**이다 — 화면이 판단하면 서버와 갈린다", () => {
    expect(sns).toContain("setIsAdmin(Boolean(payload.isAdmin))");
  });

  /**
   * **지우기를 넘기는 창은 주인도 함께 싣는다.**
   *
   * 판정이 닫힌 쪽으로 틀리므로 안 실으면 내 그림도 못 지운다 — 조용히 새는
   * 것보다 낫지만, 그 화면은 고장으로 보인다. 그래서 여기서 함께 잰다.
   */
  it("`onDelete` 를 넘기는 창은 `mine` 도 넘긴다", () => {
    for (const [이름, 소스] of [["이미지", poster], ["카드뉴스", sns]] as const) {
      if (!소스.includes("onDelete={")) continue;
      expect(소스, 이름).toMatch(/mine: (reference|image)\.mine/);
    }
  });
});

/**
 * **내 그림을 찾기 쉬워야 한다**(2026-09-17 사용자 결정).
 *
 * 창고가 공용이라 남이 올린 그림이 함께 보인다. 목록은 내 것을 앞에 두고
 * 오지만(`lib/reference-images.ts`), 많아지면 그것만으로는 부족하다.
 */
describe("내 그림만 보기", () => {
  const picker = readFileSync(new URL("../library-picker.tsx", import.meta.url), "utf8");

  it("거르는 단추가 있다", () => {
    expect(picker).toContain("setMineOnly(true)");
    expect(picker).toContain("setMineOnly(false)");
  });

  it("**거르개와 지우기 판정이 같은 방향이다** — 모르면 「내 것」이 아니다", () => {
    // 한쪽은 모르면 남기고 다른 쪽은 모르면 닫으면, 같은 줄이 「내 그림」에
    // 들어 있으면서 지울 수는 없게 된다(2026-09-17 독립 리뷰).
    expect(picker).toContain("images.filter((image) => image.mine === true)");
    expect(picker, "모르면 남기던 옛 방향").not.toContain("image.mine !== false");
  });

  it("**남의 것이 섞였을 때만 낸다** — 혼자 쓰는 사람에게는 뜻이 없다", () => {
    expect(picker).toContain("const hasOthers = images.some((image) => image.mine === false)");
    expect(picker).toMatch(/hasOthers \? \(/);
  });

  it("걸러서 비면 무엇을 하면 되는지 말한다", () => {
    expect(picker).toContain("「전체」를 누르면 함께 쓰는 그림이 보입니다");
  });
});
