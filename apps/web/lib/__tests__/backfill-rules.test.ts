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
 */
const root = path.resolve(__dirname, "../..");
const script = readFileSync(path.resolve(root, "../../scripts/backfill-thumbnails.mjs"), "utf8");
const gridModule = readFileSync(path.resolve(root, "lib/grid-thumbnail.ts"), "utf8");

function constantIn(source: string, name: string): string {
  const found = source.match(new RegExp(`const ${name} = ([0-9_]+)`));
  if (!found) throw new Error(`${name} 을 찾지 못했습니다.`);
  return found[1];
}

describe("백필 스크립트와 앱의 규칙이 같은지", () => {
  it("격자 사본의 픽셀 상한이 같다 — 어긋나면 무거운 사진만 사본을 못 받는다", () => {
    expect(constantIn(script, "GRID_MAX_PIXELS")).toBe(constantIn(gridModule, "GRID_MAX_PIXELS"));
  });

  it("격자 백필이 그 상한을 실제로 넘겨 쓴다 — 상수만 두고 안 쓰면 소용없다", () => {
    expect(script).toMatch(/thumbnailFor\(bytes, 512, 78, true, GRID_MAX_PIXELS\)/);
  });

  it("격자 사본의 가로·품질이 앱과 같다", () => {
    expect(constantIn(gridModule, "GRID_WIDTH")).toBe("512");
    expect(constantIn(gridModule, "GRID_QUALITY")).toBe("78");
  });
});
