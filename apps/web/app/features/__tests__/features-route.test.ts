import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { generateStaticParams } from "../[slug]/page";

// 화면 파일이 로그인 확인(서버 전용)을 부른다. 경로 시험에는 필요 없다.
vi.mock("../../../lib/membership/server", () => ({ getMembership: async () => null }));

/** 키워드 화면의 경로·공개 범위(계획 2026-10-07 seo-keyword-pages). */
const WEB = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(WEB, file), "utf8");

describe("키워드 화면 경로", () => {
  it("손님에게 열린다 — 미들웨어 공개 목록에 /features", () => {
    const list = read("middleware.ts").match(/const PUBLIC_PATHS = \[([\s\S]*?)\n\];/);
    expect(list?.[1]).toMatch(/^\s*"\/features",/m);
  });
  it("여섯 주소를 미리 만든다", () => {
    expect(generateStaticParams().map((params) => params.slug)).toEqual([
      "cardnews", "detail-page", "redesign", "ad-creative", "poster", "character",
    ]);
  });
  it("모르는 주소는 404", () => {
    const src = read("app/features/[slug]/page.tsx");
    expect(src).toContain("notFound()");
    expect(src).toMatch(/export const dynamicParams = false/);
  });
  it("언어 전환을 감춘다 — 한국어 한 벌뿐", () => {
    for (const file of ["app/features/[slug]/page.tsx", "app/features/page.tsx"]) {
      expect(read(file)).toContain("showLanguage={false}");
    }
  });
});
