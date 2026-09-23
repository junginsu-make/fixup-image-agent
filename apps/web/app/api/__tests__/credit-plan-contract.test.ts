import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **크레딧을 잡는 길은 모두 「몇 장·어떤 크기」를 함께 보낸다**(2026-09-23 운영).
 *
 * 운영 로그(2026-09-23 01:51, 리디자인):
 *
 *   [client] generate:error {"message":"이 생성 경로의 크레딧 설정을 확인해야 합니다."}
 *
 * 크레딧 장부로 옮긴 회원(`credit_accounts`, 운영 11명)은 DB 가 `p_outputs` 를
 * 받아야 값을 잡는다(`credit_reserve_dispatch`). `reserveAiUsage` 의 넷째 인자
 * (`creditPlan`)를 빼면 그 값이 `null` 로 가고, **그 회원은 무조건 거절된다.**
 * 리디자인 생성·원본 읽기, 상세페이지 참고 이미지 분석이 빼고 있었다.
 *
 * 목록을 손으로 적지 않는다 — 새로 생긴 길이 조용히 빠진다. 소스에서 센다.
 */
const API = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : routes(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** `reserveAiUsage(` 호출마다 괄호가 닫힐 때까지의 인자 글자. */
function reserveCalls(source: string): string[] {
  const calls: string[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf("reserveAiUsage(", from);
    if (at < 0) return calls;
    let depth = 0;
    let index = at + "reserveAiUsage".length;
    for (; index < source.length; index += 1) {
      if (source[index] === "(") depth += 1;
      if (source[index] === ")") depth -= 1;
      if (depth === 0) break;
    }
    calls.push(source.slice(at + "reserveAiUsage(".length, index));
    from = index;
  }
}

/** 맨 바깥 쉼표로 나눈 인자 수. */
function argumentCount(args: string): number {
  let depth = 0;
  let count = args.trim() ? 1 : 0;
  for (const char of args) {
    if ("([{".includes(char)) depth += 1;
    if (")]}".includes(char)) depth -= 1;
    if (char === "," && depth === 0) count += 1;
  }
  // 끝에 붙은 쉼표는 세지 않는다.
  return args.trim().endsWith(",") ? count - 1 : count;
}

const 부르는곳 = routes(API).flatMap((file) =>
  reserveCalls(readFileSync(file, "utf8")).map((args) => ({
    file: file.slice(file.indexOf("api")).replace(/\\/g, "/"),
    args,
  })),
);

describe("크레딧을 잡는 길", () => {
  it("**셀 곳이 있다** — 못 찾으면 아래 검사가 조용히 통과한다", () => {
    expect(부르는곳.length).toBeGreaterThanOrEqual(15);
  });

  it("**모두 넷째 인자(몇 장·어떤 크기)를 보낸다** — 빼면 전환한 회원이 무조건 거절된다", () => {
    const 빠진곳 = 부르는곳.filter(({ args }) => argumentCount(args) < 4).map(({ file }) => file);
    expect(빠진곳, `크레딧 정보를 안 보내는 곳: ${빠진곳.join(", ")}`).toEqual([]);
  });
});
