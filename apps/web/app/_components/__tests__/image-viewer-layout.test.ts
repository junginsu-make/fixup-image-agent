import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 크게 보기 창의 **자리** (2026-09-17 사용자 보고).
 *
 * 1. 안내 문구가 화면 전체의 가운데에 있었는데 그림은 오른쪽 설명 칸을 뺀
 *    자리의 가운데에 섰다. 설명 칸 너비만큼 둘이 어긋났다.
 * 2. 원본 크기로 바꾸면 그림이 왼쪽 위에 붙었다.
 *
 * 이 저장소에는 jsdom 이 없어 그려서 볼 수 없다. 자리를 정하는 줄을 잡아 둔다.
 */
const source = readFileSync(new URL("../image-viewer.tsx", import.meta.url), "utf8");

describe("안내 문구는 그림과 같은 기둥에 있다", () => {
  const column = source.indexOf('<div className="flex min-w-0 flex-1 flex-col">');
  const caption = source.indexOf("Esc 또는 바깥을 눌러 닫습니다");
  const aside = source.indexOf("<aside");

  it("그림 기둥이 있다", () => {
    expect(column).toBeGreaterThan(-1);
  });

  it("문구가 그림 기둥 안, 설명 칸보다 앞에 온다 — 기둥 밖이면 화면 가운데로 간다", () => {
    expect(caption).toBeGreaterThan(column);
    expect(caption).toBeLessThan(aside);
  });

  it("문구는 한 번만 있다 — 옛 자리에 남으면 두 줄로 보인다", () => {
    expect(source.split("Esc 또는 바깥을 눌러 닫습니다").length - 1).toBe(1);
  });
});

describe("원본 크기에서도 그림이 가운데에 온다", () => {
  it("남는 자리로만 가운데에 민다 — 넘치면 안 잘린다", () => {
    expect(source).toContain('actualSize ? "m-auto flex-none" : "max-h-full max-w-full object-contain"');
  });

  it("**원본 크기의 칸은 `justify-center` 를 쓰지 않는다** — 넘친 왼쪽이 잘려 스크롤로 못 닿는다", () => {
    expect(source).toContain('actualSize ? "items-start justify-start overflow-auto"');
  });
});
