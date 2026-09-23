import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **탈퇴 카드가 실제로 그리고 실제로 부르는가**(2026-09-23 사용자 요청).
 *
 * 판단은 `lib/membership/withdrawal.ts` 가 재고, 여기는 **화면**이다 —
 * 판단만 고치고 화면이 안 그리면 아무것도 안 고친 것이다. 이 저장소가 여러
 * 번 겪은 함정이라 띄워서 잰다.
 */

const captured = vi.hoisted(() => ({
  calls: [] as Array<{ confirmEmail: string }>,
  answer: { ok: true, message: "탈퇴가 완료되었습니다." } as { ok: boolean; message: string },
}));

vi.mock("../actions", () => ({
  withdrawMyAccount: async (input: { confirmEmail: string }) => {
    captured.calls.push(input);
    return captured.answer;
  },
  updateMyProfile: vi.fn(),
}));

const { WithdrawCard } = await import("../withdraw-card");

let renderer: ReactTestRenderer;

const 그려진글 = () => JSON.stringify(renderer.toJSON());

const 글자 = (node: { children: unknown[] }) =>
  node.children.filter((child): child is string => typeof child === "string").join("");

const 단추 = (말: string) =>
  renderer.root.findAll((node) => node.type === "button" && 글자(node as never).includes(말));

const 가라앉힌다 = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  }
};

const 띄운다 = async (availableCredits = 0) => {
  await act(async () => {
    renderer = create(<WithdrawCard email="me@example.com" availableCredits={availableCredits} />);
  });
};

/** 성공하면 화면을 통째로 다시 연다. 그 호출을 잡는다. */
const 옮긴곳 = { href: "" };

beforeEach(() => {
  captured.calls.length = 0;
  captured.answer = { ok: true, message: "탈퇴가 완료되었습니다." };
  옮긴곳.href = "";
  vi.stubGlobal("window", { location: 옮긴곳 });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("열기 전", () => {
  it("**무엇이 사라지는지 먼저 말한다**", async () => {
    await 띄운다();

    const 글 = 그려진글();
    expect(글).toContain("되돌릴 수 없습니다");
    expect(글, "무엇이 남는지 안 말한다").toContain("보관됩니다");
  });

  /**
   * **남은 크레딧을 숫자로 말한다.** 「사라집니다」만으로는 얼마가 사라지는지
   * 모른다.
   */
  it("**남은 크레딧을 숫자로 말한다**", async () => {
    await 띄운다(42);

    expect(그려진글()).toContain("42장");
  });

  it("**0장이면 크레딧 이야기를 안 한다**", async () => {
    await 띄운다(0);

    expect(그려진글()).not.toContain("크레딧 0장");
  });

  /**
   * **접어 둔다.** 펼쳐 두면 「탈퇴하기」 단추가 늘 화면에 있다. 누르겠다고
   * 마음먹은 사람만 확인 칸을 본다.
   */
  it("**확인 칸이 아직 없다**", async () => {
    await 띄운다();

    expect(단추("탈퇴하기").length, "누르지도 않았는데 탈퇴 단추가 있다").toBe(0);
  });
});

describe("절차를 시작하면", () => {
  const 연다 = async () => {
    await 띄운다();
    await act(async () => { 단추("탈퇴 절차 시작")[0]!.props.onClick(); });
  };

  it("**확인 칸이 열린다**", async () => {
    await 연다();

    expect(그려진글()).toContain("그대로 입력해 주세요");
    expect(단추("탈퇴하기")[0], "탈퇴 단추가 없다").toBeTruthy();
  });

  /**
   * **빈 칸으로는 못 누른다.** 서버도 막지만, 눌러 보고 거절당하는 것보다
   * 못 누르는 편이 낫다.
   */
  it("**아무것도 안 적으면 못 누른다**", async () => {
    await 연다();

    expect(단추("탈퇴하기")[0]!.props.disabled).toBe(true);
  });

  it("**적으면 누를 수 있다**", async () => {
    await 연다();
    const 칸 = renderer.root.findAll((node) => node.type === "input")[0]!;
    await act(async () => { 칸.props.onChange({ target: { value: "me@example.com" } }); });

    expect(단추("탈퇴하기")[0]!.props.disabled).toBe(false);
  });
});

describe("누르면", () => {
  const 적고누른다 = async (typed: string) => {
    await 띄운다();
    await act(async () => { 단추("탈퇴 절차 시작")[0]!.props.onClick(); });
    const 칸 = renderer.root.findAll((node) => node.type === "input")[0]!;
    await act(async () => { 칸.props.onChange({ target: { value: typed } }); });
    const form = renderer.root.findAll((node) => node.type === "form")[0]!;
    await act(async () => { form.props.onSubmit({ preventDefault: () => {} }); });
    await 가라앉힌다();
  };

  it("**적은 글자를 그대로 보낸다**", async () => {
    await 적고누른다("me@example.com");

    expect(captured.calls).toEqual([{ confirmEmail: "me@example.com" }]);
  });

  /**
   * **성공하면 이 화면을 다시 안 그린다.** 계정이 사라졌거나 닫혔으므로
   * 다시 그리면 로그인으로 튕긴다. 통째로 다시 연다.
   */
  it("**성공하면 로그인으로 보낸다**", async () => {
    await 적고누른다("me@example.com");

    expect(옮긴곳.href, "성공했는데 화면에 그대로 있다").toContain("/login");
  });

  it("**실패하면 까닭을 그 자리에 적는다**", async () => {
    captured.answer = { ok: false, message: "지금 만들고 있는 작업이 있습니다." };
    await 적고누른다("me@example.com");

    expect(그려진글()).toContain("만들고 있는 작업");
    expect(옮긴곳.href, "실패했는데 화면을 옮겼다").toBe("");
  });

  /**
   * **폼이 그냥 넘어가지 않게 한다.** 막지 않으면 페이지가 새로고침되면서
   * 서버 액션이 안 불린다.
   */
  it("**기본 동작을 막는다**", async () => {
    await 띄운다();
    await act(async () => { 단추("탈퇴 절차 시작")[0]!.props.onClick(); });
    const form = renderer.root.findAll((node) => node.type === "form")[0]!;
    const 막음 = vi.fn();
    await act(async () => { form.props.onSubmit({ preventDefault: 막음 }); });

    expect(막음).toHaveBeenCalled();
  });
});
