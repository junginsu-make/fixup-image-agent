import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **탈퇴가 실제로 무엇을 하는가**(2026-09-23 사용자 요청).
 *
 * 되돌릴 수 없는 일이라 **어느 길로 가는지**와 **무엇을 건드리는지**를
 * 값으로 잰다.
 */

vi.mock("server-only", () => ({}));

/** 데이터베이스에 실제로 보낸 것. */
const 한일: string[] = [];

let 돈기록 = false;
let 잡힌크레딧 = 0;
let 상태 = "active";
let rpc오류: string | null = null;
let 삭제오류: string | null = null;
let 저장소파일: Array<{ name: string; id: string | null }> = [];

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: () => ({
          single: async () => ({ data: table === "profiles" ? { status: 상태 } : null, error: null }),
          gt: () => ({ limit: async () => ({ data: 잡힌크레딧 > 0 ? [{ reserved_units: 잡힌크레딧 }] : [] }) }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      한일.push(`rpc:${fn}`);
      if (fn === "credit_member_has_records") return { data: 돈기록, error: null };
      void args;
      return rpc오류 ? { error: { message: rpc오류 } } : { error: null };
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          한일.push(`list:${bucket}/${prefix}`);
          return { data: prefix.includes("/") ? [] : 저장소파일, error: null };
        },
        remove: async (paths: string[]) => {
          한일.push(`remove:${paths.length}`);
          return { error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          한일.push(`deleteUser:${id}`);
          return 삭제오류 ? { error: { message: 삭제오류 } } : { error: null };
        },
      },
    },
  }),
}));

const { withdrawAccount } = await import("../withdraw-account");

const 탈퇴 = () => withdrawAccount("u1", "me@example.com");

beforeEach(() => {
  한일.length = 0;
  돈기록 = false;
  잡힌크레딧 = 0;
  상태 = "active";
  rpc오류 = null;
  삭제오류 = null;
  저장소파일 = [];
});

describe("돈 기록이 없으면", () => {
  it("**인증 계정까지 지운다**", async () => {
    const 결과 = await 탈퇴();

    expect(결과.ok).toBe(true);
    expect(결과.path).toBe("delete");
    expect(한일).toContain("deleteUser:u1");
  });

  it("**계정을 닫는 함수는 안 부른다**", async () => {
    await 탈퇴();

    expect(한일, "지우면서 닫기도 했다").not.toContain("rpc:member_withdraw");
  });

  it("**모두 삭제했다고 말한다**", async () => {
    expect((await 탈퇴()).message).toContain("모두 삭제");
  });
});

/**
 * **돈 기록이 있으면 지울 수 없다.** 데이터베이스가 막는다
 * (`credit_member_has_records`, 202609220003). 그래서 닫는다.
 */
describe("돈 기록이 있으면", () => {
  beforeEach(() => { 돈기록 = true; });

  it("**계정을 닫는다**", async () => {
    const 결과 = await 탈퇴();

    expect(결과.ok).toBe(true);
    expect(결과.path).toBe("close");
    expect(한일).toContain("rpc:member_withdraw");
  });

  it("**인증 계정은 안 지운다** — 돈 기록의 주인이 사라지면 안 된다", async () => {
    await 탈퇴();

    expect(한일.some((x) => x.startsWith("deleteUser")), "돈 기록이 있는데 지웠다").toBe(false);
  });

  it("**기록이 남는다고 말한다**", async () => {
    const 결과 = await 탈퇴();

    expect(결과.message).toContain("보관됩니다");
    expect(결과.message, "닫았는데 모두 삭제했다고 한다").not.toContain("모두 삭제");
  });
});

/**
 * **만들고 있는 중에는 못 떠난다.** 잡힌 크레딧을 풀 데가 없어진다.
 */
describe("처리 중인 작업이 있으면", () => {
  beforeEach(() => { 잡힌크레딧 = 3; });

  it("**막는다**", async () => {
    const 결과 = await 탈퇴();

    expect(결과.ok).toBe(false);
    expect(결과.message).toContain("만들고 있는 작업");
  });

  it("**아무것도 안 건드린다**", async () => {
    await 탈퇴();

    expect(한일.some((x) => x.startsWith("deleteUser") || x.startsWith("remove")), "막혔는데 지웠다").toBe(false);
  });
});

/**
 * **라이브러리 파일은 따로 지운다.**
 *
 * `library_items` 는 `profiles` 를 `on delete cascade` 로 참조하므로 행은
 * 함께 사라진다. **그런데 저장소의 그림 파일은 안 사라진다** — 표만 비고
 * 파일은 남는다.
 */
describe("만든 그림", () => {
  beforeEach(() => {
    저장소파일 = [{ name: "a.png", id: "1" }, { name: "b.png", id: "2" }];
  });

  it("**지우는 길에서 파일을 지운다**", async () => {
    await 탈퇴();

    expect(한일).toContain("remove:2");
  });

  it("**닫는 길에서도 파일을 지운다** — 내 것이고 돈 기록이 아니다", async () => {
    돈기록 = true;
    await 탈퇴();

    expect(한일).toContain("remove:2");
  });

  it("**지우기 전에 지운다** — 계정이 사라지면 경로를 잃는다", async () => {
    await 탈퇴();

    const 파일 = 한일.indexOf("remove:2");
    const 계정 = 한일.indexOf("deleteUser:u1");
    expect(파일).toBeGreaterThanOrEqual(0);
    expect(파일, "계정을 먼저 지웠다").toBeLessThan(계정);
  });
});

describe("이미 떠난 계정", () => {
  it("**두 번 처리하지 않는다**", async () => {
    상태 = "withdrawn";

    const 결과 = await 탈퇴();

    expect(결과.ok).toBe(false);
    expect(한일.some((x) => x.startsWith("deleteUser") || x.startsWith("remove"))).toBe(false);
  });
});

describe("실패하면", () => {
  it("**닫기가 실패하면 그렇다고 말한다** — 마이그레이션 전이면 함수가 없다", async () => {
    돈기록 = true;
    rpc오류 = "function member_withdraw does not exist";

    const 결과 = await 탈퇴();

    expect(결과.ok).toBe(false);
    expect(결과.message).toContain("member_withdraw");
  });

  it("**지우기가 실패하면 그렇다고 말한다**", async () => {
    삭제오류 = "Database error deleting user";

    const 결과 = await 탈퇴();

    expect(결과.ok).toBe(false);
    expect(결과.message).toContain("Database error");
  });
});
