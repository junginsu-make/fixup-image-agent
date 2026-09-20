import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **안 닫힌 예약은 어떻게 풀리는가**(E-6-2-a).
 *
 * 설계 §14.5: 「실패 0 확정이 정상이라는 평가 | **정상 성공 경로만 유지;
 * 예약 예외/만료는 별도 검증**」.
 *
 * 「실패해도 0장으로 확정하면 된다」는 말은 **정산이 돌았을 때만** 참이다.
 * 정산이 아예 안 도는 길이 있다 — 프로세스가 죽거나, 플랫폼이 시간 초과로
 * 요청을 끊거나, 정산 RPC 자체가 흔들리는 경우다. 그때 행은 `reserved` 로
 * 남고 **그 사람의 크레딧을 묶는다.**
 *
 * 그 자리를 푸는 것은 앱이 아니라 SQL 이다. 그런데 **아무도 그것을 재지
 * 않았다.** 여기서 계약으로 잠근다.
 *
 * 마이그레이션 파일을 읽어 대조한다. 이 저장소가 쓰는 방식이고
 * (`analysis-quota-migration.test.ts`), 운영 DB 없이 잴 수 있는 유일한 길이다.
 */

const migrationsDir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));

/** 주석을 걷어낸다. 이 저장소의 SQL 은 설명이 길어 단어가 코드로 오인된다. */
function code(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}

/** 어떤 것을 **마지막으로** 정의한 마이그레이션. 그것이 실제 동작이다. */
function latestDefining(needle: string): string {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  const last = files.filter((name) => code(name).includes(needle)).pop();
  expect(last, `${needle} 을 정의한 마이그레이션이 없다`).toBeTruthy();
  return code(last!);
}

const reserve = latestDefining("create or replace function public.reserve_generation");
const finalize = latestDefining("create or replace function public.finalize_generation");

/** 공백을 한 칸으로 눌러 비교한다. 줄바꿈 자리가 바뀌어도 뜻은 같다. */
const 눌러서 = (text: string) => text.replace(/\s+/g, " ");

describe("안 닫힌 예약은 스스로 풀린다", () => {
  /**
   * **다음 사람이 문을 열 때 앞사람의 묵은 자리를 치운다.**
   *
   * 따로 도는 청소기가 없다. 예약을 부르는 그 순간에 정리한다 — 그래서
   * 이 한 줄이 사라지면 **아무도 안 치운다.**
   */
  it("**예약을 걸 때 만료된 자리를 먼저 치운다**", () => {
    expect(눌러서(reserve)).toContain(
      눌러서(`update public.generation_events
        set status = 'failed', completed_at = now(), error_code = 'reservation_expired'
        where user_id = p_user_id and status = 'reserved' and expires_at <= now()`),
    );
  });

  it("**치우는 일이 한도 판정보다 먼저다** — 뒤에 있으면 묵은 자리가 한 번 더 막는다", () => {
    const 치움 = reserve.indexOf("error_code = 'reservation_expired'");
    // **선언이 아니라 판정 자리**를 짚는다. 선언은 함수 맨 위에 있어서
    // 순서를 재는 데 쓸 수 없다.
    const 한도 = reserve.indexOf("into v_recent_analysis");
    const 월한도 = reserve.indexOf("v_used + v_reserved + p_units >");

    expect(치움).toBeGreaterThan(-1);
    expect(치움).toBeLessThan(한도);
    expect(치움).toBeLessThan(월한도);
  });

  it("**예약 자리는 만료 전까지만 센다** — 만료된 것이 한도를 계속 먹으면 안 된다", () => {
    // 월 한도에 더하는 예약분은 `expires_at > now()` 인 것만이다.
    expect(눌러서(reserve)).toContain(
      눌러서(`status = 'reserved' and expires_at > now()`),
    );
  });

  /**
   * **만료된 것은 실패지 성공이 아니다.** 월 한도는 `succeeded` 만 센다.
   * 만료가 성공으로 찍히면 아무것도 못 받은 사람의 크레딧이 사라진다.
   */
  it("**월 한도는 성공한 것만 센다**", () => {
    expect(눌러서(reserve)).toContain(눌러서(`sum(consumed_units), 0)::integer into v_used`));
    expect(눌러서(reserve)).toContain(눌러서(`period_start = v_period_start and status = 'succeeded'`));
  });
});

describe("정산은 예약한 자리에만 쓴다", () => {
  it("**끝난 자리를 다시 닫지 않는다** — 두 번 닫으면 차감이 두 번이다", () => {
    expect(눌러서(finalize)).toContain(눌러서(`status = 'reserved'`));
  });

  /**
   * **실패에는 이유가 남는다.** 그 이유가 시간당 한도를 먹일지를 가른다(C-9).
   * 비어 있으면 `provider_error` 로 떨어지고, 그것은 한도를 먹는다.
   */
  it("**실패로 닫으면 이유가 반드시 남는다**", () => {
    expect(눌러서(finalize)).toContain(눌러서(`coalesce(p_error_code, 'provider_error')`));
  });

  it("**성공으로 닫으면 이유를 지운다** — 남아 있으면 한도 판정이 어긋난다", () => {
    expect(눌러서(finalize)).toMatch(/case when p_success then null/);
  });
});
