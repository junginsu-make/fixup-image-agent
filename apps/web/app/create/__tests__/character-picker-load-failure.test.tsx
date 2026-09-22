import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterPicker } from "../CharacterPicker";

/**
 * **목록을 못 불러오면 고른 캐릭터가 화면에서 사라진다**(A-14).
 *
 * 로드가 실패하면 `setCharacters([])` 로 빈 목록이 되고, 고른 캐릭터를 그 목록에서
 * 찾으므로 **아무것도 안 골라진 것처럼 보인다.** 그런데 `selectedId` 는 그대로
 * 남아 생성 요청에 실려 나간다.
 *
 * 사용자는 캐릭터가 안 쓰인다고 믿고 진행하거나, 다시 고르려다 목록이 비어 있는
 * 것만 본다. **왜 비었는지도 안 알려 준다.**
 *
 * 설계 §14(A-14): 「목록 오류와 **현재 참조 표시**, 제출 검증」.
 */
vi.mock("../../_components/character-picker", () => ({
  CharacterPickerButton: () => null,
}));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

let renderer: ReactTestRenderer;
const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise<void>((r) => setImmediate(r)); });
};

beforeEach(() => {
  vi.stubGlobal("React", React);
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

const 그리기 = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    renderer = create(
      <CharacterPicker selectedId="c1" angles={["front"]} onSelect={() => {}} {...props} />,
    );
  });
  await flush();
  return JSON.stringify(renderer.toJSON());
};

const 성공응답 = (characters: unknown[]) =>
  vi.stubGlobal("fetch", async () => ({ json: async () => ({ ok: true, characters }) }));

describe("목록을 못 불러왔을 때", () => {
  it("**고른 캐릭터가 사라지지 않는다**", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("네트워크"); });

    const 글 = await 그리기();

    expect(글).toContain("고른 캐릭터");
  });

  it("**왜 비었는지 말한다**", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("네트워크"); });

    const 글 = await 그리기();

    expect(글).toContain("불러오지 못했습니다");
    // **목록을 못 가져온 것**과 **그 캐릭터가 지워진 것**은 다른 일이다.
    // 같은 말로 뭉개면 사용자가 무엇을 해야 할지 모른다.
    expect(글).toContain("캐릭터 목록을 가져오지 못했습니다");
  });

  it("**다시 시도할 길을 준다**", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("네트워크"); });
    await 그리기();

    const 다시 = renderer.root
      .findAll((node) => node.type === "button")
      .filter((node) => JSON.stringify(node.children).includes("다시"));

    expect(다시.length).toBeGreaterThan(0);
  });

  it("**고른 것이 없으면 조용하다** — 목록만 못 불러온 것은 사용자 일이 아니다", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("네트워크"); });

    expect(await 그리기({ selectedId: undefined })).not.toContain("고른 캐릭터");
  });
});

describe("목록이 멀쩡할 때는 전과 같다", () => {
  it("고른 캐릭터를 이름으로 보여준다", async () => {
    성공응답([{ id: "c1", name: "지수", views: [{ angle: "front", imageUrl: "u" }] }]);

    const 글 = await 그리기();

    expect(글).toContain("지수");
    expect(글).not.toContain("불러오지 못했습니다");
  });

  it("**목록에 없는 id 도 알린다** — 지워진 캐릭터를 고른 채 남을 수 있다", async () => {
    성공응답([{ id: "other", name: "다른 사람", views: [] }]);

    const 글 = await 그리기();

    expect(글).toContain("불러오지 못했습니다");
    // 목록은 멀쩡히 왔다. 다시 불러와도 안 나온다 — 다른 말을 해야 한다.
    expect(글).toContain("지워졌거나");
    expect(글).not.toContain("캐릭터 목록을 가져오지 못했습니다");
  });
});
