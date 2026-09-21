import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **자른 자리가 자른 사실을 보고해야 한다**(F-7-0).
 *
 * 고지 문구를 조립하는 자(`coverage.ts`)를 만들어 둬도, **자르는 곳이 숫자를
 * 안 넘기면 아무것도 안 고친 것**이다. 이 저장소가 이미 겪은 꼴이다 —
 * 조립기는 있는데 쓰는 곳이 없었다(X-07).
 *
 * 자르는 자리는 브라우저 코드(pdfjs·캔버스) 안이라 여기서 돌려 볼 수 없다.
 * **글로 잠근다** — 다른 방법이 없어서이지 이것이 더 나아서가 아니다.
 */

const 읽기 = (name: string) =>
  readFileSync(new URL(`../${name}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("자르는 곳이 잘랐다고 알린다", () => {
  const files = 읽기("redesign-files.ts");
  const transcribe = 읽기("transcribe-client.ts");
  const wizard = 읽기("redesign-wizard.tsx");

  /**
   * **낱말만 보면 값이 틀려도 못 잡는다.**
   *
   * 처음에는 「`totalPages` 라는 글자가 있는가」만 봤다. 그러면
   * `totalPages: pages.length` 로 바꿔도 초록이다 — 늘 「4쪽 중 4쪽」이 되어
   * 아무것도 안 잘린 것처럼 보인다(2026-09-21 변이에서 드러남).
   */
  it("**PDF 쪽수를 원본에서 가져온다**", () => {
    const pdf = files.slice(files.indexOf("export async function renderPdfToImages"));

    expect(pdf.slice(0, 1600)).toMatch(/const totalPages = pdf\.numPages/);
    expect(pdf.slice(0, 1600)).toMatch(/return \{ pages, totalPages \}/);
  });

  /**
   * **세는 일은 `coverage.ts` 가 한다.** 브라우저 코드 안에서 세면 돌려 볼
   * 수 없다 — 실제로 2026-09-21 변이에서 그 계산을 망가뜨려도 아무 시험도
   * 안 빨개졌다.
   */
  it("**참조 정규화가 세는 자를 쓴다**", () => {
    const normalize = files.slice(files.indexOf("export async function normalizeFilesForUpload"));

    expect(normalize.slice(0, 2000)).toContain("referenceCuts({ produced, kept, pdfPages })");
  });

  it("**참조 정규화가 자른 뒤의 것을 넘긴다** — 자르기 전을 넘기면 거짓말이 된다", () => {
    const normalize = files.slice(files.indexOf("export async function normalizeFilesForUpload"));

    expect(normalize.slice(0, 2000)).toMatch(/const kept = produced\.slice\(0, MAX_REFERENCE_FILES\)/);
  });

  it("**전사 조각내기가 쪽수를 보고한다**", () => {
    const split = transcribe.slice(transcribe.indexOf("export async function splitFilesToStrips"));

    expect(split.slice(0, 2000)).toContain('"transcribe-pdf-pages"');
  });

  it("**전사 조각내기도 세는 자를 쓴다**", () => {
    const split = transcribe.slice(transcribe.indexOf("export async function splitFilesToStrips"));

    expect(split.slice(0, 2400)).toContain("stripCuts({ used: out.length, wanted: 자르려던조각");
  });

  it("**화면이 그것을 모아 고지한다**", () => {
    expect(wizard).toContain("coverageNotice(");
  });

  /**
   * **토스트로 알리면 다음 토스트가 덮는다.** 생성 시작 문구가 곧바로 따라온다.
   * 남는 자리에 띄워야 한다.
   */
  it("**사라지지 않는 자리에 띄운다**", () => {
    expect(wizard).toContain("setCoverageWarning(");
    expect(wizard).toMatch(/coverageWarning/);
  });
});

/**
 * **한 번 뜬 고지가 안 지워지면 거짓말이 된다**(2026-09-21 리뷰).
 *
 * 처음 판은 설정하는 곳이 한 군데뿐이었다. 그래서
 *
 *   · 자료를 바꿔도 옛 경고가 남고
 *   · 파일을 다 지우면 조기 반환으로 그대로 남으며
 *   · 정규화가 터지거나 취소되면 설정 지점에 못 닿아 남는다
 *
 * 그 사이 화면의 경고는 **지금 자료와 무관한 숫자**다.
 */
describe("고지를 제때 지운다", () => {
  const wizard = 읽기("redesign-wizard.tsx");

  it("**생성을 시작하면 옛 고지를 지운다**", () => {
    const 시작 = wizard.slice(wizard.indexOf("async function generate("));

    expect(시작.slice(0, 1200)).toContain('setCoverageWarning("")');
  });

  it("**자료를 바꾸면 지운다**", () => {
    expect(wizard).toMatch(/setFiles=\{\(next\) => \{ setCoverageWarning\(""\);/);
  });

  it("**지우는 곳이 설정하는 곳보다 많다** — 한 군데뿐이면 남는 길이 생긴다", () => {
    const 지움 = [...wizard.matchAll(/setCoverageWarning\(""\)/g)].length;
    const 설정 = [...wizard.matchAll(/setCoverageWarning\(coverageNotice/g)].length;

    expect(지움).toBeGreaterThanOrEqual(설정 + 1);
  });
});

