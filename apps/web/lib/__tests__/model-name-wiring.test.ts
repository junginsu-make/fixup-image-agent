import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { modelDisplayName } from "../model-name";

/**
 * **회원 화면에 모델 id 가 그대로 나오면 안 된다.**
 *
 * 사이트는 모델 이름을 일부러 가린다 — 회원에게는 「표준형」·「속도형」이다
 * (`lib/model-catalog.ts`). 그런데 **이미 만든 작업**을 되읽는 자리들이 저장된
 * id 를 그대로 찍고 있었다: 「모델: gpt-image-2.5-flare」(2026-09-16 사용자
 * 보고). 그때 `modelDisplayName` 으로 고쳤는데, 고친 자리가 **여러 화면에
 * 흩어져 있어** 한 곳만 되돌아가도 티가 안 난다(2026-09-17 사용자 확인 요청).
 *
 * 그래서 「모델」이라고 적는 줄을 전부 여기서 잠근다. 새 화면이 같은 값을
 * 보여 주게 되면 이 목록에 함께 넣는다.
 */

const SCREENS: Array<[이름: string, 경로: string]> = [
  ["결과물 큰 창(이미지 만들기)", "../../app/poster/[id]/poster-client.tsx"],
  ["라이브러리 작업물 카드", "../../app/library/works-tab.tsx"],
];

/** 「모델」을 적으면서 저장된 id 를 쓰는 줄. 이런 줄은 이름으로 바꿔야 한다. */
function modelLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .filter((line) => line.includes("모델") && /\bmodelId\b/.test(line));
}

describe("저장된 모델 id 를 화면에 그대로 안 쓴다", () => {
  for (const [이름, 경로] of SCREENS) {
    const source = readFileSync(new URL(경로, import.meta.url), "utf8");

    it(`${이름} — 이름으로 바꿔서 싣는다`, () => {
      const lines = modelLines(source);
      // 줄이 하나도 없다면 자리를 옮긴 것이다. 그때는 이 시험이 먼저 멈춰야 한다.
      expect(lines.length, "「모델」을 싣는 줄이 사라졌다면 이 목록을 고쳐라").toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.includes("modelDisplayName("), line.trim()).toBe(true);
      }
    });
  }

  it("**모르는 id 도 원본을 안 돌려준다** — 가린 까닭이 거기서 샌다", () => {
    expect(modelDisplayName("gpt-image-2.5-flare")).not.toContain("gpt-image");
    expect(modelDisplayName("fal-ai/nano-banana")).not.toContain("fal-ai");
  });
});
