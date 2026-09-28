import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **예약·정산 함수를 건드리는 마이그레이션은 하나인지 세고 끝낸다**
 * (2026-09-28 운영 장애).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * `202609280001` 이 `credit_reserve` 에 `cs_ask` 를 더하려고 저장소의 정본을
 * 그대로 옮겼다. 그런데 **운영에는 인자가 하나 적은 판이 돌고 있었다.**
 *
 * `create or replace` 는 **같은 인자 목록일 때만 바꾼다.** 하나라도 다르면
 * 새로 만든다. 그래서 옛 판 옆에 새 판이 생기고, 인자 다섯 개로 부르는
 * 자리가 둘 다에 맞아 PostgreSQL 이 고르기를 거부했다.
 *
 *     42725  function credit_reserve(uuid, uuid, text, integer[], text)
 *            is not unique
 *
 * **장부를 쓰는 모든 예약이 함께 막혔다.** 도우미만이 아니었다.
 *
 * ── 왜 다른 시험이 못 잡았나 ───────────────────────────────
 *
 * `reserve-operation-whitelist.test.ts` 는 화이트리스트에 낱말이 있는지 본다.
 * 낱말은 제대로 들어 있었다. **문제는 글이 아니라 운영 DB 와의 차이**였고,
 * 저장소 안에서는 보이지 않는다.
 *
 * 저장소에서 막을 수 있는 것은 하나다 — **그 마이그레이션이 스스로 세게
 * 만드는 것.** 적용하는 순간 DB 가 답을 안다.
 */

const root = join(__dirname, "..", "..", "..", "..", "..");
const dir = join(root, "supabase", "migrations");

/** 인자 목록이 어긋나면 사고가 나는 이름들. 돈이 걸린 자리다. */
const 위험한이름 = [
  "credit_reserve",
  "credit_finalize",
  "credit_reserve_dispatch",
  "credit_finalize_dispatch",
  "reserve_generation",
  "finalize_generation",
] as const;

const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();

/** 이 파일이 그 함수를 (다시) 만드는가. 주석에 이름이 나오는 것은 세지 않는다. */
function 만드는이름(sql: string): string[] {
  return 위험한이름.filter((name) =>
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "i").test(sql),
  );
}

/**
 * 하나인지 세는 검사가 있는가.
 *
 * `pg_proc` 를 세고 둘 이상이면 알리는 모양을 찾는다. 글자 하나를 못 박으면
 * 다음 사람이 조금 다르게 써서 비켜 간다.
 */
function 세는가(sql: string): boolean {
  return /pg_proc/.test(sql) && /count\(\*\)/.test(sql) && /(raise\s+(exception|warning))/i.test(sql);
}

describe("예약·정산 함수를 건드리는 마이그레이션", () => {
  const 만지는것 = files
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }))
    .map((file) => ({ ...file, 이름들: 만드는이름(file.sql) }))
    .filter((file) => file.이름들.length > 0);

  it("한 파일 이상이 이 함수들을 만든다", () => {
    // 이 시험이 아무것도 안 보고 있는 상태를 막는다.
    expect(만지는것.length).toBeGreaterThan(0);
  });

  /**
   * **옛 파일은 그대로 둔다.** 이미 적용된 마이그레이션을 고치면 적용한 DB 와
   * 글이 어긋난다 — 그것이 이 사고의 뿌리다. 새로 쓰는 것에만 건다.
   */
  const 기준 = "202609280003";

  it(`${기준} 부터는 하나인지 세고 끝낸다`, () => {
    const 빠진것 = 만지는것
      .filter((file) => file.name >= 기준)
      .filter((file) => !세는가(file.sql))
      .map((file) => `${file.name} (${file.이름들.join(", ")})`);

    expect(
      빠진것,
      "이 함수를 (다시) 만들면 파일 끝에서 pg_proc 를 세어 판이 둘인지 보세요. " +
        "그렇지 않으면 인자 목록이 어긋난 판이 조용히 하나 더 생깁니다(42725).",
    ).toEqual([]);
  });

  /** 고친 그 파일이 실제로 세고 있는지. 이 시험의 첫 증인이다. */
  it("장애를 고친 파일이 세고 있다", () => {
    const 고친것 = files.find((name) => name.startsWith(기준));

    expect(고친것, "장애를 고친 마이그레이션이 없다").toBeTruthy();
    expect(세는가(readFileSync(join(dir, 고친것!), "utf8"))).toBe(true);
  });
});
