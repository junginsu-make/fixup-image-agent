import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionBlueprint } from "@fixup/pdp-core";
import { createEmptySection } from "../scenario-sections";

/**
 * **편집기는 제품 원본을 올려 주소로 요청한다**(설계 2026-10-08 §4).
 *
 * 사진 경로의 생성 요청 몸통에는 `productImageUrl` 만 있고 `originalImageBase64` 는
 * 없다. 올리기가 실패하면 요청은 나가지 않고, 문구가 보이며, 어떤 섹션도
 * 「만드는 중」으로 남지 않는다.
 */

const captured = vi.hoisted(() => ({
  calls: [] as Array<{ path: string; body: Record<string, unknown> }>,
  batchOk: false,
  // 묶음 응답의 섹션 결과. 비면 그림 없이 성공만 답한다.
  results: [] as unknown[],
}));

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
      return { ok: true, results: captured.results, requested, succeeded: captured.results.length, stopBatch: false };
    },
  };
});

import { PdpEditor } from "../PdpEditor";
import { productsKey, type PdpProductDraft } from "../products";

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

const 사진칸 = (base64: string) => ({ base64, mimeType: "image/jpeg", previewUrl: "", fileName: "a.jpg" });
// 분석한 사진(`originalImage: "AAAA"`)과 같은 제품 하나·사진 하나. 2단계와 같은 길로 간다.
const 한제품: PdpProductDraft[] = [{ id: "p1", name: "", photos: [{ ...사진칸("AAAA"), original: { base64: "QUJD", mimeType: "image/jpeg" } }] }];

const 띄우고누른다 = async (count = 2, products: PdpProductDraft[] = 한제품, result = 결과를(count)) => {
  await act(async () => {
    renderer = create(
      <PdpEditor
        initialResult={result}
        characterAngles={[]}
        aspectRatio="3:4"
        desiredTone=""
        onReset={() => {}}
        onSectionsChange={() => {}}
        products={products}
        analyzedProductsKey={productsKey(products)}
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
  captured.results = [];
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

/**
 * **단건 생성도 올리는 동안 「만드는 중」이다**(최종 리뷰 I5). 원본 올리기는 수 초 걸린다 —
 * 그동안 잠금·표시가 없으면 다시 누르거나 다른 섹션을 눌러 같은 사진을 또 올렸다.
 */
describe("단건 생성 — 원본을 올리는 동안", () => {
  it("올리기를 기다리는 동안 만드는 중이고, 올리기가 실패하면 만드는 중이 남지 않는다", async () => {
    let 대답!: (response: Response) => void;
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => { 대답 = resolve; }));
    await act(async () => {
      renderer = create(
        <PdpEditor
          initialResult={결과를(2)}
          characterAngles={[]}
          aspectRatio="3:4"
          desiredTone=""
          onReset={() => {}}
          onSectionsChange={() => {}}
          products={한제품}
          analyzedProductsKey={productsKey(한제품)}
        />,
      );
    });
    const 생성 = renderer.root.findAll((node) => node.type === "button" && 글자(node as never) === "생성");
    expect(생성[0], "단건 생성 단추를 못 찾았다").toBeTruthy();
    await act(async () => {
      생성[0]!.props.onClick();
    });
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
    }
    // 아직 올리는 중 — 카드의 「생성」 단추가 모두 잠겨 있어야 한다(만드는 중 표시와 같은 기준).
    const 카드생성 = () => renderer.root.findAll((node) => node.type === "button" && 글자(node as never) === "생성");
    expect(카드생성().map((button) => button.props.disabled), "올리는 동안 만드는 중이 아니다").toEqual([true, true]);

    await act(async () => {
      대답(new Response(JSON.stringify({ ok: false, message: "이미지 용량이 너무 큽니다." }), { status: 413, headers: { "content-type": "application/json" } }));
    });
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(captured.calls.filter((call) => call.path.startsWith("/pdp/images"))).toEqual([]);
    expect(그려진글()).toContain("이미지 용량이 너무 큽니다.");
    expect(카드생성().map((button) => Boolean(button.props.disabled))).toEqual([false, false]);
  });
});

describe("여러 제품 작업의 생성 요청과 뺀 장수(설계 §6.1·§6.2)", () => {
  const 두제품: PdpProductDraft[] = [
    { id: "p1", name: "레몬맛", photos: [사진칸("QUJD"), 사진칸("QUJE")] },
    { id: "p2", name: "", photos: [사진칸("QUJF")] },
  ];

  it("묶음 몸통의 page.products 에 두 제품이 주소로 실리고, 뺀 장수가 배지로 보인다", async () => {
    captured.batchOk = true;
    captured.results = [
      { sectionId: "section-1", ok: true, imageBase64: "SU1H", mimeType: "image/png", productPhotosDropped: 2 },
    ];
    let 올린수 = 0;
    vi.stubGlobal("fetch", async () => {
      올린수 += 1;
      const body = { ok: true, url: `https://v3.fal.media/files/u${올린수}.jpg`, expiresInMs: 3600000 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    // 섹션은 부모가 쥔다(`onSectionsChange`). 결과가 섹션에 붙는 것까지 보려면 부모가 있어야 한다.
    function EditorWithParent() {
      const [result, setResult] = React.useState(결과를(1) as { blueprint: { sections: SectionBlueprint[] } });
      return (
        <PdpEditor
          initialResult={result as never}
          characterAngles={[]}
          aspectRatio="3:4"
          desiredTone=""
          onReset={() => {}}
          onSectionsChange={(next) => setResult((current) => ({
            ...current,
            blueprint: { ...current.blueprint, sections: typeof next === "function" ? next(current.blueprint.sections) : next },
          }))}
          products={두제품}
          analyzedProductsKey={productsKey(두제품)}
        />
      );
    }
    await act(async () => {
      renderer = create(<EditorWithParent />);
    });
    await act(async () => {
      단추("1장 만들기")[0]!.props.onClick();
    });
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
    }

    const 요청 = captured.calls.find((call) => call.path === "/pdp/images/batch");
    expect(요청, "일괄 요청이 안 나갔다").toBeTruthy();
    expect(요청!.body.productImageUrl).toBe("https://v3.fal.media/files/u1.jpg");
    const page = 요청!.body.page as { products?: Array<{ id: string; name?: string; imageUrls: string[] }> };
    expect(page.products).toEqual([
      { id: "p1", name: "레몬맛", imageUrls: ["https://v3.fal.media/files/u1.jpg", "https://v3.fal.media/files/u2.jpg"] },
      { id: "p2", imageUrls: ["https://v3.fal.media/files/u3.jpg"] },
    ]);

    await act(async () => {
      renderer.root.find((node) => node.type === "button" && node.props["aria-pressed"] !== undefined && 글자(node as never) === "편집").props.onClick();
    });
    const 배지 = renderer.root.findAll((node) => typeof node.props.title === "string" && node.props.title === "사진이 많아 제품마다 앞쪽 사진만 썼습니다");
    expect(배지.length, "뺀 장수 배지가 없다").toBeGreaterThan(0);
    expect(그려진글()).toContain("사진 2장 줄임");
    // 3단계 최종 C1: 까닭이 `title` 에만 있으면 화면 낭독기·터치에서는 안 보인다.
    const 숨은글 = 배지[0]!.findAll((node) => node.type === "span" && node.props.className === "sr-only");
    expect(숨은글.map((node) => node.children.join(""))).toEqual([" — 사진이 많아 제품마다 앞쪽 사진만 썼습니다"]);
  });

  it("분석 뒤 제품이 바뀌었으면 요청이 안 나가고 다시 만들라고 말한다", async () => {
    await act(async () => {
      renderer = create(
        <PdpEditor
          initialResult={결과를(2)}
          characterAngles={[]}
          aspectRatio="3:4"
          desiredTone=""
          onReset={() => {}}
          onSectionsChange={() => {}}
          products={두제품}
          analyzedProductsKey="옛 열쇠"
        />,
      );
    });
    await act(async () => {
      단추("2장 만들기")[0]!.props.onClick();
    });
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(captured.calls.filter((call) => call.path.startsWith("/pdp/images"))).toEqual([]);
    expect(그려진글()).toContain("제품 사진이 구성안을 만든 뒤에 바뀌었습니다");
  });
});
