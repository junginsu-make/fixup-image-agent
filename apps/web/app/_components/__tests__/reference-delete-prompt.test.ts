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

  it("모르면 낸다 — 옛 화면은 이 값을 안 싣는다", () => {
    expect(canDeleteReference({}, { isAdmin: false })).toBe(true);
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
});
