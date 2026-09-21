import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **값이 나가는 길은 모두 같은 계약을 따라야 한다**(X-02).
 *
 * 설계 §14.6: 「finalize-safety 대상 누락 | PDP·리디자인 **모든 유료/계량
 * 라우트 실패 주입** | T-SETTLE/T-COST」.
 *
 * 계약은 셋이다.
 *
 *   ① 예약한 길은 **반드시 정산한다.** 안 닫으면 크레딧이 예약된 채 묶인다
 *   ② `finalizeAiUsage` 를 **직접 부르지 않는다.** 직접 부르면 그 길만
 *      던지는 갈래로 돌아가, 이미 만든 결과가 「생성 실패」로 둔갑한다
 *   ③ 실패를 **주입해 본 시험이 있다.** 셋 중 이것만 사람이 챙겨야 한다
 *
 * ── 왜 목록을 손으로 안 적나 ────────────────────────────────
 *
 * 유료 라우트는 앞으로도 는다. 목록을 글로 적어 두면 **새로 생긴 길이 조용히
 * 빠진다** — 이 항목이 잡힌 이유가 그것이다. 소스에서 세고, 빠진 것이 있으면
 * 여기가 빨개진다.
 */

const API = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function routesUnder(...folders: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") found.push(full);
    }
  };
  for (const folder of folders) walk(join(API, folder));
  return found.sort();
}

/** 설계가 말하는 범위. 포스터·카드뉴스는 다른 항목이 맡는다. */
const 유료길 = routesUnder("pdp", "redesign").filter((file) =>
  readFileSync(file, "utf8").includes("reserveAiUsage("),
);

const 짧게 = (file: string) => file.slice(file.indexOf(`api${join("", "")}`)).replace(/\\/g, "/");

describe("값이 나가는 길을 빠짐없이 센다", () => {
  it("**셀 길이 있다** — 못 찾으면 아래 검사가 전부 조용히 통과한다", () => {
    expect(유료길.length).toBeGreaterThanOrEqual(8);
  });
});

describe("예약한 길은 반드시 정산한다", () => {
  it("**예약만 하고 안 닫는 길이 없다**", () => {
    const 안닫는것 = 유료길
      .filter((file) => !readFileSync(file, "utf8").includes("settleAiUsage("))
      .map(짧게);

    expect(안닫는것, `안 닫는 길: ${안닫는것.join(", ")}`).toEqual([]);
  });
});

describe("던지는 갈래를 직접 쓰지 않는다", () => {
  it("**`finalizeAiUsage` 를 직접 부르는 길이 없다**", () => {
    const 직접부르는것 = 유료길
      .filter((file) => /\bfinalizeAiUsage\s*\(/.test(readFileSync(file, "utf8")))
      .map(짧게);

    expect(직접부르는것, `직접 부르는 길: ${직접부르는것.join(", ")}`).toEqual([]);
  });
});

/**
 * **실패를 주입해 본 시험이 길마다 있어야 한다.**
 *
 * 「정산을 부른다」까지는 위 두 검사가 본다. 그런데 **못 닫았을 때 결과를
 * 돌려주는지**는 실제로 흔들어 봐야 안다. 그 시험이 어느 파일에 있는지를
 * 여기 적어 둔다 — 새 길이 생기면 이 표가 모자라 빨개진다.
 */
describe("길마다 실패를 주입해 본 시험이 있다", () => {
  /** 길 → 그 길에 실패를 주입하는 시험 파일. */
  const 주입한시험: Record<string, string> = {
    "pdp/analyze/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/images/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/images/batch/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/key-visual/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/plan-from-text/route.ts": "pdp/__tests__/route-reliability.test.ts",
    "pdp/style-references/route.ts": "pdp/__tests__/style-references-usage.test.ts",
    "redesign/generate/route.ts": "redesign/__tests__/settlement.test.ts",
    "redesign/edit-section/route.ts": "redesign/__tests__/settlement.test.ts",
    "redesign/transcribe-strips/route.ts": "redesign/__tests__/transcribe-usage.test.ts",
  };

  const 끝부분 = (file: string) => file.replace(/\\/g, "/").split("/api/")[1] ?? file;

  it("**표에 없는 길이 없다** — 새 유료 길이 생기면 여기가 빨개진다", () => {
    const 빠진것 = 유료길.map(끝부분).filter((name) => !주입한시험[name]);

    expect(빠진것, `실패 주입 시험이 없는 길: ${빠진것.join(", ")}`).toEqual([]);
  });

  it("**표에 적힌 시험 파일이 실제로 있다**", () => {
    const 없는것 = [...new Set(Object.values(주입한시험))].filter((test) => {
      try {
        return !statSync(join(API, test)).isFile();
      } catch {
        return true;
      }
    });

    expect(없는것, `없는 시험 파일: ${없는것.join(", ")}`).toEqual([]);
  });

  /**
   * **정산 흉내를 두고 「못 닫음」을 흔들어 본 자국이 있어야 한다.**
   *
   * 표에 이름만 적어 두면 그 시험이 무엇을 재는지와 무관해진다. 최소한
   * 「정산이 못 닫는 경우」를 만든 흔적은 있어야 한다.
   */
  it("**그 시험들이 못 닫는 경우를 만든다**", () => {
    const 흔든흔적 = /정산결과 = undefined|mockRejectedValue|finalize\.mockRejected|settle[\s\S]{0,40}undefined/;
    const 안흔든것 = [...new Set(Object.values(주입한시험))].filter(
      (test) => !흔든흔적.test(readFileSync(join(API, test), "utf8")),
    );

    expect(안흔든것, `못 닫는 경우를 안 만드는 시험: ${안흔든것.join(", ")}`).toEqual([]);
  });
});
