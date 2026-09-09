import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **작업 종류 목록이 세 곳에 있다. 갈리면 예약이 통째로 거절된다.**
 *
 *   1. `GenerationOperation` (타입)
 *   2. `generation_events.operation` 의 check 제약
 *   3. `reserve_generation()` 안의 화이트리스트
 *
 * 2026-09-08 에 2번만 넓혔다. 3번이 그대로라 /poster 와 /sns 의 그림 만들기가
 * `allowed=false, reason='invalid_request'` 로 100% 거절됐고, 사용자에게는
 * 409 「요청을 처리할 수 없습니다」만 떴다. 셋이 같은지 여기서 지킨다.
 */

const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));

/** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

/** 마지막으로 `reserve_generation` 을 정의한 마이그레이션. 그것이 실제 동작이다. */
function latestReserveDefinition(): string {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const last = files.filter((name) => code(name).includes("function public.reserve_generation")).pop();
  expect(last, "reserve_generation 을 정의한 마이그레이션이 없다").toBeTruthy();
  return code(last!);
}

const OPERATIONS = [
  "pdp_analyze",
  "pdp_image",
  "redesign_generate",
  "redesign_edit",
  "poster_image",
  "sns_image",
];

describe("예약이 받아들이는 작업 종류", () => {
  it("예약 함수의 화이트리스트가 모든 종류를 받는다", () => {
    const sql = latestReserveDefinition();
    const clause = sql.match(/p_operation not in \(([\s\S]*?)\)/);
    expect(clause, "화이트리스트를 찾지 못했다").toBeTruthy();
    for (const operation of OPERATIONS) {
      expect(clause![1], `${operation} 이 예약 함수에서 빠졌다`).toContain(`'${operation}'`);
    }
  });

  it("표의 check 제약도 같은 목록을 받는다", () => {
    const sql = code("202609080001_poster_operation.sql");
    const clause = sql.match(/check \(operation in \(([\s\S]*?)\)\)/);
    expect(clause, "check 제약을 찾지 못했다").toBeTruthy();
    for (const operation of OPERATIONS) {
      expect(clause![1], `${operation} 이 check 제약에서 빠졌다`).toContain(`'${operation}'`);
    }
  });

  it("코드가 쓰는 종류가 목록 밖으로 새지 않는다", () => {
    const types = readFileSync(new URL("../../membership/types.ts", import.meta.url), "utf8");
    const union = types.match(/export type GenerationOperation =([\s\S]*?);/);
    expect(union, "GenerationOperation 을 찾지 못했다").toBeTruthy();
    const declared = [...union![1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
    expect(declared.sort()).toEqual([...OPERATIONS].sort());
  });
});
