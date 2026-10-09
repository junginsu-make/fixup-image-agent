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

let 돈기록: boolean | null = false;
let 확인오류: { code: string; message: string } | null = null;
let 보류조회오류 = false;
let 잡힌크레딧 = 0;
let 상태 = "active";
let rpc오류: string | null = null;
let 삭제오류: string | null = null;
let 저장소파일: Array<{ name: string; id: string | null }> = [];
/** 라이브러리 밖 버킷의 파일(버킷 → 회원 폴더 바로 아래 목록). */
let 버킷파일: Record<string, Array<{ name: string; id: string | null }>> = {};
/** 버킷마다 실제로 지운 경로. */
const 지운경로: Record<string, string[]> = {};

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      update: () => ({eq:async()=>({error:null})}),
      delete: () => ({eq:async()=>({error:null})}),
      select: (_cols: string) => ({
        eq: () => ({
          single: async () => ({ data: table === "profiles" ? { status: 상태 } : null, error: null }),
          gt: () => ({ limit: async () => ({ data: 잡힌크레딧 > 0 ? [{ reserved_units: 잡힌크레딧 }] : [], error: 보류조회오류 ? { message: "offline" } : null }) }),
          // 관리자 사본 찾기(W8). 이 시험의 회원에게는 사본이 없다.
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      한일.push(`rpc:${fn}`);
      if (fn === "credit_member_has_records") return { data: 돈기록, error: 확인오류 };
      void args;
      return rpc오류 ? { error: { message: rpc오류 } } : { error: null };
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string, options?: { limit?: number; offset?: number }) => {
          한일.push(`list:${bucket}/${prefix}`);
          const 전부 = prefix.includes("/") ? [] : (버킷파일[bucket] ?? (bucket === "library" ? 저장소파일 : []));
          // 저장소처럼 한 번에 limit 개까지만 준다.
          const offset = options?.offset ?? 0;
          return { data: 전부.slice(offset, offset + (options?.limit ?? 100)), error: null };
        },
        remove: async (paths: string[]) => {
          한일.push(`remove:${paths.length}`);
          지운경로[bucket] = [...(지운경로[bucket] ?? []), ...paths];
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
  확인오류 = null;
  보류조회오류 = false;
  잡힌크레딧 = 0;
  상태 = "active";
  rpc오류 = null;
  삭제오류 = null;
  저장소파일 = [];
  버킷파일 = {};
  for (const key of Object.keys(지운경로)) delete 지운경로[key];
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

/**
 * **라이브러리 밖에 놓인 그림도 지운다**(2026-10-09 — 처리방침 「탈퇴 시 즉시 파기」).
 *
 * 캐릭터 그림은 `characters` 버킷(`{user}/{캐릭터}/{각도}`), 스타일 레퍼런스는 `references` 버킷
 * (`{user}/{id}`)에 있다. 표는 회원과 함께 사라지지만 파일은 남았다 — 라이브러리 버킷만 비웠다.
 */
describe("라이브러리 밖의 그림", () => {
  it("**캐릭터 그림과 스타일 레퍼런스 파일도 지운다**", async () => {
    버킷파일 = {
      characters: [{ name: "front.png", id: "c1" }],
      references: [{ name: "r1.png", id: "r1" }, { name: "r1.thumb.webp", id: "r2" }],
    };

    await 탈퇴();

    expect(지운경로.characters).toEqual(["u1/front.png"]);
    expect(지운경로.references).toEqual(["u1/r1.png", "u1/r1.thumb.webp"]);
  });

  it("**닫는 길에서도 지운다**", async () => {
    돈기록 = true;
    버킷파일 = { characters: [{ name: "front.png", id: "c1" }] };

    await 탈퇴();

    expect(지운경로.characters).toEqual(["u1/front.png"]);
  });

  it("**계정을 지우기 전에 지운다**", async () => {
    버킷파일 = { characters: [{ name: "front.png", id: "c1" }] };

    await 탈퇴();

    expect(한일.indexOf("list:characters/u1")).toBeGreaterThanOrEqual(0);
    expect(한일.indexOf("list:characters/u1")).toBeLessThan(한일.indexOf("deleteUser:u1"));
  });
});

/** 저장소 목록은 한 번에 1000개까지만 준다 — 그 뒤도 끝까지 받아 지운다. */
describe("파일이 많으면", () => {
  it("**1000개를 넘어도 모두 지운다**", async () => {
    저장소파일 = Array.from({ length: 1205 }, (_, i) => ({ name: `f${i}.png`, id: String(i) }));

    await 탈퇴();

    expect(지운경로.library).toHaveLength(1205);
    expect(new Set(지운경로.library).size).toBe(1205);
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
  it.each(["PGRST202", "42883"])("확인 함수가 없으면 파일과 회원을 지우지 않는다 (%s)", async code => {
    확인오류 = { code, message: "function missing" };
    expect((await 탈퇴()).ok).toBe(false);
    expect(한일.some(x => x.startsWith("deleteUser") || x.startsWith("remove") || x.startsWith("list"))).toBe(false);
  });
  it("빈 확인 응답을 돈 기록 없음으로 해석하지 않는다", async () => {
    돈기록 = null;
    expect((await 탈퇴()).ok).toBe(false);
    expect(한일.some(x => x.startsWith("deleteUser") || x.startsWith("remove") || x.startsWith("list"))).toBe(false);
  });
  it("처리 중인 크레딧 조회 실패도 파일 삭제 전에 멈춘다", async () => {
    보류조회오류 = true;
    expect((await 탈퇴()).ok).toBe(false);
    expect(한일.some(x => x.startsWith("deleteUser") || x.startsWith("remove") || x.startsWith("list"))).toBe(false);
  });
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
