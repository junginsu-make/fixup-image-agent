import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => <a {...props}>{children}</a> }));
vi.mock("../_components/cardnews-card", () => ({ EasyCardnewsCard: () => null }));
vi.mock("../../_components/elapsed-time", () => ({ ElapsedTime: () => null }));

import { EasyMessageRow } from "../_components/message";

let view: ReactTestRenderer;
const 글 = (): string => JSON.stringify(view.toJSON());
afterEach(() => { act(() => view?.unmount()); });

describe("그림 줄 (B3 · B5)", () => {
  it("못 받은 줄은 「만들고 있습니다」 대신 까닭을 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "i1", role: "image", body: "", workId: "p1" }} failed="내용 검사에 걸렸습니다." />); });
    expect(글()).toContain("내용 검사에 걸렸습니다.");
    expect(글()).not.toContain("이미지를 만들고 있습니다");
  });

  it("실패가 아니면 지금처럼 만드는 중이다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "i1", role: "image", body: "", workId: "p1" }} />); });
    expect(글()).toContain("이미지를 만들고 있습니다");
  });
});
