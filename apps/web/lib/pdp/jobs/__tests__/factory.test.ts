import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// 운영 클라이언트는 키를 요구한다. 부르는지만 보면 되므로 가짜로 바꿔 둔다.
vi.mock("../../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => ({}) }) }));

const { createPdpJobRepository, isPdpJobsEnabled } = await import("../index");

/**
 * **로컬 시험이 운영 DB 를 건드리면 안 된다.**
 *
 * 저장소 CLAUDE.md 가 경고한 자리다 — `.env.local` 에 운영 값을 채우면 로컬의
 * 삭제 버튼이 운영 데이터를 지운다. 그래서 「어느 저장소를 쓰는가」는 기존
 * 판정 하나에 맡기고, 그것이 실제로 그렇게 도는지 값으로 잰다.
 */
describe("어느 저장소를 쓰는가", () => {
  it("로컬 모드면 파일 저장소다", () => {
    const repo = createPdpJobRepository({
      NODE_ENV: "development", LOCAL_STORE: "1", LOCAL_STORE_ROOT: "/tmp/x",
    } as NodeJS.ProcessEnv);

    // 파일 구현에만 있는 출구로 가른다.
    expect(repo).toHaveProperty("debugRaw");
  });

  it("**운영에서는 LOCAL_STORE=1 이어도 파일로 안 간다**", () => {
    const repo = createPdpJobRepository({
      NODE_ENV: "production", LOCAL_STORE: "1",
    } as NodeJS.ProcessEnv);

    expect(repo).not.toHaveProperty("debugRaw");
  });

  it("로컬 모드가 아니면 운영 저장소다", () => {
    const repo = createPdpJobRepository({ NODE_ENV: "development" } as NodeJS.ProcessEnv);

    expect(repo).not.toHaveProperty("debugRaw");
  });
});

describe("작업 경로 스위치", () => {
  /** `NODE_ENV` 는 이 검사와 무관하다. 타입만 맞춰 준다. */
  const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv =>
    ({ NODE_ENV: "development", ...extra }) as NodeJS.ProcessEnv;

  it("**기본은 꺼짐** — 표와 워커가 준비되기 전에 켜지면 만들기가 막힌다", () => {
    expect(isPdpJobsEnabled(env())).toBe(false);
    expect(isPdpJobsEnabled(env({ PDP_JOBS_ENABLED: "0" }))).toBe(false);
    expect(isPdpJobsEnabled(env({ PDP_JOBS_ENABLED: "true" }))).toBe(false);
  });

  it("1 일 때만 켜진다", () => {
    expect(isPdpJobsEnabled(env({ PDP_JOBS_ENABLED: "1" }))).toBe(true);
  });
});
