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
 * **2026-09-30 에 넓혔다**(AI 사용 통제 설계 §3.1·§5). 회원 확인만 하고 예약 없이
 * 유료 AI 를 부르던 네 길이 있었다 — 크레딧이 없어도, 운영자가 멈춰도 돌았다.
 * 이제 **공급자를 부르는 길은 모두 예약한다.** 예외는 설계 §3.1 의 셋뿐이고 아래
 * 표에 이름으로 적는다.
 *
 * ── 왜 목록을 손으로 안 적나 ────────────────────────────────
 *
 * 유료 라우트는 앞으로도 는다. 목록을 글로 적어 두면 **새로 생긴 길이 조용히
 * 빠진다** — 이 항목이 잡힌 이유가 그것이다. 소스에서 세고, 빠진 것이 있으면
 * 여기가 빨개진다.
 *
 * **한계**: 라우트 파일의 **직접 import 만 본다** — `lib` 를 한 겹 거쳐 공급자를
 * 부르는 새 라우트는 이 시험이 놓칠 수 있다(최종 전체 리뷰, 2026-09-30).
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

const 끝부분 = (file: string) => file.replace(/\\/g, "/").split("/api/")[1] ?? file;

/** 예약 없이 유료 AI 를 부르던 네 길(설계 2026-09-30 §3.1). 이제 ①②③ 을 똑같이 진다. */
const 새로막은길 = [
  "easy/generate/route.ts",
  "sns/projects/[id]/plan/route.ts",
  "sns/projects/[id]/caption/route.ts",
  "poster/projects/[id]/review/route.ts",
].map((name) => join(API, name));

/** 설계가 말하는 범위. 포스터·카드뉴스의 나머지는 아래 「공급자를 부르는 길」이 맡는다. */
const 유료길 = [
  ...routesUnder("pdp", "redesign").filter((file) => readFileSync(file, "utf8").includes("reserveAiUsage(")),
  ...새로막은길,
];

describe("값이 나가는 길을 빠짐없이 센다", () => {
  it("**셀 길이 있다** — 못 찾으면 아래 검사가 전부 조용히 통과한다", () => {
    expect(유료길.length).toBeGreaterThanOrEqual(13);
  });
});

describe("예약한 길은 반드시 정산한다", () => {
  it("**예약만 하고 안 닫는 길이 없다**", () => {
    const 안닫는것 = 유료길
      .filter((file) => !readFileSync(file, "utf8").includes("settleAiUsage("))
      .map(끝부분);

    expect(안닫는것, `안 닫는 길: ${안닫는것.join(", ")}`).toEqual([]);
  });
});

describe("던지는 갈래를 직접 쓰지 않는다", () => {
  it("**`finalizeAiUsage` 를 직접 부르는 길이 없다**", () => {
    const 직접부르는것 = 유료길
      .filter((file) => /\bfinalizeAiUsage\s*\(/.test(readFileSync(file, "utf8")))
      .map(끝부분);

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
    "pdp/product-photo/route.ts": "pdp/__tests__/product-photo-route.test.ts",
    "pdp/style-references/route.ts": "pdp/__tests__/style-references-usage.test.ts",
    "redesign/generate/route.ts": "redesign/__tests__/settlement.test.ts",
    "redesign/edit-section/route.ts": "redesign/__tests__/settlement.test.ts",
    "redesign/transcribe-strips/route.ts": "redesign/__tests__/transcribe-usage.test.ts",
    "easy/generate/route.ts": "easy/__tests__/decide-usage.test.ts",
    "sns/projects/[id]/plan/route.ts": "sns/__tests__/plan-caption-usage.test.ts",
    "sns/projects/[id]/caption/route.ts": "sns/__tests__/plan-caption-usage.test.ts",
    "poster/projects/[id]/review/route.ts": "poster/__tests__/poster-review-route.test.ts",
  };

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

/* ── 공급자를 부르는 길은 모두 관문을 지난다(설계 2026-09-30 §3.1·§5) ──────── */

/**
 * **공급자 모듈.** import 경로로 가른다. 이름을 새로 지으면(`…-provider`, `…/providers`)
 * 저절로 잡힌다.
 */
const PROVIDER_IMPORT: RegExp[] = [
  /(^|\/)providers?$/, // lib/pdp/providers, lib/poster/providers, lib/sns/providers, lib/cs/provider
  /-provider$/, // lib/easy/chat-provider, lib/layout/analyze-provider
  /\/lib\/ad\/background$/,
  /\/lib\/redesign\/image-generator$/,
  /\/lib\/sns\/source-adapters$/, // 웹검색 조사·Apify
  /^@anthropic-ai\/sdk$/,
  /^openai$/,
  /^@google\/genai$/,
  /^@fal-ai\/client$/,
];
/** 패키지 안에서 공급자를 부르는 함수. import 경로만으로는 못 가른다(`@fixup/redesign-core`). */
const PROVIDER_CALL = /\bindexKnowledge\s*\(/;

const 부르는길 = routesUnder(".").filter((file) => {
  const source = readFileSync(file, "utf8");
  const specs = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
  return specs.some((spec) => PROVIDER_IMPORT.some((pattern) => pattern.test(spec))) || PROVIDER_CALL.test(source);
});

/** 설계 §3.1 의 예외 셋. 이 밖에서 예약 없이 공급자를 부르면 빨개진다. */
const 예외: Record<string, string> = {
  "poster/projects/[id]/status/route.ts": "예외 1 — 이미 예약한 작업을 이어 간다",
  "sns/projects/[id]/status/route.ts": "예외 1 — 이미 예약한 작업을 이어 간다(스위치 확인은 C3)",
  "redesign/knowledge/route.ts": "예외 2 — 관리자 지식 올리기. 비용 기록만(C3)",
  "pdp/validate-key/route.ts": "예외 3 — 공급자 모듈을 import 만 하고 부르지 않는다",
};

describe("공급자를 부르는 길은 모두 관문을 지난다", () => {
  it("**셀 길이 있다** — 못 찾으면 아래 검사가 전부 조용히 통과한다", () => {
    expect(부르는길.length).toBeGreaterThanOrEqual(20);
  });

  it("**예외 표가 낡지 않았다** — 적힌 길이 실제로 공급자를 부른다", () => {
    const 찾은것 = new Set(부르는길.map(끝부분));
    const 낡은것 = Object.keys(예외).filter((name) => !찾은것.has(name));

    expect(낡은것, `공급자를 안 부르는데 예외에 남은 길: ${낡은것.join(", ")}`).toEqual([]);
  });

  it("**예외 말고는 모두 예약한다**", () => {
    const 안잡는것 = 부르는길
      .filter((file) => !예외[끝부분(file)])
      .filter((file) => !readFileSync(file, "utf8").includes("reserveAiUsage("))
      .map(끝부분);

    expect(안잡는것, `예약 없이 공급자를 부르는 길: ${안잡는것.join(", ")}`).toEqual([]);
  });

  /**
   * **예약한 길은 닫는다.** 포스터·카드뉴스·캐릭터의 옛 길은 `finalizeAiUsage` 를 직접
   * 부른다 — 그 모양은 ② 가 pdp·redesign·새 네 길에서만 막는다. 여기서는 「닫는다」만 본다.
   */
  it("**예약한 길은 닫는다**", () => {
    const 안닫는것 = 부르는길
      .filter((file) => readFileSync(file, "utf8").includes("reserveAiUsage("))
      .filter((file) => !/\b(settleAiUsage|finalizeAiUsage)\s*\(/.test(readFileSync(file, "utf8")))
      .map(끝부분);

    expect(안닫는것, `예약만 하고 안 닫는 길: ${안닫는것.join(", ")}`).toEqual([]);
  });
});

describe("새로 막은 네 길", () => {
  /** 새 작업 이름을 만들지 않는다 — 기존 이름 + resource 로 가른다(설계 §3.1 의 표). */
  const 기대: Record<string, string> = {
    "easy/generate/route.ts": '"poster_image", 0, freeCreditPlan("easy:decide")',
    "sns/projects/[id]/plan/route.ts": '"sns_image", 0, freeCreditPlan(`sns:${id}:plan`)',
    "sns/projects/[id]/caption/route.ts": '"sns_image", 0, freeCreditPlan(`sns:${id}:caption`)',
    "poster/projects/[id]/review/route.ts": '"poster_image", 0, freeCreditPlan(`poster:${id}:review`)',
  };

  it.each(Object.entries(기대))("%s 는 기존 작업 이름과 제 resource 로 잡는다", (name, call) => {
    expect(readFileSync(join(API, name), "utf8")).toContain(call);
  });

  it("쉬운 만들기 판정은 단계 열쇠로 잡는다 — 바깥 열쇠를 쓰면 뒤 단계가 duplicate_request", () => {
    /*
     * `decide` 는 `relay(...)` 가 요청 식별자를 가르는 네 번째 단계다
     * (`easy/__tests__/generate-wiring.test.ts` 의 "네 단계" 리터럴 집계가 이를 함께 센다).
     */
    const source = readFileSync(join(API, "easy/generate/route.ts"), "utf8");
    expect(source).toContain('relay(request, "/api/easy/generate", {}, "decide")');
  });
});

/* ── 공급자를 부르는 길은 비용 문맥을 연다(설계 2026-09-30 §3.4·§5) ──────── */

/**
 * **호출마다 한 줄**은 라우트 입구가 계량기 저장소를 열어야 「누구의 무슨 작업」이 붙는다.
 * 안 열면 그 길의 비용은 `unbound`(문맥 없음)로 적힌다 — 돈은 잡히지만 누구 것인지 모른다.
 *
 * 예약하는 길은 `reserveAiUsage` 가 문맥을 채운다. 예약하지 않는 예외 길(설계 §3.1)은
 * 라우트가 `bindAiCaller` 를 직접 부른다. `pdp/validate-key` 는 공급자를 부르지 않는다.
 */
describe("공급자를 부르는 길은 비용 문맥을 연다", () => {
  const 문맥예외 = new Set(["pdp/validate-key/route.ts"]);

  it("**입구에서 계량기를 연다**", () => {
    const 안여는것 = 부르는길
      .filter((file) => !문맥예외.has(끝부분(file)))
      // 안쪽에서만 여는 것(칸 읽기의 옛 모양)은 모자란다 — 예약이 그보다 먼저 와서 문맥을 못 싣는다.
      .filter((file) => !/return\s+withLlmMeter\(/.test(readFileSync(file, "utf8")))
      .map(끝부분);

    expect(안여는것, `계량기 없이 공급자를 부르는 길: ${안여는것.join(", ")}`).toEqual([]);
  });

  it("**예약하지 않는 길은 문맥을 직접 채운다**", () => {
    const 안채우는것 = 부르는길
      .filter((file) => !문맥예외.has(끝부분(file)))
      .filter((file) => !readFileSync(file, "utf8").includes("reserveAiUsage("))
      .filter((file) => !readFileSync(file, "utf8").includes("bindAiCaller("))
      .map(끝부분);

    expect(안채우는것, `문맥 없이 공급자를 부르는 길: ${안채우는것.join(", ")}`).toEqual([]);
  });
});

/**
 * **`reserveAiUsage(` 가 있는 모든 route.ts 는 `return withLlmMeter(` 도 있다(파일 기준, 최종 전체 리뷰).**
 *
 * 위 「입구에서 계량기를 연다」는 `부르는길`(import 경로로 짐작한 공급자 호출) 안에서만 본다 —
 * 이 파일 맨 위 주석이 스스로 적은 한계다: 「`lib` 를 한 겹 거쳐 공급자를 부르는 새 라우트는
 * 이 시험이 놓칠 수 있다.」 예약(`reserveAiUsage`)은 언제나 라우트 파일에 직접 적히므로, import
 * 짐작을 거치지 않고 **`reserveAiUsage(` 문자열이 있는 모든 route.ts** 를 곧바로 센다. 예약만
 * 하고 계량기를 안 열면 그 요청의 비용은 `unbound`(문맥 없음)로 적혀 누구 것인지 모른 채
 * 남는다(설계 §3.4·§5).
 */
describe("reserveAiUsage 가 있는 길은 모두 withLlmMeter 도 연다(파일 기준)", () => {
  const 예약하는모든길 = routesUnder(".").filter((file) => readFileSync(file, "utf8").includes("reserveAiUsage("));

  it("**셀 길이 있다** — 못 찾으면 아래 검사가 조용히 통과한다", () => {
    expect(예약하는모든길.length).toBeGreaterThanOrEqual(1);
  });

  it("**reserveAiUsage 가 있으면 return withLlmMeter( 도 있다**", () => {
    const 안여는것 = 예약하는모든길
      .filter((file) => !/return\s+withLlmMeter\(/.test(readFileSync(file, "utf8")))
      .map(끝부분);

    expect(안여는것, `reserveAiUsage 는 있는데 withLlmMeter 를 안 여는 길: ${안여는것.join(", ")}`).toEqual([]);
  });
});
