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
// Only ordered migrations are executable history; manual dashboard copies are not.
const migrationFiles = readdirSync(migrationsDir).filter(name => /^\d{12,14}_.*\.sql$/.test(name)).sort();

/** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

/**
 * 어떤 것을 마지막으로 정의한 마이그레이션. **그것이 실제 동작이다.**
 *
 * 파일 이름을 박아 두지 않는 이유가 있다 — 2026-09-14 에 `ad_export` 를 들이면서
 * check 제약을 새 파일에서 다시 걸었는데, 이 시험이 옛 파일만 보고 있어
 * **넓힌 것을 못 봤다.** 마지막 것을 찾으면 그런 일이 안 난다.
 */
function latestDefining(needle: string): string {
  const files = migrationFiles;
  const last = files.filter((name) => code(name).includes(needle)).pop();
  expect(last, `${needle} 을 정의한 마이그레이션이 없다`).toBeTruthy();
  return code(last!);
}

const OPERATIONS = [
  "pdp_analyze",
  "pdp_image",
  "redesign_generate",
  "redesign_edit",
  "poster_image",
  "sns_image",
  // 광고 규격 내보내기 (2026-09-14). 원가가 0 인 요청도 예약은 거친다.
  "ad_export",
];

describe("예약이 받아들이는 작업 종류", () => {
  it("예약 함수의 화이트리스트가 모든 종류를 받는다", () => {
    // The compatibility wrapper delegates to the renamed legacy body. Check both
    // actual implementations, rather than expecting a whitelist in that wrapper.
    for (const name of ["reserve_generation", "credit_reserve"]) {
      const bodies = migrationFiles.flatMap(file => [...code(file).matchAll(new RegExp(`function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "gi"))].map(match => match[0]));
      const implementation = bodies.filter(body => /p_operation not in\s*\(/.test(body)).at(-1);
      const clause = implementation?.match(/p_operation not in\s*\(([\s\S]*?)\)/);
      expect(clause, `${name} 화이트리스트를 찾지 못했다`).toBeTruthy();
      for (const operation of OPERATIONS) {
        expect(clause![1], `${operation} 이 ${name} 에서 빠졌다`).toContain(`'${operation}'`);
      }
    }
  });

  it("표의 check 제약도 같은 목록을 받는다", () => {
    const sql = latestDefining("generation_events_operation_check");
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
