import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 글꼴이 **실제로 실려 있는지** 본다.
 *
 * 이 저장소는 오랫동안 `--font-sans` 맨 앞에 `"Pretendard"` 를 적어 두고
 * 그것을 **부르지 않았다.** 그래서 만드는 사람(서버 렌더링용으로 깔아 둔)과
 * 손님(맑은 고딕으로 떨어지는)이 서로 다른 글꼴을 보고 있었다. 화면에
 * 오류가 나지 않으니 아무도 몰랐다 — 이 시험이 그 종류의 침묵을 막는다.
 */
const WEB = process.cwd();
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

const fontCss = read("app/pretendard.css");
const layout = read("app/layout.tsx");
const tokens = read("../../packages/ui/src/styles/globals.css");
const heroCss = read("app/_landing/hero/hero.css");

const CHUNK_DIR = "public/fonts/pretendard";
const cssUrls = [...fontCss.matchAll(/url\("([^"]+)"\)/g)].map((found) => found[1]);

describe("Pretendard 웹폰트", () => {
  it("얼굴 아흔둘을 다 담는다", () => {
    // 조각 하나가 빠지면 그 유니코드 범위의 글자만 딴 글꼴로 나온다.
    expect(fontCss.match(/@font-face/g) ?? []).toHaveLength(92);
    expect(cssUrls).toHaveLength(92);
  });

  it("CSS 가 가리키는 파일이 전부 있다", () => {
    for (const url of cssUrls) {
      expect(url.startsWith("/fonts/pretendard/"), `${url} 가 우리 자리가 아니다`).toBe(true);
      const file = path.join(WEB, "public", url.replace(/^\//, ""));
      expect(existsSync(file), `${url} 파일이 없다`).toBe(true);
    }
  });

  it("담아 둔 파일이 전부 CSS 에 쓰인다 — 안 쓰는 무게를 릴리스에 싣지 않는다", () => {
    const files = readdirSync(path.join(WEB, CHUNK_DIR)).filter((name) => name.endsWith(".woff2"));
    expect(files.length).toBe(92);
    const used = new Set(cssUrls.map((url) => path.basename(url)));
    for (const file of files) {
      expect(used.has(file), `${file} 이 CSS 에 없다`).toBe(true);
    }
  });

  /**
   * **얼굴마다 센다.** `toContain` 은 아흔둘 중 하나만 있어도 통과한다 —
   * 실제로 한 곳에서 `font-display` 를 지우는 변이가 그렇게 빠져나갔다.
   * 조각 하나에서 값이 빠지면 그 유니코드 범위의 글자만 딴 결로 나온다.
   */
  it("아흔둘이 전부 가변 굵기를 덮는다", () => {
    // 랜딩은 700·800·900 을 쓴다. 정적 두 벌(400·700)만 실으면 브라우저가
    // 억지로 굵게 만들어 획이 뭉갠다.
    expect(fontCss.match(/font-weight: 45 920/g) ?? []).toHaveLength(92);
    expect(fontCss.match(/woff2-variations/g) ?? []).toHaveLength(92);
  });

  it("아흔둘이 전부 받는 동안 글을 남긴다", () => {
    // `swap` 이 없으면 그 조각을 받는 최대 3초간 글자가 비어 보인다.
    expect(fontCss.match(/font-display: swap/g) ?? []).toHaveLength(92);
  });

  it("바깥에서 받아 오지 않는다 — 릴리스가 제 글꼴을 안고 간다", () => {
    /**
     * CDN 을 타면 그 망에서 막힌 손님만 다른 글꼴을 본다.
     *
     * **파일 전체가 아니라 `url()` 만 본다.** 머리말에 원본 저장소와 라이선스
     * 주소를 적어 뒀는데, 그것까지 잡으면 출처를 지우게 된다.
     */
    expect(cssUrls.length).toBeGreaterThan(0);
    for (const url of cssUrls) {
      expect(url.startsWith("/"), `${url} 가 우리 서버 밖을 가리킨다`).toBe(true);
      expect(url).not.toMatch(/^\/\//);
    }
  });

  it("`unicode-range` 로 갈라 둬서 쓰인 조각만 받는다", () => {
    /**
     * 한 덩어리로 실으면 2.0MB 를 첫 화면에서 다 받는다. 갈라 두면 브라우저가
     * 글에 실제로 쓰인 조각만 받는다 — 실측 18~50개, 460KB 아래.
     */
    expect(fontCss.match(/unicode-range:/g) ?? []).toHaveLength(92);
  });
});

describe("글꼴 배선", () => {
  it("앱이 이 CSS 를 부른다", () => {
    // 안 부르면 파일만 저장소에 있고 화면은 그대로 맑은 고딕이다.
    expect(layout).toContain('import "./pretendard.css"');
  });

  it("`--font-sans` 맨 앞이 우리가 부르는 이름이다", () => {
    const line = tokens.slice(tokens.indexOf("--font-sans:"));
    expect(line.slice(0, 120)).toContain('"Pretendard Variable"');
    // 옛 이름도 남긴다 — 깔아 둔 사람은 조각을 받기 전에도 그것으로 보인다.
    expect(line.slice(0, 200)).toContain('"Pretendard"');
  });

  it("`@font-face` 의 이름과 `--font-sans` 의 이름이 같다", () => {
    // 한 글자만 달라도 아무 일 없이 시스템 글꼴로 떨어진다.
    const declared = /font-family:\s*'([^']+)'/.exec(fontCss)?.[1];
    expect(declared).toBe("Pretendard Variable");
    expect(tokens).toContain(`"${declared}"`);
  });

  it("첫 화면 히어로도 같은 글꼴을 쓴다", () => {
    /**
     * 전에는 `.mcs-hero` 만 제 스택을 갖고 있어 Pretendard 를 안 불렀다 —
     * 첫 화면과 그 아래 섹션이 다른 글꼴로 보였다.
     */
    const hero = heroCss.slice(heroCss.indexOf(".mcs-hero {"), heroCss.indexOf(".mcs-hero-canvas"));
    expect(hero).toContain("font-family: var(--font-sans)");
    expect(hero).not.toContain("Malgun Gothic");
  });
});
