import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPageWire } from "../page-wire";

/**
 * 운반 배선을 **값으로** 잰다.
 *
 * 독립 리뷰가 이 자리를 짚었다 — 한 줄(`attachmentIntents,`)을 지워도 시험
 * 1,357건이 전부 통과했다. 조용하고, 타입도 통과하고, 돈은 나간다. 2026-09-08
 * 카드뉴스 사고와 같은 실패 모양이 한 칸 앞으로 옮겨진 것이었다.
 */

const 기본 = {
  imageModel: "nano-banana" as const,
  outputMode: "full-image" as const,
  userInstruction: "",
};

describe("페이지 값이 하나도 빠지지 않는다", () => {
  it("넣은 것이 그대로 나온다", () => {
    expect(
      buildPageWire({
        ...기본,
        look: "anime",
        userInstruction: "밤 장면으로",
        preserveProduct: false,
        styleReference: { imageBase64: "REF", mimeType: "image/png", description: "참고" },
        referenceModel: { base64: "PERSON", mimeType: "image/png", fileName: "p.png" },
        referenceModelUsage: "all-sections",
        attachmentIntents: { style: "색만 가져와", anchor: "라벨 그대로" },
        pageContext: "여름 시즌, 인스타 유입",
      }),
    ).toEqual({
      imageModel: "nano-banana",
      outputMode: "full-image",
      look: "anime",
      userInstruction: "밤 장면으로",
      preserveProduct: false,
      styleReference: { imageBase64: "REF", mimeType: "image/png", description: "참고" },
      referenceModel: { imageBase64: "PERSON", mimeType: "image/png", fileName: "p.png" },
      referenceModelUsage: "all-sections",
      attachmentIntents: { style: "색만 가져와", anchor: "라벨 그대로" },
      pageContext: "여름 시즌, 인스타 유입",
    });
  });

  /** 「그 밖에 · 채널과 시즌」. 이 줄을 지워도 2,006건이 통과했다. */
  it("페이지 배경 설명이 실린다", () => {
    expect(buildPageWire({ ...기본, pageContext: "여름 시즌" }).pageContext).toBe("여름 시즌");
  });

  it("자리별 지시가 실린다", () => {
    expect(
      buildPageWire({ ...기본, attachmentIntents: { person: "안경을 씌워 주세요" } })
        .attachmentIntents,
    ).toEqual({ person: "안경을 씌워 주세요" });
  });

  it("인물 사진의 열쇠 이름이 그물 이름으로 바뀐다", () => {
    const wire = buildPageWire({
      ...기본,
      referenceModel: { base64: "PERSON", mimeType: "image/jpeg" },
    });
    expect(wire.referenceModel).toEqual({
      imageBase64: "PERSON",
      mimeType: "image/jpeg",
      fileName: undefined,
    });
  });
});

describe("빈 값은 안 싣는다", () => {
  it("공백만 적은 배경 설명은 없는 것으로 보낸다", () => {
    expect(buildPageWire({ ...기본, pageContext: "   " }).pageContext).toBeUndefined();
  });

  it("공백만 적은 지시는 없는 것으로 보낸다", () => {
    expect(buildPageWire({ ...기본, userInstruction: "   " }).userInstruction).toBeUndefined();
  });

  it("인물 사진이 없으면 그 칸이 아예 없다", () => {
    expect(buildPageWire({ ...기본, referenceModel: null }).referenceModel).toBeUndefined();
  });

  it("아무것도 안 넣으면 필수 값만 남는다", () => {
    const wire = buildPageWire(기본);
    expect(wire.imageModel).toBe("nano-banana");
    expect(wire.attachmentIntents).toBeUndefined();
    expect(wire.styleReference).toBeUndefined();
  });
});

/**
 * **앵커가 실물인지 만들어 낸 것인지 실어 보낸다**(U-03).
 *
 * 글 경로의 앵커는 `TextModeFlow` 가 만든 대표 이미지다. 그것을 「판매 중인
 * 제품, 라벨 글자까지 지켜라」로 선언하면 그 안의 헤드라인 글자가 페이지
 * 전체에 되풀이된다.
 */
describe("앵커가 무엇인지 알린다", () => {
  it("실린다", () => {
    expect(buildPageWire({ ...기본, anchorKind: "key-visual" }).anchorKind).toBe("key-visual");
    expect(buildPageWire({ ...기본, anchorKind: "product-photo" }).anchorKind).toBe("product-photo");
  });

  it("안 주면 안 싣는다 — 서버가 실물로 본다", () => {
    expect(buildPageWire(기본).anchorKind).toBeUndefined();
  });

  it("**편집기가 시작 방식으로 정한다** — 글 경로를 실물로 보고하면 안 된다", () => {
    const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

    expect(editor).toContain('anchorKind: startMode === "text" ? "key-visual" : "product-photo"');
  });
});

/**
 * **둘 다 골랐을 때의 선택이 서버까지 간다**(U-04).
 *
 * 안 보내면 서버가 말없이 업로드를 쓴다. 캐릭터를 고른 사용자는 이미지가 나온
 * 뒤에야 안다.
 */
describe("인물 선택을 실어 보낸다", () => {
  it("실린다", () => {
    expect(buildPageWire({ ...기본, personSource: "character" }).personSource).toBe("character");
    expect(buildPageWire({ ...기본, personSource: "uploaded" }).personSource).toBe("uploaded");
  });

  it("안 골랐으면 안 싣는다 — 서버가 지금까지의 동작을 쓴다", () => {
    expect(buildPageWire(기본).personSource).toBeUndefined();
  });

  it("**편집기가 넘긴다** — 화면에서 골라도 안 보내면 소용없다", () => {
    const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
    const start = editor.indexOf("buildPageWire({");
    const wire = editor.slice(start, editor.indexOf("});", start));

    expect(wire).toContain("personSource,");
  });
});

/**
 * **사진 없이 실물을 팔 때**(N-2, 설계 §9.1).
 *
 * 글로만 「나무 도마를 팝니다」라고 적으면 우리는 나무 도마를 **지어낸다.**
 * 그 그림에는 실제로 파는 물건과 다른 결·색·모양이 그려지고, 사용자는 그것을
 * 상세페이지에 올린다.
 *
 * 설계 §9.1: 「참고용 외형 없는 실물 입력은 **임의 제품을 실제 제품처럼 생성
 * 승인하지 않는다**」.
 */
describe("개념 시안 판단이 요청에 실린다", () => {
  it("**실물인데 실제 사진이 없으면 실린다**", () => {
    const wire = buildPageWire({ ...기본, productKind: "physical", anchorKind: "key-visual" });

    expect(wire.conceptOnly).toBe(true);
  });

  it("**실제 제품 사진이 있으면 안 실린다**", () => {
    const wire = buildPageWire({ ...기본, productKind: "physical", anchorKind: "product-photo" });

    expect(wire.conceptOnly).toBeFalsy();
  });

  /**
   * **앵커 종류를 안 보내면 실물 사진으로 본다.** 사진 경로의 기본값이고,
   * 거기서는 업로드한 사진이 곧 실물 증거다.
   */
  it("**앵커 종류를 안 보내면 안 실린다**", () => {
    expect(buildPageWire({ ...기본, productKind: "physical" }).conceptOnly).toBeFalsy();
  });

  it("**무형 상품이나 안 밝힌 경우에는 안 실린다** — 보여 줄 실물이 없거나 모른다", () => {
    for (const kind of ["service", "digital", undefined]) {
      const wire = buildPageWire({ ...기본, productKind: kind as never, anchorKind: "key-visual" });

      expect(wire.conceptOnly, String(kind)).toBeFalsy();
    }
  });
});
