import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOURLY_LIMITS, hourlyLimitFor } from "../hourly-limit";

/**
 * **레퍼런스를 정리하다가 상세페이지를 못 만들게 되면 안 된다**(C-7).
 *
 * 레퍼런스를 올리면 그림을 읽어 서술을 만든다(글 모델 한 번). 그 길에는 예약도
 * 횟수 제한도 없었다 — 같은 그림을 천 번 올려도 막는 것이 없다.
 *
 * 설계 §7.2: 「현재 시간당 분석 제한 설정은 **재사용**하고 레퍼런스 분석·전사
 * 에도 **명시된 LLM 작업 한도**를 적용한다.」
 *
 * 세는 방식은 같이 쓰되 **칸은 나눈다.** 상세페이지 분석은 시간당 열 번인데,
 * 레퍼런스는 한자리에서 스무 장을 올리는 일이 정상이다. 같은 칸을 쓰면 정리
 * 한 번에 그날 분석이 막힌다.
 */

describe("작업마다 제 한도를 본다", () => {
  it("**상세페이지 분석은 전과 같다**", () => {
    expect(hourlyLimitFor("pdp_analyze", {})).toBe(10);
  });

  /**
   * 60 은 지어낸 수가 아니다. 이 저장소가 이미 쓰는 `MAX_USER_REFERENCES`(40)
   * 가 **글 모델이 한 번에 보는 레퍼런스 수**다. 목록을 통째로 새로 채우는
   * 일이 한 시간 안에 한 번은 되어야 하므로 그보다 넉넉히 잡는다.
   */
  it("**레퍼런스 분석은 더 넉넉하다** — 한자리에서 여러 장을 올린다", () => {
    expect(hourlyLimitFor("reference_analyze", {})).toBe(60);
    expect(hourlyLimitFor("reference_analyze", {})).toBeGreaterThan(hourlyLimitFor("pdp_analyze", {}));
  });

  it("**한도가 없는 작업은 기본값으로 둔다** — 예약은 다른 규칙으로 막는다", () => {
    expect(hourlyLimitFor("pdp_image", {})).toBe(10);
  });
});

describe("설정으로 바꿀 수 있다", () => {
  it("**환경변수가 이긴다**", () => {
    expect(hourlyLimitFor("pdp_analyze", { ANALYZE_HOURLY_LIMIT: "25" })).toBe(25);
    expect(hourlyLimitFor("reference_analyze", { REFERENCE_ANALYZE_HOURLY_LIMIT: "5" })).toBe(5);
  });

  it("**서로의 값을 안 읽는다** — 한 칸을 고치면 다른 칸이 따라 움직이면 안 된다", () => {
    expect(hourlyLimitFor("pdp_analyze", { REFERENCE_ANALYZE_HOURLY_LIMIT: "999" })).toBe(10);
    expect(hourlyLimitFor("reference_analyze", { ANALYZE_HOURLY_LIMIT: "1" })).toBe(60);
  });

  /**
   * **오타가 한도를 0 으로 만들면 안 된다.** SQL 도 같은 범위로 조인다 —
   * 여기서 먼저 조여서 두 곳이 같은 답을 내게 한다.
   */
  it.each([
    ["빈 글자", "", 10],
    ["숫자가 아니다", "열번", 10],
    ["0", "0", 1],
    ["음수", "-5", 1],
    ["소수", "7.9", 7],
    ["너무 큰 수", "99999", 1000],
  ])("%s → %s", (_label, raw, expected) => {
    expect(hourlyLimitFor("pdp_analyze", { ANALYZE_HOURLY_LIMIT: raw })).toBe(expected);
  });
});

/**
 * 전사(2026-09-21, F-7-9).
 *
 * **한 번 전사가 호출 한 번이 아니다.** 화면이 원본을 스트립 마흔 장까지
 * 자르고 배치당 여덟 장씩 보내므로 한 페이지에 호출이 다섯 번까지 간다.
 */
describe("전사도 제 칸을 쓴다", () => {
  it("**기획 칸을 안 먹는다** — 전사 한 번이 시간당 열 번의 절반을 먹으면 그날 기획을 못 한다", () => {
    expect(hourlyLimitFor("redesign_transcribe", {})).toBe(60);
    expect(hourlyLimitFor("redesign_transcribe", {})).toBeGreaterThan(hourlyLimitFor("pdp_analyze", {}));
  });

  it("**제 환경변수만 읽는다**", () => {
    expect(hourlyLimitFor("redesign_transcribe", { TRANSCRIBE_HOURLY_LIMIT: "15" })).toBe(15);
    expect(hourlyLimitFor("redesign_transcribe", { ANALYZE_HOURLY_LIMIT: "1" })).toBe(60);
    expect(hourlyLimitFor("pdp_analyze", { TRANSCRIBE_HOURLY_LIMIT: "999" })).toBe(10);
  });
});

/**
 * **표를 손으로 맞추면 또 갈린다.**
 *
 * 전에는 여기 기대값을 **글자로 적어** 두었다. 그러면 이 시험은 「SQL 과 같은
 * 가」가 아니라 「내가 적은 것과 같은가」를 물을 뿐이다 — 앱과 SQL 양쪽을
 * 고치고 여기만 안 고치면 빨개지지만, 그 반대(앱만 고치고 SQL 을 빠뜨림)는
 * **못 잡는다.** 그것이 2026-09-08 에 실제로 난 사고다.
 *
 * 그래서 SQL 을 읽는다.
 */
describe("표가 한 벌이다", () => {
  const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));

  /** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
  const code = (name: string) =>
    readFileSync(path.join(migrationsDir, name), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*--.*$/gm, "");

  /** 마지막으로 정의한 것이 실제 동작이다. 파일 이름을 박아 두면 넓힌 것을 못 본다. */
  const latestDefining = (needle: string) => {
    const last = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) => code(name).includes(needle))
      .pop();
    expect(last, `${needle} 을 정의한 마이그레이션이 없다`).toBeTruthy();
    return code(last!);
  };

  it("**시간당 한도를 두는 작업은 SQL 이 세는 작업과 같다**", () => {
    const sql = latestDefining("function public.reserve_generation");
    // 화이트리스트(`not in`)가 아니라 **시간당 세는 갈래**다.
    const branch = sql.match(/if p_operation in \(([\s\S]*?)\) then/);
    expect(branch, "시간당 갈래를 찾지 못했다").toBeTruthy();

    const counted = [...branch![1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

    // 여기 있는데 SQL 이 안 세면 한도가 없는 것이고, 반대면 앱이 엉뚱한 수를 넣는다.
    expect(counted.sort()).toEqual(Object.keys(HOURLY_LIMITS).sort());
  });
});
