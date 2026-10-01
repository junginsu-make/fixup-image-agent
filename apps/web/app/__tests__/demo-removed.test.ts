import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `/demo` 삭제 (2026-09-30 사용자 D8, 설계 §3.5 · §8 C-2).
 *
 * 페이지·공개 목록·링크만 지운다. **그림은 지우지 않는다** — 첫 화면 슬라이드와
 * 카드뉴스 가짜 흐름이 `public/demo-sections/**`·`public/samples/**` 를 쓴다.
 */
const WEB = process.cwd();
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

/** `app/` 아래 화면 소스. 시험 폴더는 뺀다 — 「없어야 한다」는 글자를 담고 있다. */
function 화면소스(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : 화면소스(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("/demo 삭제 (D8)", () => {
  it("페이지가 없다", () => {
    expect(existsSync(path.join(WEB, "app/demo"))).toBe(false);
  });

  it("공개 목록에 없다", () => {
    const list = read("middleware.ts").match(/const PUBLIC_PATHS = \[([\s\S]*?)\];/)?.[1];

    expect(list, "PUBLIC_PATHS 를 못 찾았다").toBeTruthy();
    expect(list).not.toContain('"/demo"');
  });

  it("어느 화면도 /demo 로 보내지 않는다", () => {
    const files = 화면소스(path.join(WEB, "app"));
    expect(files.length, "화면 소스를 하나도 못 읽었다").toBeGreaterThan(0);

    for (const file of files) {
      // `/demo-sections/…` 는 그림 경로라 걸리지 않는다 — `/demo` 바로 뒤가 따옴표·`/`·`?`·`#` 일 때만 잡는다.
      expect(readFileSync(file, "utf8"), path.relative(WEB, file)).not.toMatch(/["'`]\/demo(?=["'`/?#])/);
    }
  });

  it("첫 화면·가짜 흐름이 쓰는 그림은 남아 있다", () => {
    for (const image of [
      "public/demo-sections/01-hero.jpg",
      "public/demo-sections/08-faq.jpg",
      "public/demo-sections/mood-a.jpg",
      "public/samples/1.jpg",
      "public/samples/4.jpg",
    ]) {
      expect(existsSync(path.join(WEB, image)), image).toBe(true);
    }
    expect(read("app/_landing/hero/slides.ts")).toContain("/demo-sections/");
    expect(read("app/api/sns/local-fake-flow.ts")).toContain("/demo-sections/");
  });
});
