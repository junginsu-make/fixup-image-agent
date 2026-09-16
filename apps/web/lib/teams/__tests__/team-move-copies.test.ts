import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자 복사본은 팀을 따라가지 않는다.**
 *
 * 관리자가 다른 회원의 참고 이미지를 복사해 오면, 복사본은 관리자 소유이면서
 * **원본의 팀 범위**를 따른다. 그런데 팀 배정·해제·이동은 `user_id` 로 그 사람
 * 그림의 팀을 통째로 바꿨다. 그래서
 *
 * - 관리자가 팀 X 에서 빠지면 복사본이 **전 회원 공개**(null)가 되고
 * - 관리자가 X → Y 로 옮기면 X 의 그림이 **Y 에 보였다**
 *
 * (2026-09-16 독립 리뷰. 운영에 팀에 든 관리자가 실제로 있다.)
 */
vi.mock("server-only", () => ({}));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false }));

interface Row { id: string; user_id: string; team_id: string | null }
let tables: Record<string, Row[]> = {};

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Partial<Row> | null = null;
  let selecting = false;
  const rows = () => (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
  const run = () => {
    if (patch) {
      for (const row of rows()) Object.assign(row, patch);
      return { data: null, error: null };
    }
    return { data: selecting ? rows().map((row) => ({ ...row })) : null, error: null };
  };
  const self: Record<string, unknown> = {
    select: () => { selecting = true; return self; },
    update: (value: Partial<Row>) => { patch = value; return self; },
    eq: (column: keyof Row, value: string) => { filters.push((row) => row[column] === value); return self; },
    is: (column: keyof Row, value: null) => { filters.push((row) => row[column] === value); return self; },
    in: (column: keyof Row, values: string[]) => { filters.push((row) => values.includes(row[column] as string)); return self; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(run())),
  };
  return self;
}

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (table: string) => query(table) }),
}));

const { countWorkFor, moveFollowingWork } = await import("../store");
const { adoptedReferenceId } = await import("../../reference-copy-id");

const 관리자 = "관리자";
const 복사본 = adoptedReferenceId("회원A의그림", 관리자);
const 내그림 = "61d9bb82-d1e8-4f11-96c5-eac6766348f0";

beforeEach(() => {
  tables = {
    reference_images: [
      // 관리자가 팀 X 에 있을 때 만든 자기 그림
      { id: 내그림, user_id: 관리자, team_id: "팀X" },
      // 팀 X 회원의 그림을 복사해 온 것 — 원본 범위 X 를 따른다
      { id: 복사본, user_id: 관리자, team_id: "팀X" },
    ],
    library_items: [{ id: "작업1", user_id: 관리자, team_id: "팀X" }],
  };
});

const 범위 = (id: string) => tables.reference_images!.find((row) => row.id === id)!.team_id;

describe("팀에서 빠질 때", () => {
  it("**복사본은 전 회원 공개로 안 바뀐다**", async () => {
    await moveFollowingWork("reference_images", 관리자, "팀X", null);

    expect(범위(복사본)).toBe("팀X");
  });

  it("관리자 자기 그림은 그대로 풀린다", async () => {
    await moveFollowingWork("reference_images", 관리자, "팀X", null);

    expect(범위(내그림)).toBeNull();
  });
});

describe("다른 팀으로 옮길 때", () => {
  it("**복사본은 새 팀으로 안 간다** — 원래 팀 그림이 새 팀에 안 보인다", async () => {
    await moveFollowingWork("reference_images", 관리자, "팀X", "팀Y");

    expect(범위(복사본)).toBe("팀X");
    expect(범위(내그림)).toBe("팀Y");
  });
});

describe("팀 없음에서 팀에 들어갈 때", () => {
  it("공용 원본의 복사본은 새 팀에 묶이지 않는다", async () => {
    tables.reference_images = [
      { id: 내그림, user_id: 관리자, team_id: null },
      { id: 복사본, user_id: 관리자, team_id: null },
    ];

    await moveFollowingWork("reference_images", 관리자, null, "팀X");

    expect(범위(복사본)).toBeNull();
    expect(범위(내그림)).toBe("팀X");
  });
});

describe("다른 표", () => {
  it("참고 이미지가 아닌 표는 지금까지처럼 통째로 옮긴다", async () => {
    await moveFollowingWork("library_items", 관리자, "팀X", "팀Y");

    expect(tables.library_items![0]!.team_id).toBe("팀Y");
  });

  it("복사본이 하나도 없어도 넘어지지 않는다", async () => {
    tables.reference_images = [{ id: 복사본, user_id: 관리자, team_id: "팀X" }];

    await expect(moveFollowingWork("reference_images", 관리자, "팀X", null)).resolves.toBeUndefined();
    expect(범위(복사본)).toBe("팀X");
  });
});

describe("「작업물 N건이 팀에 함께 들어갑니다」", () => {
  it("**복사본은 세지 않는다** — 따라가지 않는 것을 센다고 하면 화면이 거짓말을 한다", async () => {
    tables = {
      library_items: [], sns_projects: [], poster_projects: [], reference_sets: [], characters: [],
      reference_images: [
        { id: 내그림, user_id: 관리자, team_id: null },
        { id: 복사본, user_id: 관리자, team_id: null },
      ],
    };

    const counts = await countWorkFor([관리자]);

    expect(counts.get(관리자)).toBe(1);
  });
});
