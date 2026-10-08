import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySection } from "../scenario-sections";

/**
 * **편집기는 제품 원본을 올려 주소로 요청한다**(설계 2026-10-08 §4).
 *
 * 사진 경로의 생성 요청 몸통에는 `productImageUrl` 만 있고 `originalImageBase64` 는
 * 없다. 올리기가 실패하면 요청은 나가지 않고, 문구가 보이며, 어떤 섹션도
 * 「만드는 중」으로 남지 않는다.
 */

const captured = vi.hoisted(() => ({ calls: [] as Array<{ path: string; body: Record<string, unknown> }> }));

vi.mock("../pdp-utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    apiJson: async (path: string, init?: RequestInit) => {
      captured.calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
      return { ok: false, code: "quota_exceeded", message: "한도" };
    },
  };
});

import { PdpEditor } from "../PdpEditor";

const 결과 = {
  originalImage: "AAAA",
  blueprint: {
    executiveSummary: "요약",
    scorecard: [],
    blueprintList: [],
    sections: [0, 1].map((index) => ({ ...createEmptySection(index), section_name: `섹션 ${index + 1}`, headline: `${index + 1}번 제목` })),
  },
} as never;

let renderer: ReactTestRenderer;

const 글자 = (node: { children: unknown[] }) =>
  node.children.filter((child): child is string => typeof child === "string").join("");
const 단추 = (말: string) =>
  renderer.root.findAll((node) => node.type === "button" && 글자(node as never).includes(말));
const 그려진글 = () => JSON.stringify(renderer.toJSON());

const 띄우고누른다 = async () => {
  await act(async () => {
    renderer = create(
      <PdpEditor
        initialResult={결과}
        characterAngles={[]}
        aspectRatio="3:4"
        desiredTone=""
        onReset={() => {}}
        onSectionsChange={() => {}}
        productPhoto={{ base64: "QUJD", mimeType: "image/jpeg" }}
      />,
    );
  });
  await act(async () => {
    단추("2장 만들기")[0]!.props.onClick();
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
};

const 올리기대답 = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  captured.calls.length = 0;
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    confirm: () => true,
    scrollTo: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("제품 원본 올리기와 생성 요청", () => {
  it("사진 경로의 요청은 주소를 싣고 원본 그림은 싣지 않는다", async () => {
    올리기대답(200, { ok: true, url: "https://v3.fal.media/files/t.jpg", expiresAt: Date.now() + 3600000 });
    await 띄우고누른다();

    const 요청 = captured.calls.find((call) => call.path === "/pdp/images/batch");
    expect(요청, "일괄 요청이 안 나갔다").toBeTruthy();
    expect(요청!.body.productImageUrl).toBe("https://v3.fal.media/files/t.jpg");
    expect(요청!.body).not.toHaveProperty("originalImageBase64");
  });

  it("올리기가 실패하면 요청은 안 나가고 문구가 보이며 만드는 중이 남지 않는다", async () => {
    올리기대답(413, { ok: false, message: "이미지 용량이 너무 큽니다." });
    await 띄우고누른다();

    expect(captured.calls.filter((call) => call.path.startsWith("/pdp/images"))).toEqual([]);
    expect(그려진글()).toContain("이미지 용량이 너무 큽니다.");
    // 잠금이 풀려 만들기 단추가 다시 눌린다.
    expect(단추("2장 만들기")[0]!.props.disabled).toBeFalsy();
  });
});
