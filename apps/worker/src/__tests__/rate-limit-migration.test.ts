import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "../../supabase/migrations/202608310005_ingest_rate_limits.sql"),
  "utf8",
);

describe("수집 횟수 상한 마이그레이션", () => {
  it("사용자·시간 창별 카운터를 만든다", () => {
    expect(sql).toContain("create table public.ingest_rate_limits");
    expect(sql).toContain("primary key (user_id, window_started_at)");
    expect(sql).toContain("references public.profiles(id)");
  });

  it("상한 미만일 때만 원자적으로 카운터를 올린다", () => {
    expect(sql).toContain("create or replace function public.claim_ingest_poll_slot");
    expect(sql).toContain("on conflict (user_id, window_started_at) do update");
    expect(sql).toContain("poll_count < p_limit");
  });

  it("service_role 만 카운터 함수를 부른다", () => {
    expect(sql).toContain("revoke all on function public.claim_ingest_poll_slot");
    expect(sql).toContain("grant execute on function public.claim_ingest_poll_slot");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated/);
  });
});
