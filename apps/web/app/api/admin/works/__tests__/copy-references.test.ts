import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 관리자가 다른 회원의 작업을 다시 만들 때 **참고 이미지를 복사해 온다.**
 *
 * 잘 될 때보다 **틀어질 때**를 잰다. 독립 리뷰(2026-09-16)가 배포 전에 짚은
 * 것들이다.
 *
 * 1. 복사본의 팀을 지우면 이 표에서는 **전 회원 공개**가 된다 — 원본 팀을 물려받는다
 * 2. 동시에 두 번 불리면 진 쪽이 **이긴 쪽 파일을 지운다** — 충돌하면 이긴 쪽을 쓴다
 * 3. 조회 오류를 「없음」으로 읽으면 같은 길로 멀쩡한 파일을 지운다 — 던진다
 * 4. 행만 있고 파일이 없는 복사본은 스스로 안 낫는다 — 다시 올린다
 * 5. 작업 기록의 id 는 주인이 아무거나 적을 수 있다 — 주인이 보던 것만 옮긴다
 * 6. 범위를 못 맞추면 관리자 팀에 열린 채 남는다 — 되감는다
 */
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));

interface Row {
  id: string; user_id: string; team_id: string | null; storage_path: string;
  thumb_path: string | null; title: string | null; purpose: string;
  width: number | null; height: number | null;
}

/** 표 안의 줄. id 로 찾는다. */
let rows = new Map<string, Row>();
/** 저장소에 있는 파일 경로. */
let files = new Set<string>();
const removed: string[] = [];
const scopeUpdates: Array<{ id: string; team_id: string | null }> = [];

/** 한 번만 낼 오류들. */
let failFindOnce: string | null = null;
let failScopeUpdate = false;
/** insert 직전에 다른 요청이 같은 행을 먼저 만든 것처럼 꾸민다. */
let raceWinner: Row | null = null;

function query(table: string) {
  const state: { ids?: string[]; id?: string; op?: "select" | "update" | "delete"; patch?: Record<string, unknown> } = {};
  const self: Record<string, unknown> = {
    select: () => { state.op = state.op ?? "select"; return self; },
    in: (_col: string, ids: string[]) => { state.ids = ids; return self; },
    eq: (_col: string, id: string) => {
      state.id = id;
      if (state.op === "update") {
        if (failScopeUpdate) return Promise.resolve({ error: { message: "범위를 못 고쳤습니다" } });
        const row = rows.get(id);
        if (row) row.team_id = state.patch!.team_id as string | null;
        scopeUpdates.push({ id, team_id: state.patch!.team_id as string | null });
        return Promise.resolve({ error: null });
      }
      if (state.op === "delete") {
        rows.delete(id);
        return Promise.resolve({ error: null });
      }
      return self;
    },
    update: (patch: Record<string, unknown>) => { state.op = "update"; state.patch = patch; return self; },
    delete: () => { state.op = "delete"; return self; },
    maybeSingle: async () => {
      if (failFindOnce && state.id === failFindOnce) {
        failFindOnce = null;
        return { data: null, error: { message: "잠깐 못 읽었습니다" } };
      }
      return { data: rows.get(state.id!) ?? null, error: null };
    },
    insert: async (row: Row) => {
      if (raceWinner && raceWinner.id === row.id) {
        rows.set(raceWinner.id, raceWinner);
        raceWinner = null;
        return { error: { message: "duplicate key", code: "23505" } };
      }
      // 팀 도장 트리거가 관리자 팀을 찍는다.
      rows.set(row.id, { ...row, team_id: "관리자팀" });
      return { error: null };
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
      data: table === "reference_images" ? (state.ids ?? []).map((id) => rows.get(id)).filter(Boolean) : [],
      error: null,
    })),
  };
  return self;
}

vi.mock("../../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => query(table),
    storage: {
      from: () => ({
        download: async (path: string) => (files.has(path)
          ? { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }
          : { data: null, error: { message: "없음" } }),
        upload: async (path: string) => { files.add(path); return { error: null }; },
        remove: async (paths: string[]) => {
          for (const path of paths) { files.delete(path); removed.push(path); }
          return { error: null };
        },
        list: async (dir: string, options: { search: string }) => ({
          data: [...files]
            .filter((path) => path.startsWith(`${dir}/`) && path.slice(dir.length + 1).includes(options.search))
            .map((path) => ({ name: path.slice(dir.length + 1) })),
          error: null,
        }),
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })),
          error: null,
        }),
      }),
    },
  }),
}));

const { copyReferencesToSelf } = await import("../store");
const { adoptedReferenceId } = await import("../copy-paths");

const 관리자 = "관리자";
const 주인 = { userId: "회원A", teamId: "팀X" };

function 원본(id: string, patch: Partial<Row> = {}): Row {
  return {
    id, user_id: "회원A", team_id: "팀X",
    storage_path: `회원A/references/${id}.png`, thumb_path: `회원A/references/${id}.thumb.webp`,
    title: "가을 포스터", purpose: "poster", width: 1024, height: 1024,
    ...patch,
  };
}

function 넣기(row: Row) {
  rows.set(row.id, row);
  files.add(row.storage_path);
  if (row.thumb_path) files.add(row.thumb_path);
}

beforeEach(() => {
  rows = new Map();
  files = new Set();
  removed.length = 0;
  scopeUpdates.length = 0;
  failFindOnce = null;
  failScopeUpdate = false;
  raceWinner = null;
});

describe("복사본의 범위", () => {
  it("**팀 X 만 보던 그림은 복사본도 팀 X 다** — 전 회원에게 안 열린다", async () => {
    넣기(원본("a"));

    const [copy] = await copyReferencesToSelf(["a"], 관리자, 주인);

    expect(rows.get(copy!.id)!.team_id).toBe("팀X");
    // 이 표에서 null 은 「누구나 본다」다. 절대 null 로 두면 안 된다.
    expect(rows.get(copy!.id)!.team_id).not.toBeNull();
  });

  it("공용 그림은 복사본도 공용이다 — 원래도 모두 봤다", async () => {
    넣기(원본("a", { team_id: null }));

    const [copy] = await copyReferencesToSelf(["a"], 관리자, 주인);

    expect(rows.get(copy!.id)!.team_id).toBeNull();
  });

  it("관리자 팀 도장이 남지 않는다", async () => {
    넣기(원본("a"));

    const [copy] = await copyReferencesToSelf(["a"], 관리자, 주인);

    expect(rows.get(copy!.id)!.team_id).not.toBe("관리자팀");
  });

  it("범위를 못 맞추면 행과 파일을 되감는다", async () => {
    넣기(원본("a"));
    failScopeUpdate = true;

    const copies = await copyReferencesToSelf(["a"], 관리자, 주인);

    const newId = adoptedReferenceId("a", 관리자);
    expect(copies).toEqual([]);
    expect(rows.has(newId)).toBe(false);
    expect(files.has(`관리자/references/${newId}.png`)).toBe(false);
  });
});

describe("동시에 두 번 불릴 때", () => {
  it("**다른 요청이 먼저 만들었으면 그 행을 쓰고 파일은 안 지운다**", async () => {
    넣기(원본("a"));
    const newId = adoptedReferenceId("a", 관리자);
    // 이 요청이 행이 없다고 본 뒤, insert 직전에 다른 요청이 먼저 만들었다.
    raceWinner = {
      ...원본("a"), id: newId, user_id: 관리자,
      storage_path: `관리자/references/${newId}.png`, thumb_path: `관리자/references/${newId}.thumb.webp`,
    };

    const [copy] = await copyReferencesToSelf(["a"], 관리자, 주인);

    expect(copy!.id).toBe(newId);
    // 두 요청이 같은 경로에 올렸다. 지우면 이긴 쪽 행이 빈 그림이 된다.
    expect(removed).toEqual([]);
    expect(files.has(`관리자/references/${newId}.png`)).toBe(true);
  });

  it("조회가 잠깐 실패하면 **던진다** — 없다고 읽고 다시 올리지 않는다", async () => {
    넣기(원본("a"));
    const newId = adoptedReferenceId("a", 관리자);
    failFindOnce = newId;

    await expect(copyReferencesToSelf(["a"], 관리자, 주인)).rejects.toThrow();
    expect(removed).toEqual([]);
  });
});

describe("이미 복사한 적이 있을 때", () => {
  it("다시 복사하지 않고 그대로 쓴다", async () => {
    넣기(원본("a"));
    const first = await copyReferencesToSelf(["a"], 관리자, 주인);
    const rowCount = rows.size;

    const second = await copyReferencesToSelf(["a"], 관리자, 주인);

    expect(second[0]!.id).toBe(first[0]!.id);
    expect(rows.size).toBe(rowCount);
  });

  it("**행만 있고 파일이 없으면 다시 올린다**", async () => {
    넣기(원본("a"));
    const [copy] = await copyReferencesToSelf(["a"], 관리자, 주인);
    files.delete(copy!.storagePath);

    await copyReferencesToSelf(["a"], 관리자, 주인);

    expect(files.has(copy!.storagePath)).toBe(true);
  });

  it("범위를 다시 맞춘다 — 전에 틀어진 것도 낫는다", async () => {
    넣기(원본("a"));
    const [copy] = await copyReferencesToSelf(["a"], 관리자, 주인);
    rows.get(copy!.id)!.team_id = "관리자팀";

    await copyReferencesToSelf(["a"], 관리자, 주인);

    expect(rows.get(copy!.id)!.team_id).toBe("팀X");
  });
});

describe("무엇을 복사하나", () => {
  it("**작업 주인이 못 보던 남의 팀 그림은 안 옮긴다**", async () => {
    // 주인이 남의 팀 그림 id 를 작업 기록에 심어 둔 경우다.
    넣기(원본("남의팀", { user_id: "회원B", team_id: "팀Y" }));

    expect(await copyReferencesToSelf(["남의팀"], 관리자, 주인)).toEqual([]);
    expect(rows.size).toBe(1);
  });

  it("주인 팀원의 그림은 옮긴다", async () => {
    넣기(원본("팀원것", { user_id: "팀원", team_id: "팀X" }));

    expect(await copyReferencesToSelf(["팀원것"], 관리자, 주인)).toHaveLength(1);
  });

  it("이미 관리자 것이면 복사하지 않고 그대로 준다", async () => {
    넣기(원본("내것", { user_id: 관리자, team_id: null, storage_path: `${관리자}/references/내것.png` }));

    const [copy] = await copyReferencesToSelf(["내것"], 관리자, 주인);

    expect(copy!.id).toBe("내것");
    expect(rows.size).toBe(1);
  });

  it("지워져서 표에 없는 그림은 빼고 넘어간다", async () => {
    넣기(원본("a"));

    const copies = await copyReferencesToSelf(["a", "지워진것"], 관리자, 주인);

    expect(copies.map((entry) => entry.from)).toEqual(["a"]);
  });

  it("복사본 제목에 (복사) 가 붙는다 — 캐릭터 제목 맞추기와 안 섞인다", async () => {
    넣기(원본("각도", { title: "하루 (캐릭터) · 정면" }));

    const [copy] = await copyReferencesToSelf(["각도"], 관리자, 주인);

    expect(rows.get(copy!.id)!.title).toBe("하루 (캐릭터) · 정면 (복사)");
  });
});
