import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **받기 시작하기 전에 주소를 버리지 않는다.**
 *
 * `URL.createObjectURL` 로 만든 주소를 너무 일찍 거두면 브라우저에 따라
 * 다운로드가 시작도 못 하고 끝난다. 특히 큰 ZIP 에서 그렇다.
 *
 * 그리고 `<a>` 를 문서에 안 붙이면 일부 브라우저가 클릭을 무시한다. 이
 * 저장소의 다른 다운로드(`image-viewer.tsx`)는 붙인다 — 두 곳이 다르면
 * 한쪽만 고쳐지는 날이 온다.
 */
describe("파일 받기", () => {
  /*
    이 저장소의 시험은 DOM 없이 돈다(`vitest.config.ts` 에 jsdom 이 없다).
    그래서 소스에서 잰다 — 브라우저 동작은 `w6-*-browser.cjs` 가 본다.
  */
  const source = readFileSync(new URL("../pdp-canvas-utils.ts", import.meta.url), "utf8");
  const 함수 = source.slice(source.indexOf("export function downloadBlob"), source.indexOf("export function sanitizeSectionFileName"));

  it("**앵커를 문서에 붙였다가 치운다**", () => {
    expect(함수).toContain("document.body.appendChild(link)");
    expect(함수).toContain("document.body.removeChild(link)");
  });

  it("주소를 결국에는 거둔다 — 안 거두면 메모리에 남는다", () => {
    expect(source).toContain("revokeObjectURL");
    // 0ms 는 너무 이르다. 받기가 시작하기 전에 사라질 수 있다.
    expect(source).not.toContain("URL.revokeObjectURL(url), 0)");
  });
});

/**
 * **그림을 못 읽으면 그렇다고 말한다.**
 *
 * 손상된 초안을 열면 빈 캔버스 위에 글자 레이어만 떠 있었다. 사용자는 무엇이
 * 잘못됐는지 모른 채 이미지가 사라졌다고 본다.
 */
describe("그림을 못 읽을 때", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../SectionPreview.tsx", import.meta.url), "utf8");

  it("편집 캔버스가 오류를 알린다", () => {
    /*
      **그 `<img>` 안을 본다.** 파일 전체에서 `onError` 를 찾으면 다른 자리의
      것에 걸려, 정작 캔버스에서 지워도 통과한다.
    */
    const 자리 = editor.indexOf("className={styles.sectionImage}");
    expect(자리).toBeGreaterThan(0);
    expect(editor.slice(자리, 자리 + 700)).toContain("onError={() =>");
  });

  it("미리보기도 알린다 — 갤러리에서도 같은 일이 생긴다", () => {
    expect(preview).toContain("onError");
  });
});
