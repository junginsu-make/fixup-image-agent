import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **한 파일이 얼마나 커도 되는가.**
 *
 * 이 저장소의 규칙은 보통 200~400줄, **최대 800줄**이다. 리디자인 화면은
 * 2,589줄이었다 — 세 배가 넘었다. 그만큼 커지면 어디에 무엇이 있는지 아무도
 * 못 찾고, 한 줄 고치려고 관계없는 코드를 함께 읽게 된다.
 *
 * 줄 수는 **틀려도 아무도 안 아프다.** 화면은 멀쩡히 돌고, 다시 커져도
 * 어느 날 갑자기 깨지지 않는다. 그래서 값으로 재 둔다.
 */

const REDESIGN = join(__dirname, "..");

/** 규칙이 정한 상한. 넘으면 쪼갤 때다. */
const 최대줄수 = 800;

/**
 * 지금 남은 가장 큰 파일(`redesign-wizard.tsx`, 962줄)은 아직 상한을 넘는다.
 *
 * 남은 것은 **화면 하나의 상태와 손잡이들**이라, 더 줄이려면 옮기는 것이
 * 아니라 다시 쓰는 일이 된다. 그건 동작이 바뀔 수 있어 따로 한다. 그동안
 * **더 커지지는 않게** 이 값으로 막아 둔다.
 */
const 봐주는_파일 = new Map([["redesign-wizard.tsx", 1000]]);

describe("파일 크기", () => {
  const 파일들 = readdirSync(REDESIGN)
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .map((name) => ({
      name,
      줄수: readFileSync(join(REDESIGN, name), "utf8").split("\n").length,
    }));

  it("훑을 파일이 있다", () => {
    // 폴더를 못 읽으면 아래 검사가 전부 조용히 통과한다.
    expect(파일들.length).toBeGreaterThan(5);
  });

  for (const { name, 줄수 } of 파일들) {
    const 상한 = 봐주는_파일.get(name) ?? 최대줄수;
    it(`${name} 이 ${상한}줄 아래다 (지금 ${줄수}줄)`, () => {
      expect(줄수).toBeLessThanOrEqual(상한);
    });
  }
});
