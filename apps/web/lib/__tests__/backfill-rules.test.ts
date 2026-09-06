import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 백필 스크립트는 앱 코드를 부르지 않는다 — 같은 규칙을 **베껴 적는다.**
 *
 * 한쪽만 고치면 조용히 어긋난다. 실제로 그런 일이 있었다: 격자 사본의 픽셀
 * 상한을 앱에서 40MP 로 올렸는데 스크립트는 12MP 로 남아, 아이폰 기본
 * 사진(4032×3024=12.19MP)이 백필에서 **전량 실패**했다. 실패한 행은 커서가
 * 지나쳐 다시 오지 않으므로, 격자에서 가장 무거운 것들만 원본으로 남는다.
 *
 * 화면에 안 보이는 고장이라 사람이 알아채지 못한다. 그래서 숫자를 맞대 본다.
 *
 * **선언만 보지 않는다.** 앱에서 상수를 선언해 두고 `sharp` 에 다른 값을 넘기면
 * 선언끼리는 여전히 같으므로 통과해 버린다. 실제로 그 뮤테이션이 이 시험을
 * 그냥 지나갔다 — 그래서 「쓰는 자리」도 함께 본다.
 */
const web = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.resolve(web, relative), "utf8");
const script = readFileSync(path.resolve(web, "../../scripts/backfill-thumbnails.mjs"), "utf8");

/** 함수 하나의 본문. 다음 최상위 선언 전까지를 자른다. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}`);
  if (start < 0) throw new Error(`${name} 을 찾지 못했습니다.`);
  const rest = source.slice(start + 1);
  const end = rest.search(/^(?:async )?function /m);
  const body = end < 0 ? rest : rest.slice(0, end);
  // 잘라 낸 조각이 실제로 그 함수의 알맹이를 담는지 확인한다. 자르는 규칙이
  // 어긋나면 이 아래의 모든 검사가 조용히 헛돈다.
  if (body.length < 200) throw new Error(`${name} 본문이 너무 짧습니다(${body.length}자).`);
  return body;
}

function constantIn(source: string, name: string, where: string): string {
  const found = source.match(new RegExp(`const ${name} = ([0-9_]+)`));
  if (!found) throw new Error(`${where} 에서 ${name} 을 찾지 못했습니다.`);
  return found[1];
}

describe("격자 사본 — 앱과 백필이 같은 규칙을 쓰는지", () => {
  const grid = read("lib/grid-thumbnail.ts");

  it("픽셀 상한이 같다 — 어긋나면 무거운 사진만 사본을 못 받는다", () => {
    expect(constantIn(script, "GRID_MAX_PIXELS", "백필"))
      .toBe(constantIn(grid, "GRID_MAX_PIXELS", "앱"));
  });

  it("앱이 그 상한을 실제로 sharp 에 넘긴다 — 선언만 맞추면 시험이 헛돈다", () => {
    expect(grid).toMatch(/limitInputPixels: GRID_MAX_PIXELS/);
  });

  it("백필도 그 상한을 실제로 넘겨 쓴다", () => {
    expect(script).toMatch(/thumbnailFor\(\s*bytes,\s*512,\s*78,\s*true,\s*GRID_MAX_PIXELS\s*\)/);
  });

  it("가로·품질이 같다", () => {
    expect(constantIn(grid, "GRID_WIDTH", "앱")).toBe("512");
    expect(constantIn(grid, "GRID_QUALITY", "앱")).toBe("78");
    expect(script).toMatch(/thumbnailFor\(\s*bytes,\s*512,\s*78,/);
  });
});

/**
 * 나머지 다섯 갈래.
 *
 * 지금은 전부 일치한다. 그런데 「베껴 적으므로 조용히 어긋난다」는 전제는
 * 격자에만 있는 것이 아니라 **다섯 갈래에 그대로 남아 있다.** 격자 하나만
 * 지키면 다음 어긋남은 다른 갈래에서 난다.
 */
describe("나머지 갈래 — 앱과 백필이 같은 규칙을 쓰는지", () => {
  it("라이브러리: 512 · q78", () => {
    const app = read("lib/image-encoding.ts");
    expect(constantIn(app, "THUMBNAIL_EDGE", "앱")).toBe(constantIn(script, "THUMBNAIL_EDGE", "백필"));
    expect(app).toMatch(/\.resize\(THUMBNAIL_EDGE, THUMBNAIL_EDGE, \{ fit: "inside", withoutEnlargement: true \}\)/);
    expect(app).toMatch(/\.webp\(\{ quality: 78 \}\)/);
    expect(script).toMatch(/const THUMBNAIL_EDGE = 512;/);
    expect(script).toMatch(/quality = 78/);
  });

  it("갤러리: 가로 1024 · q82", () => {
    const app = read("app/api/showcase/store.ts");
    expect(constantIn(app, "SHOWCASE_THUMBNAIL_WIDTH", "앱"))
      .toBe(constantIn(script, "SHOWCASE_WIDTH", "백필"));
    expect(app).toMatch(/\.webp\(\{ quality: 82 \}\)/);
    expect(script).toMatch(/thumbnailFor\(\s*bytes,\s*SHOWCASE_WIDTH,\s*82,\s*true\s*\)/);
  });

  it("포스터: 가로 1024 · q88", () => {
    const app = read("lib/poster/thumbnail.ts");
    expect(constantIn(app, "PREVIEW_WIDTH", "앱")).toBe(constantIn(script, "POSTER_WIDTH", "백필"));
    expect(constantIn(app, "PREVIEW_QUALITY", "앱")).toBe("88");
    expect(script).toMatch(/thumbnailFor\(\s*bytes,\s*POSTER_WIDTH,\s*88,\s*true\s*\)/);
  });

  it("카드뉴스: 줄이지 않고 q88 — 리사이즈가 끼면 카드가 흐려진다", () => {
    const app = read("lib/sns/thumbnail.ts");
    expect(constantIn(app, "PREVIEW_QUALITY", "앱")).toBe("88");
    expect(app).not.toMatch(/\.resize\(/);
    // 백필의 카드뉴스 갈래도 sharp 를 직접 부르며 resize 를 끼우지 않아야 한다.
    // **함수 전체를 본다.** 앞부분만 자르면 sharp 호출이 잘려 나가 헛돈다 —
    // 실제로 그렇게 썼다가 「리사이즈가 끼어듦」 뮤테이션을 놓쳤다.
    const branch = functionBody(script, "backfillSns");
    expect(branch).toMatch(/\.keepMetadata\(\)\.webp\(\{ quality: 88 \}\)/);
    expect(branch).not.toMatch(/\.resize\(/);
  });

  it("저장 인코딩의 12MP 상한은 격자와 달리 그대로다 — 낯선 바이트를 받는 문이다", () => {
    const app = read("lib/image-encoding.ts");
    expect(constantIn(app, "MAX_INPUT_PIXELS", "앱")).toBe(constantIn(script, "MAX_INPUT_PIXELS", "백필"));
    expect(constantIn(app, "MAX_INPUT_PIXELS", "앱")).toBe("12_000_000");
  });
});
