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

/** 한 번의 update 에 실린 `in` id 수. 나눠 옮기는지 본다. */
const updateSizes: number[] = [];
/** 가짜 프로젝트의 최대 행 수. 진짜처럼 한 번에 이보다 많이 안 준다. */
const MAX_ROWS = 1000;

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Partial<Row> | null = null;
  let selecting = false;
  let window: [number, number] | null = null;
  let ordered = false;
  let inSize: number | null = null;
  const rows = () => (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
  const run = () => {
    if (patch) {
      if (inSize !== null) updateSizes.push(inSize);
      for (const row of rows()) Object.assign(row, patch);
      return { data: null, error: null };
    }
    if (!selecting) return { data: null, error: null };
    let found = rows().map((row) => ({ ...row }));
    if (ordered) found.sort((left, right) => left.id.localeCompare(right.id));
    found = window ? found.slice(window[0], window[1] + 1) : found;
    // 진짜 PostgREST 처럼 최대 행 수에서 조용히 자른다.
    return { data: found.slice(0, MAX_ROWS), error: null };
  };
  const self: Record<string, unknown> = {
    select: () => { selecting = true; return self; },
    order: () => { ordered = true; return self; },
    range: (from: number, to: number) => { window = [from, to]; return self; },
    update: (value: Partial<Row>) => { patch = value; return self; },
    eq: (column: keyof Row, value: string | null) => {
      /*
        **진짜보다 너그러우면 안 된다.** PostgREST 의 `eq.null` 은 null 과 맞지 않는다
        — `is` 를 써야 한다. 여기서 맞춰 주면 `is` 분기를 지워도 초록이었다
        (2026-09-16 리뷰가 실증).
      */
      if (value === null) throw new Error("eq(null) 은 PostgREST 에서 아무것도 안 맞는다 — is 를 써라");
      filters.push((row) => row[column] === value);
      return self;
    },
    is: (column: keyof Row, value: null) => { filters.push((row) => row[column] === value); return self; },
    in: (column: keyof Row, values: string[]) => {
      inSize = values.length;
      filters.push((row) => values.includes(row[column] as string));
      return self;
    },
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

describe("그림이 아주 많을 때", () => {
  /*
    한 번에 읽으면 최대 행 수(기본 1000)에서 조용히 잘리고, 한 번에 옮기면 `in`
    필터가 주소 길이 한계에 걸린다(2026-09-16 리뷰).
  */
  const 많이 = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      user_id: 관리자,
      team_id: "팀X" as string | null,
    }));

  it("**1000장을 넘어도 전부 옮긴다** — 잘린 뒤쪽이 옛 팀에 남지 않는다", async () => {
    tables.reference_images = [...많이(1001), { id: 복사본, user_id: 관리자, team_id: "팀X" }];
    updateSizes.length = 0;

    await moveFollowingWork("reference_images", 관리자, "팀X", "팀Y");

    const left = tables.reference_images.filter((row) => row.id !== 복사본 && row.team_id === "팀X");
    expect(left).toHaveLength(0);
    expect(범위(복사본)).toBe("팀X");
  });

  it("**100장씩 나눠 옮긴다**", async () => {
    tables.reference_images = 많이(250);
    updateSizes.length = 0;

    await moveFollowingWork("reference_images", 관리자, "팀X", "팀Y");

    expect(updateSizes).toEqual([100, 100, 50]);
  });
});

describe("참고 이미지가 아닌 표를 「팀 없음」에서 옮길 때", () => {
  it("**`is(null)` 로 찾는다** — `eq(null)` 은 진짜 저장소에서 아무것도 안 맞는다", async () => {
    /*
      배정할 때 가장 먼저 도는 길이다(`stampWorkTeam` 의 첫 호출). 이 분기를
      `eq` 하나로 합쳐도 초록이었다 — 이 경우를 재는 시험이 없었다(2026-09-16 확인).
      가짜 `eq` 는 null 을 받으면 던지므로, 그렇게 바뀌면 여기서 멈춘다.
    */
    tables.library_items = [{ id: "작업1", user_id: 관리자, team_id: null }];

    await moveFollowingWork("library_items", 관리자, null, "팀X");

    expect(tables.library_items[0]!.team_id).toBe("팀X");
  });
});
