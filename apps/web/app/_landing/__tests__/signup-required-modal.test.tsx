import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「회원가입이 필요합니다」 모달을 **그려서** 잰다.
 *
 * 소스에 `href="/signup"` 이 있는지만 보면 단추 밖 주석에 있어도 통과한다.
 * 그려진 링크·단추를 본다. Radix 의 Portal 은 이 시험 환경에서 그려지지 않으므로
 * Dialog 계열만 단순한 껍데기로 바꾼다(`app/poster/__tests__/saved-plan-navigation.test.tsx` 방식).
 * Button 은 진짜를 쓴다 — `asChild` 로 링크를 감싸는지까지 본다.
 */
const f = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: f.replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", async () => {
  const { forwardRef } = await import("react");
  return {
    default: forwardRef<HTMLAnchorElement, React.PropsWithChildren<{ href: string }>>(
      ({ children, ...props }, ref) => <a ref={ref} {...props}>{children}</a>,
    ),
  };
});
vi.mock("@fixup/ui", async (original) => {
  const actual = await original<Record<string, unknown>>();
  const Part = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return {
    ...actual,
    Dialog: ({ open, onOpenChange, children }: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) => (
      <section data-dialog-open={open}>
        {open ? (
          <>
            {/* X 단추·Esc·바깥 누르기는 모두 onOpenChange(false) 로 온다. */}
            <button onClick={() => onOpenChange(false)}>X로 닫기</button>
            {children}
          </>
        ) : null}
      </section>
    ),
    DialogContent: Part,
    DialogHeader: Part,
    DialogFooter: Part,
    DialogTitle: Part,
    DialogDescription: Part,
  };
});

const { SignupRequiredModal } = await import("../signup-required-modal");

let view: ReactTestRenderer;

const label = (node: unknown): string =>
  typeof node === "string"
    ? node
    : node && typeof node === "object" && "children" in node
      ? ((node as { children: unknown[] }).children ?? []).map(label).join("")
      : "";
const links = () =>
  view.root.findAllByType("a").map((node) => ({ href: node.props.href as string, text: label(node).trim() }));
const button = (text: string) =>
  view.root.findAllByType("button").find((node) => label(node).trim() === text)!;

beforeEach(() => {
  f.replace.mockReset();
});
afterEach(() => {
  act(() => view?.unmount());
});

describe("회원가입 안내 모달", () => {
  it("제목과 [회원가입] [로그인] [닫기] 를 보인다", () => {
    act(() => { view = create(<SignupRequiredModal next="/create" closeHref="/" />); });

    expect(label(view.root)).toContain("회원가입이 필요합니다");
    expect(links()).toEqual(expect.arrayContaining([
      { href: "/signup", text: "회원가입" },
      { href: "/login?next=%2Fcreate", text: "로그인" },
    ]));
    expect(button("닫기")).toBeTruthy();
  });

  it("가려던 곳이 없으면 [로그인] 은 그냥 /login", () => {
    act(() => { view = create(<SignupRequiredModal next={null} closeHref="/" />); });

    expect(links()).toEqual(expect.arrayContaining([{ href: "/login", text: "로그인" }]));
  });

  it("[닫기] 는 모달을 닫고 주소에서 안내를 지운다 — 새로고침해도 다시 안 뜬다", () => {
    act(() => { view = create(<SignupRequiredModal next="/create" closeHref="/" />); });

    act(() => button("닫기").props.onClick());

    expect(view.root.findByProps({ "data-dialog-open": false })).toBeTruthy();
    expect(f.replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("X·Esc·바깥 누르기도 같다 — 보던 언어는 남긴다", () => {
    act(() => { view = create(<SignupRequiredModal next="/create" closeHref="/?lang=en" />); });

    act(() => button("X로 닫기").props.onClick());

    expect(view.root.findByProps({ "data-dialog-open": false })).toBeTruthy();
    expect(f.replace).toHaveBeenCalledWith("/?lang=en", { scroll: false });
  });
});
