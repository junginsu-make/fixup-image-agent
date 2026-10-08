import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PreparedImageDraft } from "../pdp-drafts";
import type { PdpProductDraft } from "../products";

/**
 * **올리기 화면의 제품 칸**(설계 2026-10-08 §3.1).
 *
 * 제품 3개까지, 제품마다 사진 1~4장, 첫 장이 대표. 이 저장소에는 jsdom 이 없어
 * react-test-renderer 로 그리고, 칸이 `onChange` 로 내보낸 목록으로 잰다.
 * 파일 준비(브라우저 캔버스)는 `prepare` 로 가짜를 끼운다.
 */

// 저장된 이미지 고르기는 열 때 서버를 부른다 — 칸 동작과 무관하므로 빈 자리로 둔다.
vi.mock("../SavedImagePicker", () => ({ SavedImagePicker: () => null }));

import { NO_ROOM_MESSAGE, ProductSlots, dropIntoProducts } from "../ProductSlots";

const 사진 = (name: string): PreparedImageDraft => ({
  base64: `QUJD${name}`,
  mimeType: "image/jpeg",
  previewUrl: `data:image/jpeg;base64,QUJD${name}`,
  fileName: name,
});
const 파일 = (name: string) => ({ name, type: "image/jpeg" }) as unknown as File;
const 가짜준비 = async (file: File) => 사진(file.name);

let renderer: ReactTestRenderer;
let changes: PdpProductDraft[][] = [];
let errors: string[] = [];
let cleared = 0;
let notices: string[] = [];

// 칸마다 끌어다 놓기를 받는다 — 그 손잡이가 화면 전체의 파일 놓기를 막으려 window 에 건다.
beforeAll(() => {
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const 칸을그린다 = async (initial: PdpProductDraft[], prepare = 가짜준비) => {
  changes = [];
  errors = [];
  cleared = 0;
  notices = [];
  function Host() {
    const [products, setProducts] = React.useState(initial);
    return (
      <ProductSlots
        products={products}
        prepare={prepare}
        onChange={(next) => { changes.push(next); setProducts(next); }}
        onError={(message) => errors.push(message)}
        onSuccess={(message) => { cleared += 1; notices.push(message); }}
      />
    );
  }
  await act(async () => { renderer = create(<Host />); });
};

const 글자 = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : 글자(child))).join("");
const 단추들 = (말: string) =>
  renderer.root.findAll((node) => node.type === "button" && 글자(node) === 말);
const 누른다 = async (말: string, index = 0) => {
  const button = 단추들(말)[index];
  expect(button, `「${말}」 단추가 없다`).toBeDefined();
  await act(async () => { button!.props.onClick(); });
};
const 마지막 = () => changes.at(-1)!;
const 제품 = (id: string, count: number, name = ""): PdpProductDraft =>
  ({ id, name, photos: Array.from({ length: count }, (_, i) => 사진(`${id}-${i + 1}.jpg`)) }) as PdpProductDraft;
const 파일고른다 = async (index: number, files: File[]) => {
  const inputs = renderer.root.findAll((node) => node.type === "input" && node.props.type === "file");
  await act(async () => {
    await inputs[index]!.props.onChange({ target: { files, value: "x" } });
  });
};

afterEach(() => {
  act(() => renderer?.unmount());
});

describe("제품 칸 늘리고 줄이기", () => {
  it("처음엔 「제품 1」 하나, 「제품 추가」로 칸이 둘이 된다", async () => {
    await 칸을그린다([]);
    expect(JSON.stringify(renderer.toJSON())).toContain("제품 1");
    await 누른다("제품 추가");
    expect(마지막().map((product) => product.id)).toEqual(["p1", "p2"]);
    expect(renderer.root.findAll((node) => node.type === "section").length).toBe(2);
  });

  it("세 칸이면 「제품 추가」가 사라진다", async () => {
    await 칸을그린다([제품("p1", 1), 제품("p2", 1)]);
    expect(단추들("제품 추가").length).toBe(1);
    await 누른다("제품 추가");
    expect(마지막().length).toBe(3);
    expect(단추들("제품 추가").length).toBe(0);
  });

  it("제품 1 에는 「제품 빼기」가 없고, 제품 2 는 뺄 수 있다", async () => {
    await 칸을그린다([제품("p1", 1), 제품("p2", 1)]);
    expect(단추들("제품 빼기").length).toBe(1);
    await 누른다("제품 빼기");
    expect(마지막().map((product) => product.id)).toEqual(["p1"]);
    expect(단추들("제품 빼기").length).toBe(0);
  });

  it("다른 각도·다른 제품을 어디에 넣는지 말한다", async () => {
    await 칸을그린다([]);
    expect(JSON.stringify(renderer.toJSON())).toContain("같은 제품의 다른 각도는 한 칸에, 다른 제품은 칸을 추가해 넣어 주세요.");
  });
});

describe("사진", () => {
  it("다섯 장을 고르면 네 장만 들어가고 안내한다", async () => {
    await 칸을그린다([]);
    await 파일고른다(0, ["1", "2", "3", "4", "5"].map((n) => 파일(`${n}.jpg`)));
    expect(마지막()[0]!.photos.map((photo) => photo.fileName)).toEqual(["1.jpg", "2.jpg", "3.jpg", "4.jpg"]);
    expect(errors.at(-1)).toContain("4장");
  });

  it("네 장이 차면 더하기 단추를 막고 안내한다", async () => {
    await 칸을그린다([제품("p1", 4)]);
    const add = renderer.root.findAll((node) => node.type === "button" && 글자(node).includes("사진 더하기"))[0]!;
    expect(add.props.disabled).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain("4장이 다 찼습니다");
  });

  it("「대표로」를 누르면 그 사진이 맨 앞으로 오고, 첫 장에 「대표」가 붙는다", async () => {
    await 칸을그린다([제품("p1", 3)]);
    // 첫 장은 이미 대표라 「대표로」 단추가 없다 — 둘째 장의 것이 첫 단추다.
    expect(단추들("대표로").length).toBe(2);
    expect(JSON.stringify(renderer.toJSON())).toContain("대표");
    await 누른다("대표로", 1);
    expect(마지막()[0]!.photos.map((photo) => photo.fileName)).toEqual(["p1-3.jpg", "p1-1.jpg", "p1-2.jpg"]);
  });

  it("「빼기」는 그 사진만 뺀다", async () => {
    await 칸을그린다([제품("p1", 2)]);
    await 누른다("빼기", 0);
    expect(마지막()[0]!.photos.map((photo) => photo.fileName)).toEqual(["p1-2.jpg"]);
  });

  it("준비가 실패하면 그 말을 알리고 칸은 그대로다", async () => {
    await 칸을그린다([], async () => { throw new Error("JPEG·PNG·WebP 로 올려 주세요"); });
    await 파일고른다(0, [파일("a.heic")]);
    expect(changes.length).toBe(0);
    expect(errors).toEqual(["JPEG·PNG·WebP 로 올려 주세요"]);
    expect(cleared).toBe(0);
  });

  it("실패 뒤 넣기에 성공하면 앞 오류를 지우게 알린다", async () => {
    let fail = true;
    await 칸을그린다([], async (file) => {
      if (fail) throw new Error("JPEG·PNG·WebP 로 올려 주세요");
      return 사진(file.name);
    });
    await 파일고른다(0, [파일("a.heic")]);
    expect(cleared).toBe(0);
    fail = false;
    await 파일고른다(0, [파일("b.jpg")]);
    expect(마지막()[0]!.photos.map((photo) => photo.fileName)).toEqual(["b.jpg"]);
    expect(cleared).toBe(1);
    expect(errors).toEqual(["JPEG·PNG·WebP 로 올려 주세요"]);
  });

  it("넘친 장이 있으면 오류만 알리고 지우지 않는다", async () => {
    await 칸을그린다([제품("p1", 3)]);
    await 파일고른다(0, [파일("a.jpg"), 파일("b.jpg")]);
    expect(errors.at(-1)).toContain("1장");
    expect(cleared).toBe(0);
  });

  it("준비하는 사이 그 제품 칸을 빼면 사진 자리가 남은 첫 제품에 넣는다 — 「4장까지」라고 틀리게 말하지 않는다", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    await 칸을그린다([제품("p1", 1), 제품("p2", 0)], async (file) => { await gate; return 사진(file.name); });
    const inputs = renderer.root.findAll((node) => node.type === "input" && node.props.type === "file");
    let pending!: Promise<void>;
    await act(async () => { pending = inputs[1]!.props.onChange({ target: { files: [파일("a.jpg")], value: "x" } }); });
    await 누른다("제품 빼기");
    await act(async () => { finish(); await pending; });
    expect(마지막().map((product) => [product.id, product.photos.length])).toEqual([["p1", 2]]);
    expect(errors).toEqual([]);
  });
});

describe("이름", () => {
  it("31자를 넣으면 30자로 잘린다", async () => {
    await 칸을그린다([제품("p1", 1)]);
    const input = renderer.root.find((node) => node.type === "input" && node.props.type !== "file");
    await act(async () => { input.props.onChange({ target: { value: "가".repeat(31) } }); });
    expect(마지막()[0]!.name).toBe("가".repeat(30));
  });

  it("이름 칸에 이름표(「제품 이름(선택)」)와 자리표시 「제품 N」이 있다", async () => {
    await 칸을그린다([제품("p1", 1), 제품("p2", 0)]);
    const inputs = renderer.root.findAll((node) => node.type === "input" && node.props.type !== "file");
    expect(inputs.map((input) => input.props.placeholder)).toEqual(["제품 1", "제품 2"]);
    const labels = renderer.root.findAll((node) => node.type === "label");
    expect(labels.filter((label) => 글자(label).includes("제품 이름(선택)")).length).toBe(2);
    expect(labels.every((label) => inputs.some((input) => input.props.id === label.props.htmlFor))).toBe(true);
  });
});

/**
 * **제품 카드마다 끌어다 놓기·붙여넣기를 받는다**(최종 리뷰 I4). 바깥 칸 하나만 받을 때는
 * 제품 2 카드에 놓아도 사진 자리가 남은 첫 제품(제품 1)에 들어갔다 — 다른 제품이 된다.
 */
describe("제품 카드에 끌어다 놓기·붙여넣기", () => {
  const 옮김 = (files: File[], kind: "drop" | "paste") => {
    const data = { types: ["Files"], files, items: [], dropEffect: "" };
    return {
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation: vi.fn(),
      currentTarget: { contains: () => true },
      target: {},
      ...(kind === "drop" ? { dataTransfer: data } : { clipboardData: data }),
    };
  };
  const 카드 = (index: number) => renderer.root.findAll((node) => node.type === "section")[index]!;
  const 기다린다 = async () => {
    for (let i = 0; i < 4; i += 1) {
      await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
    }
  };

  it("제품 2 카드에 놓으면 제품 2 에 들어가고, 바깥 칸으로 올라가지 않는다", async () => {
    await 칸을그린다([제품("p1", 1), 제품("p2", 1)]);
    const event = 옮김([파일("a.jpg"), 파일("b.jpg")], "drop");
    await act(async () => { 카드(1).props.onDrop(event); });
    await 기다린다();
    expect(마지막().map((product) => [product.id, product.photos.length])).toEqual([["p1", 1], ["p2", 3]]);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(notices).toEqual(["제품 2에 사진 2장을 넣었습니다."]);
  });

  it("카드에 붙여넣으면 그 제품에 넣고, 알림이 제품 이름을 부른다", async () => {
    await 칸을그린다([제품("p1", 1, "레몬맛"), 제품("p2", 0)]);
    const event = 옮김([파일("a.jpg")], "paste");
    await act(async () => { 카드(0).props.onPaste(event); });
    await 기다린다();
    expect(마지막()[0]!.photos.map((photo) => photo.fileName)).toEqual(["p1-1.jpg", "a.jpg"]);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(notices).toEqual(["레몬맛에 사진 1장을 넣었습니다."]);
  });

  it("파일 고르기로 넣어도 같은 알림이다", async () => {
    await 칸을그린다([제품("p1", 0)]);
    await 파일고른다(0, [파일("a.jpg")]);
    expect(notices).toEqual(["제품 1에 사진 1장을 넣었습니다."]);
  });

  it("카드를 누르고 붙여넣을 수 있게 카드가 초점을 받는다", async () => {
    await 칸을그린다([제품("p1", 1), 제품("p2", 0)]);
    expect([0, 1].map((index) => 카드(index).props.tabIndex)).toEqual([0, 0]);
  });
});

/** 숨긴 파일 칸은 탭 차례에 들지 않는다 — 보이는 「사진 더하기」 단추가 연다(C2). */
describe("숨긴 파일 칸", () => {
  it("탭으로 가지 않고 읽어 주지도 않는다", async () => {
    await 칸을그린다([제품("p1", 1)]);
    const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
    expect(input.props.tabIndex).toBe(-1);
    expect(input.props["aria-hidden"]).toBe(true);
  });
});

describe("바깥 칸에 끌어다 놓기·붙여넣기", () => {
  it("사진 자리가 남은 첫 제품에 넣는다", async () => {
    const products = [제품("p1", 4), 제품("p2", 3), 제품("p3", 0)];
    const outcome = await dropIntoProducts(() => products, [파일("a.jpg"), 파일("b.jpg")], 가짜준비);
    expect(outcome.products!.map((product) => product.photos.length)).toEqual([4, 4, 0]);
    expect(outcome.error).toContain("1장");
  });

  it("빈 목록이면 제품 1 을 만든다", async () => {
    const outcome = await dropIntoProducts(() => [], [파일("a.jpg")], 가짜준비);
    expect(outcome.products).toEqual([{ id: "p1", name: "", photos: [사진("a.jpg")] }]);
    expect(outcome.error).toBeUndefined();
  });

  it("모두 찼으면 준비하지 않고 알린다", async () => {
    const prepare = vi.fn(가짜준비);
    const outcome = await dropIntoProducts(() => [제품("p1", 4)], [파일("a.jpg")], prepare);
    expect(outcome).toEqual({ error: NO_ROOM_MESSAGE });
    expect(NO_ROOM_MESSAGE).toBe("사진 자리가 모두 찼습니다. 제품당 4장까지 넣을 수 있습니다.");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("준비하는 동안 바뀐 목록에 넣는다 — 기다리기 전 목록을 쥐고 있지 않는다", async () => {
    let current: PdpProductDraft[] = [제품("p1", 1)];
    const outcome = await dropIntoProducts(() => current, [파일("a.jpg")], async (file) => {
      current = [제품("p1", 1, "레몬맛")];
      return 사진(file.name);
    });
    expect(outcome.products![0]!.name).toBe("레몬맛");
  });
});

describe("상세페이지 화면 연결", () => {
  const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");

  it("대표 사진은 제품 목록에서 파생한다", () => {
    expect(client).toContain("const [products, setProducts] = useState<PdpProductDraft[]>([]);");
    expect(client).toContain("const preparedImage = primaryPhoto(products);");
    expect(client).not.toContain("setPreparedImage");
  });

  it("초안에 제품 목록을 싣고, 옛 초안은 한 장을 제품 1 로 연다", () => {
    expect(client).toContain("setProducts(draft.products ?? productsFromLegacy(draft.preparedImage));");
    expect(client).toMatch(/preparedImage,\s*\n\s*products,/);
  });

  it("사진 없는 칸이 있으면 분석을 막고 말한다", () => {
    expect(client).toContain("productsReady(products)");
    expect(client).toContain("사진이 없는 제품 칸이 있습니다");
  });

  it("올리기 자리는 제품 칸이고, 첫 화면이 여러 장을 알린다", () => {
    expect(client).toContain("<ProductSlots");
  });

  it("칸의 오류는 옛 「로그 보기」 내용을 떼고, 넣기에 성공하면 오류를 지운다", () => {
    const at = client.indexOf("<ProductSlots");
    const tag = client.slice(at, client.indexOf("/>", at));
    expect(tag).toMatch(/onError=\{\(message\) => \{ setErrorMessage\(message\); setErrorDetail\(""\);/);
    expect(tag).toMatch(/onSuccess=\{\(message\) => \{ setErrorMessage\(""\); setErrorDetail\(""\); setShowErrorDetail\(false\); setNotice\(message\);/);
    expect(client).toContain("상품 사진 한 장이면 됩니다. 다른 각도·다른 제품도 함께 올릴 수 있습니다.");
  });

  it("바깥 칸에 놓았을 때도 알림이 어느 제품에 넣었는지 부른다", () => {
    expect(client).toContain("setNotice(joinMessages(placedMessage(outcome), \"설정을 확인한 뒤 AI 분석을 시작해 보세요.\", dropNotice));");
  });

  // 3단계 T18: 「업로드 후 자동 압축합니다」는 이제 틀린 말이다 — 원본 화질 그대로 그림에 쓴다.
  it("올리기 칸 머리말이 여러 각도·여러 제품과 원본 화질을 말한다", () => {
    expect(client).toContain("한 장만 올려도 됩니다. 같은 제품의 다른 각도는 한 칸에, 다른 제품은 칸을 추가해 넣어 주세요. 원본 화질 그대로 그림에 씁니다.");
    expect(client).not.toContain("업로드 후 AI 전송용으로 자동 압축합니다.");
  });
});
