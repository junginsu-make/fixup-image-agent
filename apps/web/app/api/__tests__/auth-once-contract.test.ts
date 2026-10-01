import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **몸통을 읽으며 인증한 길은 그 결과를 크레딧 예약에 넘긴다**(설계 2026-09-29 §3.2).
 *
 * `readPdpRequest`·`readRedesignForm` 이 이미 인증했는데 `reserveAiUsage` 가 또
 * 인증하면 profiles 를 0.2초 왕복으로 한 번 더 읽는다. 목록을 손으로 적지 않는다 —
 * 새로 생긴 길이 조용히 빠진다. 소스에서 센다.
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

/** 맨 바깥 쉼표로 나눈 마지막 인자. */
function lastArgument(args: string): string {
  let depth = 0;
  let start = 0;
  const trimmed = args.trim().replace(/,$/, "");
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i]!;
    if ("([{".includes(char)) depth += 1;
    if (")]}".includes(char)) depth -= 1;
    if (char === "," && depth === 0) start = i + 1;
  }
  return trimmed.slice(start).trim();
}

const 읽고예약하는길 = routes(API)
  .map((file) => ({ file: file.slice(file.indexOf("api")).replace(/\\/g, "/"), source: readFileSync(file, "utf8") }))
  .filter(({ source }) => /\b(readPdpRequest|readRedesignForm)\s*[<(]/.test(source) && source.includes("reserveAiUsage("));

describe("한 요청 안에서 두 번 인증하지 않는다", () => {
  it("**셀 곳이 있다** — 상세페이지 5 + 리디자인 2", () => {
    expect(읽고예약하는길.length).toBeGreaterThanOrEqual(7);
  });

  it("**reserveAiUsage 의 마지막 인자가 parsed.member 다**", () => {
    const 빠진곳 = 읽고예약하는길.flatMap(({ file, source }) =>
      reserveCalls(source).filter((args) => lastArgument(args) !== "parsed.member").map(() => file));
    expect(빠진곳, `인증 결과를 안 넘기는 곳: ${빠진곳.join(", ")}`).toEqual([]);
  });

  it("**authenticateApiMember() 를 따로 부르지 않는다**", () => {
    const 다시인증 = 읽고예약하는길.filter(({ source }) => /authenticateApiMember\s*\(/.test(source)).map(({ file }) => file);
    expect(다시인증).toEqual([]);
  });
});
