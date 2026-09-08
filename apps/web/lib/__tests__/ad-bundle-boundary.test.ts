import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `lib/ad/` 의 두 층 경계.
 *
 * 설계: `docs/superpowers/plans/2026-09-07-ad-assembly-engine.md` §4.2
 *
 * **`derive.ts` 는 브라우저 번들 안이다.** `"use client"` 파일 둘이 직접
 * 들인다 — `app/ad/ad-export-client.tsx` 와 `app/poster/ad-spec-picker.tsx`.
 * `master-plan.ts` 도 `app/poster/ad-mode.ts` 를 통해 같은 그래프에 있다.
 *
 * 여기에 fal·sharp 가 **한 줄이라도 새면 번들이 깨진다.** 3단계에서
 * `poster-service.ts` 가 스위치 하나를 읽으려다 sharp 를 통째로 끌고 온 사고와
 * 같은 구조다 — 그때는 실제로 프로젝트 만들기 라우트가 네이티브 바인딩을
 * 로드하고 있었다.
 *
 * **주장이 아니라 시험으로 둔다.** 「안 쓴다」는 다음 사람이 한 줄 더하면
 * 조용히 깨진다.
 */

/**
 * **`vi.mock` 으로는 못 잡는다.** mock 은 호이스팅돼서 `import` 시점에 이미
 * 걸려 있고, 그러면 「무거운 것을 들였다」와 「mock 을 들였다」가 구분되지
 * 않는다 — 실제로 `derive.ts` 에 `import sharp` 를 넣어도 시험이 통과했다.
 *
 * **소스를 직접 읽는다.** 무엇을 import 하는지는 파일에 적혀 있다.
 * 문자열 대조라 리팩터링에 약하지만 **그것이 이 시험의 값이다** — 이 줄을
 * 건드리면 사람이 한 번 멈춰 선다.
 */
const HEAVY = /^\s*import\s[^;]*from\s+["'](sharp|@fal-ai\/client|server-only)["']/m;

function importsOf(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("순수 층은 무거운 것을 안 들인다", () => {
  it("규격 데이터", () => {
    expect(importsOf("../ad/specs.ts")).not.toMatch(HEAVY);
  });

  it("파생 판단 — 클라이언트 그래프 안이다", () => {
    expect(importsOf("../ad/derive.ts")).not.toMatch(HEAVY);
  });

  it("마스터 역산 — 클라이언트 그래프 안이다", () => {
    expect(importsOf("../ad/master-plan.ts")).not.toMatch(HEAVY);
  });

  it("기능 스위치", () => {
    expect(importsOf("../ad/feature.ts")).not.toMatch(HEAVY);
  });

  /** 배치 규칙도 순수해야 한다 — 조립이 부르지만 계산일 뿐이다. */
  it("배치 규칙", () => {
    expect(importsOf("../ad/layout-rules.ts")).not.toMatch(HEAVY);
  });

  /**
   * **서버 층은 반대다** — 무거운 것을 들이는 것이 정상이다. 이 시험이
   * 방향을 거꾸로 보고 있지 않은지 여기서 확인한다.
   */
  it("서버 층은 실제로 무거운 것을 들인다 — 이 시험이 거꾸로가 아니다", () => {
    expect(importsOf("../ad/background.ts")).toMatch(HEAVY);
    expect(importsOf("../ad/check.ts")).toMatch(HEAVY);
  });

  /** 화면이 쓰는 규칙도 같은 층이다. */
  it("화면 규칙", () => {
    expect(importsOf("../../app/ad/export-rules.ts")).not.toMatch(HEAVY);
  });
});
