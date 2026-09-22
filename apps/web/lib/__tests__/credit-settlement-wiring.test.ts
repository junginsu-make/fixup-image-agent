import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **확정도 예약과 같은 환산을 거쳐야 한다.**
 *
 * 기존 정책(`cost-v1`)에서 회원에게 깎이는 양은 「만든 장수」가 아니라
 * 「장수를 단가로 환산한 값」이다(`imageCreditUnits` · `creditUnits` ·
 * `characterCreditCost`). 예약은 전부 그 환산을 거치는데, **확정에서 환산을
 * 빠뜨리고 장수나 상수를 그대로 넘긴 자리가 넷 있었다**(2026-09-22 조사).
 *
 *   api/characters/route.ts        후보 개수 raw
 *   api/characters/route.ts        각도 개수 raw
 *   api/redesign/edit-section      성공하면 언제나 1
 *   api/pdp/key-visual             예약·확정 둘 다 하드코딩 1
 *
 * 형제 라우트(`characters/views` · `redesign/generate`)는 같은 계산을 제대로
 * 다시 거치고 있어서 실수라는 것이 분명했다.
 *
 * ── 왜 조용히 새는가 ────────────────────────────────────────────
 *
 * `finalize_generation` 이 확정값을 예약값 이하로 잘라 주므로 **과다청구는
 * 구조적으로 불가능하다.** 그래서 오차는 언제나 **과소청구 방향**이고, 아무도
 * 막히지 않아 화면에 아무 일도 안 일어난다. 두 달 동안 아무도 몰랐다.
 *
 * ── 왜 새 장부가 이걸 대신 못 막는가 ──────────────────────────
 *
 * `image-v2` 로 전환한 계정은 DB 가 예약 시점 quote 로만 정산하므로 이 값을
 * 아예 안 본다. 하지만 **전환은 계정별 수동**이라, 전환하지 않은 회원은 계속
 * 이 경로를 탄다. 두 정책이 함께 도는 동안 이 검사가 필요하다.
 *
 * ── 파일이 아니라 **부르는 자리**를 본다 ──────────────────────
 *
 * 파일 어딘가에 `imageCreditUnits` 가 있는지만 보면, 예약에서 한 번 쓰고
 * 확정에서 안 쓰는 지금 상태가 그대로 통과한다. 그래서 확정을 부르는 그
 * 괄호 안에서 **세 번째 인자**만 꺼내 본다.
 */

const web = join(__dirname, "..", "..");

/** 그림 장수만큼 깎는 라우트. 여기서는 확정도 반드시 환산을 거쳐야 한다. */
const PER_IMAGE_ROUTES = [
  "app/api/characters/route.ts",
  "app/api/characters/views/route.ts",
  "app/api/redesign/generate/route.ts",
  "app/api/redesign/edit-section/route.ts",
  "app/api/pdp/images/route.ts",
  "app/api/pdp/images/batch/route.ts",
  "app/api/pdp/key-visual/route.ts",
];

/**
 * 장수를 크레딧으로 바꾸는 함수들.
 *
 * ── 이 검사가 **못 잡는 것** ────────────────────────────────────
 *
 * 독립 리뷰가 변이 10건으로 실측했다(2026-09-22). 「환산을 거쳤나」만 재고
 * **「금액이 맞나」는 못 잰다** — `imageCreditUnits(model, 1)` 처럼 개수만
 * 틀리거나 `… * 0` 으로 없애면 그대로 통과한다.
 *
 * 그걸 잡으려면 값을 실행해 봐야 하는데, 그건 이 검사의 몫이 아니다.
 * **여기서 막는 것은 「환산을 통째로 잊는 것」 하나다** — 실제로 났던 사고가
 * 그것이고, 넷 다 그 모양이었다.
 *
 * 값을 실행해 보는 쪽은 `scripts/tests/credit-ledger.test.mjs` 가 실제
 * PostgreSQL 에서 맡는다.
 */
const CONVERTERS = /\b(imageCreditUnits|characterCreditCost|creditUnits|adExportUnits)\s*\(/;

/** 주석은 값이 아니다. 지우고 나서 본다. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * 여는 괄호부터 짝이 맞는 닫는 괄호까지 잘라 낸다.
 *
 * 정규식으로 인자를 끊으면 `imageCreditUnits(model, 1)` 안의 쉼표에서 잘린다.
 * 문자열과 주석은 이 저장소의 확정 호출에 안 나와서 따로 다루지 않는다.
 */
function argumentsOf(source: string, openIndex: number): string[] {
  let depth = 0;
  let start = openIndex + 1;
  const args: string[] = [];
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) {
        args.push(source.slice(start, i));
        return args;
      }
    } else if (ch === "," && depth === 1) {
      args.push(source.slice(start, i));
      start = i + 1;
    }
  }
  throw new Error("확정 호출의 괄호가 닫히지 않았습니다.");
}

/**
 * 값이 환산을 거쳤나.
 *
 * 미리 셈해 변수에 담아 두는 자리가 있다(`characters/views` 의 `reserved`).
 * 이름만 보고 「환산 안 함」으로 읽으면 멀쩡한 코드를 잡는다 — 그 이름을
 * 만드는 줄까지 따라가서 본다. **한 겹만** 따라간다. 두 겹이 필요해지면
 * 그때는 코드가 너무 멀리 돌아가고 있다는 뜻이다.
 */
function converted(source: string, value: string): boolean {
  const bare = withoutComments(value).trim();
  if (CONVERTERS.test(bare)) return true;
  if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return false;
  // **마지막 선언을 본다.** 첫 선언만 보면, 앞쪽에 같은 이름의 멀쩡한 선언이
  // 있을 때 뒤의 진짜 값이 그 뒤에 숨는다. 이것도 리뷰가 변이로 뚫었다.
  const assignment = new RegExp(String.raw`\b(?:const|let|var)\s+${bare}\s*=([^;]+);`, "g");
  let last: RegExpExecArray | null = null;
  for (let hit = assignment.exec(source); hit; hit = assignment.exec(source)) last = hit;
  return last ? CONVERTERS.test(withoutComments(last[1]!).trim()) : false;
}

function settlementCalls(source: string) {
  const calls: { success: string; consumed: string }[] = [];
  const pattern = /\b(?:finalizeAiUsage|settleAiUsage)\s*\(/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const args = argumentsOf(source, match.index + match[0].length - 1);
    if (args.length < 3) continue;
    calls.push({ success: args[1]!.trim(), consumed: args[2]!.trim() });
  }
  return calls;
}

describe("확정도 예약과 같은 환산을 거친다", () => {
  for (const route of PER_IMAGE_ROUTES) {
    it(`${route} 의 성공 확정이 장수를 그대로 넘기지 않는다`, () => {
      const source = readFileSync(join(web, route), "utf8");
      const calls = settlementCalls(source);
      expect(calls.length).toBeGreaterThan(0);

      for (const call of calls) {
        // 실패 확정은 0 을 넘긴다. 0 은 과소청구가 아니므로 검사 대상이 아니다.
        if (call.success === "false") continue;
        if (/^0$/.test(call.consumed)) continue;
        expect(
          converted(source, call.consumed),
          `${route}: 확정이 환산을 안 거쳤습니다 — ${call.consumed}`,
        ).toBe(true);
      }
    });
  }

  it("예약도 같은 환산을 거친다", () => {
    for (const route of PER_IMAGE_ROUTES) {
      const source = readFileSync(join(web, route), "utf8");
      const pattern = /\breserveAiUsage\s*\(/g;
      for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
        const args = argumentsOf(source, match.index + match[0].length - 1);
        const units = args[2]!.trim();
        if (/^0$/.test(units)) continue;
        expect(
          converted(source, units),
          `${route}: 예약이 환산을 안 거쳤습니다 — ${units}`,
        ).toBe(true);
      }
    }
  });
});
