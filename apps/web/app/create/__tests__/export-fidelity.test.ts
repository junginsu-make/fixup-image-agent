import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportScaleFor, needsRecomposite, exportFileName } from "../export-fidelity";

/**
 * **내려받은 그림이 만든 그림과 같아야 한다.**
 *
 * 지금은 편집 캔버스 폭(최대 460px)에 2를 곱해 굽는다. 1536px 로 만든 것이
 * 최대 920px 로 나간다 — **폭 60%, 넓이로는 36%** 다. 상세페이지는 확대해서
 * 보는 물건이라 이 손실이 그대로 보인다.
 *
 * 레이어 좌표는 캔버스 폭 기준이므로, **배율만 원본에 맞추면** 배치는 그대로
 * 두고 해상도만 되찾을 수 있다.
 */
describe("어느 배율로 구울 것인가", () => {
  it("원본 크기를 되찾는 배율을 쓴다", () => {
    // 460px 캔버스로 1536px 원본을 되찾으려면 3.34배다.
    expect(exportScaleFor({ naturalWidth: 1536, canvasWidth: 460 })).toBeCloseTo(1536 / 460);
  });

  it("**좁은 화면에서 작업했어도 원본 해상도로 나간다**", () => {
    // 휴대폰(300px)에서 배치했어도 결과물은 같아야 한다.
    const 좁게 = exportScaleFor({ naturalWidth: 1536, canvasWidth: 300 });
    expect(Math.round(300 * 좁게)).toBe(1536);
  });

  it("원본이 캔버스보다 작으면 늘리지 않는다", () => {
    expect(exportScaleFor({ naturalWidth: 300, canvasWidth: 460 })).toBe(1);
  });

  it("**너무 큰 배율은 막는다** — 브라우저가 못 버티면 한 장도 못 받는다", () => {
    expect(exportScaleFor({ naturalWidth: 12000, canvasWidth: 300 })).toBeLessThanOrEqual(8);
  });

  it("크기를 모르면 지금까지의 2배로 떨어진다", () => {
    expect(exportScaleFor({ naturalWidth: 0, canvasWidth: 460 })).toBe(2);
  });
});

/**
 * **얹은 것이 없으면 원본 그대로 준다.**
 *
 * 다시 구우면 JPEG 로 바뀌면서 손실이 난다. 글자도 도형도 없는데 그럴 이유가 없다.
 */
describe("다시 구울 필요가 있는가", () => {
  it("레이어가 없으면 원본을 그대로 쓴다", () => {
    expect(needsRecomposite([])).toBe(false);
  });

  it("글자가 있으면 합쳐야 한다", () => {
    expect(needsRecomposite([{ kind: "text" }] as never)).toBe(true);
  });

  it("도형만 있어도 합쳐야 한다", () => {
    expect(needsRecomposite([{ kind: "shape" }] as never)).toBe(true);
  });
});

describe("파일 이름", () => {
  it("원본을 그대로 줄 때는 원래 형식의 확장자를 쓴다", () => {
    expect(exportFileName("s1", "image/png", false)).toBe("pdp-s1.png");
    expect(exportFileName("s1", "image/webp", false)).toBe("pdp-s1.webp");
  });

  it("합쳐서 구운 것은 jpg 다", () => {
    expect(exportFileName("s1", "image/png", true)).toBe("pdp-s1.jpg");
  });

  it("**AI 가 지은 이름이 파일명을 벗어나지 못한다**", () => {
    expect(exportFileName("../../etc", "image/png", true)).not.toContain("..");
  });
});

/**
 * **배선이 실제로 닿았는가.**
 *
 * 위 함수들이 맞아도 화면이 안 부르면 아무 일도 안 일어난다. 그 한 줄은 지워도
 * 나머지가 전부 통과한다 — 이 저장소가 겪은 그 구멍이다(`page-wire.ts` 머리말).
 */
/** 줄 나누기·주석 거르기. 정규식을 본문에 적으면 셸을 거치며 깨진다. */
const NEWLINE_RE = new RegExp(String.raw`?
`);
const COMMENT_LINE_RE = new RegExp(String.raw`^\s*(\*|/\*|//)`);

describe("화면이 실제로 쓰는가", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

  it("**원본 해상도로 굽는다** — 고정 2배가 아니다", () => {
    expect(editor).toContain("scale: exportScaleFor(");
    expect(editor).not.toMatch(/scale:\s*2\s*,/);
  });

  it("얹은 것이 없으면 다시 굽지 않는다", () => {
    expect(editor).toContain("if (!needsRecomposite(layers))");
  });

  it("**라이브러리 저장이 완성본을 올린다** — 원본만 올리지 않는다", () => {
    const 저장함수 = editor.slice(
      editor.indexOf("const handleSaveToLibrary"),
      editor.indexOf("const handleDownloadAll"),
    );

    expect(저장함수).toContain("captureSectionBlob");
  });

  it("**한 장씩 굽는다** — 동시에 돌리면 휴대폰에서 탭이 죽는다", () => {
    /*
      **주석을 걷어내고 본다.** 「전에는 `Promise.all` 이었다」고 적어 둔 설명이
      검사에 걸리면, 고쳐 놓고도 빨개진다. 리뷰가 같은 함정을 지적했다.
    */
    const 저장함수 = editor
      .slice(editor.indexOf("const handleSaveToLibrary"), editor.indexOf("const handleDownloadAll"))
      .split(NEWLINE_RE)
      .filter((line) => !COMMENT_LINE_RE.test(line))
      .join(String.fromCharCode(10));

    expect(저장함수).not.toContain("Promise.all");
    expect(저장함수).toContain("for (const { section, index } of libraryEntries");
  });

  it("**한 장이 실패해도 나머지를 살린다**", () => {
    const 저장함수 = editor.slice(
      editor.indexOf("const handleSaveToLibrary"),
      editor.indexOf("const handleDownloadAll"),
    );

    // 굽기에 실패하면 원본 바이트로 떨어뜨린다.
    expect(저장함수).toContain("} catch {");
    expect(저장함수).toContain("원본으로.push(");
  });

  it("파일 이름을 형식에 맞춰 짓는다", () => {
    expect(editor).toContain("exportFileName(");
  });
});

/**
 * **참고용 저장은 원본 그대로다.**
 *
 * 「참고 이미지로 저장」·「레퍼런스로 저장」은 다음 작업의 바탕이 되는 그림이다.
 * 글자가 박힌 것을 바탕으로 쓰면 그 글자가 다음 그림에 따라 들어간다.
 * 완성본 보관과 **뜻이 다르므로** 함께 바꾸지 않는다(리뷰 §14.2 의 판단).
 */
describe("참고용 저장은 원본을 유지한다", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
  const gallery = readFileSync(new URL("../SectionGallery.tsx", import.meta.url), "utf8");

  /*
    **함수 구간을 잘라 「합성을 안 한다」를 잰다.**

    전에는 `expect(gallery).toContain("generatedImage")` 였는데, 그 낱말은
    화면 표시용으로만 스물여섯 군데 있어 **참고용 저장을 합성본으로 바꿔 놓아도
    통과했다.** 지킨다고 적어 두고 아무것도 안 지키는 시험이었다.
  */
  const 구간 = (source: string, 시작: string, 끝: string) => {
    const at = source.indexOf(시작);
    if (at < 0) throw new Error(`${시작} 을 못 찾음`);
    const to = source.indexOf(끝, at);
    return source.slice(at, to > at ? to : at + 1500);
  };

  it("참고 이미지 저장은 원본을 쓴다 — 합성본을 올리지 않는다", () => {
    const 블록 = 구간(editor, "<SaveImagesToLibrary", "/>");

    expect(블록).toContain("section.generatedImage as string");
    expect(블록).not.toContain("captureSectionBlob");
  });

  it("레퍼런스로 저장도 원본을 쓴다", () => {
    const 함수 = 구간(gallery, "const saveAsReference", "const ");

    expect(함수).toContain("section.generatedImage");
    expect(함수).not.toContain("captureSectionBlob");
  });
});
