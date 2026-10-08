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

const captured = vi.hoisted(() => ({ calls: [] as Array<{ path: string; body: Record<string, unknown> }>, batchOk: false }));

vi.mock("../pdp-utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    apiJson: async (path: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      captured.calls.push({ path, body });
      if (!captured.batchOk) return { ok: false, code: "quota_exceeded", message: "한도" };
      // 묶음이 성공해야 다음 묶음으로 넘어간다. 그림은 없어도 된다 — 요청 몸통만 본다.
      const requested = (body.sections as unknown[] | undefined)?.length ?? 0;
      return { ok: true, results: [], requested, succeeded: 0, stopBatch: false };
    },
  };
});

import { PdpEditor } from "../PdpEditor";

const 결과를 = (count: number) => ({
  originalImage: "AAAA",
  blueprint: {
    executiveSummary: "요약",
    scorecard: [],
    blueprintList: [],
    sections: Array.from({ length: count }, (_, index) => ({ ...createEmptySection(index), section_name: `섹션 ${index + 1}`, headline: `${index + 1}번 제목` })),
  },
}) as never;

let renderer: ReactTestRenderer;

const 글자 = (node: { children: unknown[] }) =>
  node.children.filter((child): child is string => typeof child === "string").join("");
const 단추 = (말: string) =>
  renderer.root.findAll((node) => node.type === "button" && 글자(node as never).includes(말));
const 그려진글 = () => JSON.stringify(renderer.toJSON());

const 띄우고누른다 = async (count = 2) => {
  await act(async () => {
    renderer = create(
      <PdpEditor
        initialResult={결과를(count)}
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
    단추(`${count}장 만들기`)[0]!.props.onClick();
  });
  for (let i = 0; i < 4 * count; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
};

const 올리기대답 = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  captured.calls.length = 0;
  captured.batchOk = false;
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

  it("묶음마다 주소를 다시 확인한다 — 한 묶음이 몇 분 걸려 앞에서 받은 주소가 도중에 만료될 수 있다", async () => {
    captured.batchOk = true;
    let 올린수 = 0;
    // 남은 시간이 다시 올리기 기준(10분)보다 짧은 주소 — 묶음마다 새로 받아야 한다.
    vi.stubGlobal("fetch", async () => {
      올린수 += 1;
      const body = { ok: true, url: `https://v3.fal.media/files/t${올린수}.jpg`, expiresAt: Date.now() + 5 * 60 * 1000, expiresInMs: 5 * 60 * 1000 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    await 띄우고누른다(4);

    const 묶음들 = captured.calls.filter((call) => call.path === "/pdp/images/batch");
    expect(묶음들.length, "묶음이 둘로 나뉘지 않았다").toBe(2);
    expect(묶음들.map((call) => call.body.productImageUrl)).toEqual([
      "https://v3.fal.media/files/t1.jpg",
      "https://v3.fal.media/files/t2.jpg",
    ]);
    expect(올린수).toBe(2);
  });
});
