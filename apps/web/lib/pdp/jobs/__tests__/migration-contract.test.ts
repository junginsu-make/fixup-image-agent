import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GenerationState, PersistenceState, SettlementState, SubmissionState } from "../state";

/**
 * **SQL 과 코드가 갈리지 않게 한다.**
 *
 * 상태 이름이 두 곳에 적혀 있다 — TypeScript 의 union 과 SQL 의 check 제약.
 * 한쪽에 값을 더하고 다른 쪽을 잊으면, 그 상태로 가는 순간 DB 가 거절하고
 * **이미 값을 치른 작업이 멈춘다.** 이 저장소는 같은 사고를 이미 겪었다 —
 * 2026-09-08 에 `operation` 목록을 한 곳만 고쳐 이미지 만들기와 카드뉴스가
 * 전부 거절됐다(`202609140001` 머리말).
 *
 * 눈으로 대조하지 않고 값으로 잰다.
 */
const sql = readFileSync(
  new URL("../../../../../../supabase/migrations/202609180001_pdp_jobs.sql", import.meta.url),
  "utf8",
);

/** 주석을 뺀 실제 SQL. 주석에 적은 낱말이 검사에 걸리면 안 된다. */
const code = sql
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

/**
 * 함수 하나의 본문만 떼어낸다.
 *
 * **파일 전체에서 문자열을 찾으면 안 된다.** 같은 낱말이 다른 함수에도 있어서,
 * 정작 이 함수에서 그 줄을 지워도 시험이 통과한다 — 실제로 변이로 그것을 확인했다.
 */
function bodyOf(name: string): string {
  const start = code.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`${name} 함수를 찾지 못했습니다`);
  const end = code.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`${name} 함수의 끝을 찾지 못했습니다`);
  return code.slice(start, end);
}

/** check 제약에 적힌 값들을 뽑는다. */
function checkValues(column: string): string[] {
  const match = new RegExp(String.raw`check \(${column} in \(([^)]*)\)`).exec(code);
  if (!match) throw new Error(`${column} 의 check 제약을 SQL 에서 찾지 못했습니다`);
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort();
}

describe("상태 이름이 코드와 SQL 에서 같다", () => {
  it("생성 축", () => {
    const 코드: GenerationState[] = ["validated", "reserved", "submitting", "submitted", "generating",
      "result_available", "persisted", "completed", "review_required", "partial", "failed"];
    expect(checkValues("generation")).toEqual([...코드].sort());
  });

  it("정산 축", () => {
    const 코드: SettlementState[] = ["not_started", "pending", "settled", "retry_required"];
    expect(checkValues("settlement")).toEqual([...코드].sort());
  });

  it("보존 축", () => {
    const 코드: PersistenceState[] = ["pending", "stored", "retry_required"];
    expect(checkValues("persistence")).toEqual([...코드].sort());
  });

  it("제출 축", () => {
    const 코드: SubmissionState[] = ["known", "uncertain"];
    expect(checkValues("submission")).toEqual([...코드].sort());
  });
});

describe("SQL 이 지켜야 하는 것", () => {
  it("같은 사용자의 같은 열쇠는 한 번만 — 두 번 만들면 두 번 낸다", () => {
    expect(sql).toMatch(/unique \(user_id, idempotency_key\)/);
  });

  it("같은 (섹션, 시도)는 한 줄이다", () => {
    expect(sql).toMatch(/unique \(job_id, section_id, attempt\)/);
  });

  it("**회원은 읽기만 한다** — 예약·상태·원가를 직접 못 고친다", () => {
    expect(sql).toMatch(/revoke all on public\.pdp_generation_jobs from authenticated/);
    expect(sql).toMatch(/grant select on public\.pdp_generation_jobs to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*pdp_generation_jobs[^;]*to authenticated/);
  });

  it("정산 함수는 회원에게 닫혀 있다", () => {
    expect(sql).toMatch(/revoke all on function public\.settle_expired_pdp_job[^;]*from authenticated/);
    expect(sql).toMatch(/revoke all on function public\.renew_pdp_job_lease[^;]*from authenticated/);
  });

  it("두 표 모두 RLS 가 켜져 있다", () => {
    expect(sql).toMatch(/alter table public\.pdp_generation_jobs enable row level security/);
    expect(sql).toMatch(/alter table public\.pdp_generation_items enable row level security/);
  });

  it("**그림이 아니라 경로를 담는다** — base64 칸이 없다", () => {
    // 주석이 아니라 실제 칸 정의를 본다.
    expect(code).not.toMatch(/base64|image_data|bytea/i);
    expect(code).toMatch(/output_path text/);
  });

  it("security definer 함수는 search_path 를 못 박는다", () => {
    const definers = [...sql.matchAll(/security definer\s*\n\s*set search_path = public/g)];
    const declared = [...sql.matchAll(/security definer/g)];
    expect(definers).toHaveLength(declared.length);
  });

  it("늦은 정산은 **결과가 있을 때만** 돈다", () => {
    expect(bodyOf("settle_expired_pdp_job")).toMatch(/output_path is not null/);
  });

  it("늦은 정산은 **한 번만** 닫는다", () => {
    expect(bodyOf("settle_expired_pdp_job")).toMatch(/if v_event\.status = 'succeeded' then return false/);
  });

  it("예약 갱신은 **그 작업의 예약만** 늘린다 — 사용자 예약 전체가 아니다", () => {
    const body = bodyOf("renew_pdp_job_lease");
    // `generation_events` 를 고치는 구문이 job 의 예약 하나로 좁혀져 있어야 한다.
    const update = /update public\.generation_events[\s\S]*?;/.exec(body);
    expect(update, "renew 함수가 예약을 갱신하지 않는다").not.toBeNull();
    expect(update![0]).toMatch(/request_id = v_job\.reservation_request_id/);
    expect(update![0]).toMatch(/user_id = v_job\.user_id/);
  });

  it("예약 갱신은 **남의 lease 를 못 늘린다**", () => {
    expect(bodyOf("renew_pdp_job_lease")).toMatch(/lease_owner is distinct from p_worker/);
  });

  it("여러 번 돌려도 안전하다", () => {
    expect(sql).toMatch(/create table if not exists public\.pdp_generation_jobs/);
    expect(sql).toMatch(/create table if not exists public\.pdp_generation_items/);
  });
});
