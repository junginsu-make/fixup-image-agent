import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 관리자가 남의 작업을 **자기 것으로 복사**한다.
 *
 * 고치는 대신 복사하는 이유 — 쓰기 경로를 안 넓혀도 되기 때문이다. 그 방어선은
 * 「팀원의 카드뉴스에서 생성을 돌리면 크레딧이 예약·차감되고 fal 에 실제 요청이
 * 나간 뒤 결과만 어디에도 안 남았다」는 사고를 겪고 세운 것이다.
 *
 * 그림도 함께 가져온다(2026-09-16 사용자 결정) — 다시 만드는 동안 원래 결과를
 * 참고용으로 옆에 두고 보기 위해서다.
 */
vi.mock("server-only", () => ({}));

const uploads: string[] = [];
const downloads: string[] = [];
let inserted: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
/** 원본을 못 읽는 경로. 저장소에서 파일이 사라진 경우다. */
let missingDownloads: string[] = [];
let updated: Record<string, unknown> | null = null;
let sourceRow: Record<string, unknown> | null = null;
let imageRows: Array<Record<string, unknown>> = [];
let lastTable = "";
let updatedRows = 0;
/** 표별 마지막 insert. 복사가 여러 표를 건드리므로 하나로는 못 본다. */
const insertedBy: Record<string, unknown> = {};
/** 표별 **모든** insert — 포스터는 회차마다 요청을 만든다. */
const insertsBy: Record<string, unknown[]> = {};
/** 표별 모든 update. */
const updatesBy: Record<string, Array<Record<string, unknown>>> = {};
/** 원본 작업의 요청 장부 줄. */
let requestRows: Array<Record<string, unknown>> = [];
/** 표별 `eq` 조건. 어느 줄을 고치고 어느 범위를 읽는지 본다. */
const eqBy: Record<string, Array<[string, unknown]>> = {};

function builderFor(table: string) {
  lastTable = table;
  /** 이 질의가 넣은 줄. 실제 DB 처럼 `insert(...).select()` 는 **넣은 줄**을 돌려준다. */
  let pendingInsert: Array<Record<string, unknown>> | null = null;
  const self: Record<string, unknown> = {
    select: () => self,
    eq: (column: string, value: unknown) => { (eqBy[table] ??= []).push([column, value]); return self; },
    // 지운 것 빼기도 같은 조건 목록에 적는다 — 회원이 지운 작업을 복사하지 않는지 본다.
    is: (column: string, value: unknown) => { (eqBy[table] ??= []).push([`is:${column}`, value]); return self; },
    order: () => self,
    insert: (row: Record<string, unknown> | Array<Record<string, unknown>>) => {
      inserted = row;
      insertedBy[table] = row;
      (insertsBy[table] ??= []).push(row);
      pendingInsert = Array.isArray(row) ? row : [row];
      return self;
    },
    update: (row: Record<string, unknown>) => {
      updated = row; updatedRows = 1;
      (updatesBy[table] ??= []).push(row);
      return self;
    },
    maybeSingle: async () => ({ data: sourceRow, error: null }),
    /*
      만든 행을 돌려준다 — 저장소가 그것을 `record()` 로 바꿔 쓰므로 칸이
      빠지면 거기서 넘어진다. 실제 DB 도 `insert(...).select(...).single()` 로
      **방금 넣은 줄**을 돌려준다.
    */
    single: async () => ({
      data: {
        ...(inserted as Record<string, unknown> ?? {}),
        // 요청 줄은 회차마다 따로 만든다 — 실제 DB 처럼 줄마다 다른 id 를 준다.
        id: table === "poster_generation_requests"
          ? `새요청-${insertsBy[table]?.length ?? 0}` : "새작업",
      },
      error: null,
    }),
    /*
      `update(...).select("id")` 는 **갱신된 줄**을 돌려준다. 빈 배열을 주면
      복사가 「적지 못했다」로 끝나므로 실제 DB 처럼 한 줄을 돌려준다 —
      그 셈이 실제로 도는지 보려면 이것이 맞아야 한다.
    */
    then: (resolve: (x: unknown) => unknown) =>
      Promise.resolve(resolve({
        /*
          **표를 먼저 본다.** 전에는 「한 번이라도 update 했으면 갱신된 줄」로
          답했는데, 그 깃발은 표를 안 가린다 — 복사가 프로젝트를 먼저 고치면
          그 뒤의 `poster_images` 조회까지 갱신된 줄을 받아 그림이 통째로
          사라졌다. 실제 DB 는 표마다 따로 답한다.
        */
        data: table === "poster_images"
          // 넣은 줄이면 새 id 를 붙여 돌려준다. 아니면 원본 조회다.
          ? (pendingInsert ? pendingInsert.map((row, index) => ({ ...row, id: `새그림-${index}` })) : imageRows)
          : table === "poster_generation_requests"
            ? requestRows
            : updatedRows ? [{ id: "새작업" }] : [],
        error: null,
      })),
  };
  return self;
}

vi.mock("../../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => builderFor(table),
    storage: {
      from: () => ({
        download: async (path: string) => {
          downloads.push(path);
          if (missingDownloads.includes(path)) return { data: null, error: { message: "Object not found" } };
          return { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null };
        },
        upload: async (path: string) => { uploads.push(path); return { error: null }; },
        /*
          `readAnyWork` 가 카드 주소를 채우느라 서명을 부른다. 안 흉내 내면
          복사 시험이 거기서 넘어진다 — 실제 저장소는 늘 이 함수를 가진다.
        */
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })),
          error: null,
        }),
      }),
    },
  }),
}));

vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));

const { copyWorkToSelf } = await import("../store");

function snsSource(): Record<string, unknown> {
  return {
    id: "원본", user_id: "회원A", candidate_id: null, title: "겨울",
    status: "done", ratio: "1:1", language: "ko", model_id: "m1",
    card_count_mode: "auto", card_count: null, tone_note: null,
    data: {
      source: {}, attachments: [], look: {}, userInstruction: "겨울 느낌으로",
      attachmentIntents: {}, slotPlan: null,
      flow: {
        stage: "result",
        cards: [{
          assetPath: "회원A/sns/원본/0.png",
          thumbPath: "회원A/sns/원본/0.thumb.webp",
        }],
      },
    },
    created_at: "2026-01-01", updated_at: "2026-01-02",
  };
}

function posterSource(): Record<string, unknown> {
  return {
    id: "원본", user_id: "회원A", title: "가을", status: "done",
    ratio: "2:3", model_id: "m1", data: { instruction: "가을 느낌" },
    created_at: "2026-01-01", updated_at: "2026-01-02",
  };
}

function posterImageRow(): Record<string, unknown> {
  return {
    id: "원본그림0", generation_request_id: "원본요청1",
    variant_index: 0, selected: true, width: 1024, height: 1536, review: null,
    asset_path: "회원A/poster/원본/0.png",
    thumb_path: "회원A/poster/원본/0.thumb.webp",
  };
}

beforeEach(() => {
  uploads.length = 0; downloads.length = 0;
  inserted = null; updated = null; sourceRow = null; imageRows = []; lastTable = ""; updatedRows = 0;
  requestRows = [];
  missingDownloads = [];
  for (const key of Object.keys(insertedBy)) delete insertedBy[key];
  for (const key of Object.keys(insertsBy)) delete insertsBy[key];
  for (const key of Object.keys(updatesBy)) delete updatesBy[key];
  for (const key of Object.keys(eqBy)) delete eqBy[key];
});

describe("copyWorkToSelf — 카드뉴스", () => {
  it("소유자를 부르는 쪽이 준 사람으로 강제한다", async () => {
    // 원본 행에 남의 user_id 가 들어 있어도 복사본은 세션 사용자 것이다.
    sourceRow = snsSource();

    await copyWorkToSelf("sns", "원본", "관리자B");

    expect((inserted as Record<string, unknown>).user_id).toBe("관리자B");
  });

  it("그림을 원본에서 받아 새 자리에 올린다", async () => {
    sourceRow = snsSource();

    await copyWorkToSelf("sns", "원본", "관리자B");

    expect(downloads).toEqual([
      "회원A/sns/원본/0.png",
      "회원A/sns/원본/0.thumb.webp",
    ]);
    // 첫 칸이 복사한 사람이다 — 이것이 소유 판정의 근거다.
    expect(uploads.every((path) => path.startsWith("관리자B/"))).toBe(true);
  });

  it("보안(2026-10-03): 원본 주인의 폴더 밖 위치는 내려받지 않는다", async () => {
    const row = snsSource();
    const data = row.data as { flow: { cards: Array<Record<string, unknown>> } };
    data.flow.cards = [
      { assetPath: "회원A/sns/원본/0.png", thumbPath: "회원A/sns/원본/%2e%2e/%2e%2e/회원C/sns/x/0.thumb.webp" },
      { assetPath: "회원C/sns/x/1.png" },
    ];
    sourceRow = row;
    await copyWorkToSelf("sns", "원본", "관리자B");
    expect(downloads).toEqual(["회원A/sns/원본/0.png"]);
  });

  it("작은 사본도 함께 옮긴다", async () => {
    // 빠뜨리면 복사본이 격자에서 원본을 받아, 2026-09-15 에 고친 것이 그
    // 작업에서만 되살아난다.
    sourceRow = snsSource();

    await copyWorkToSelf("sns", "원본", "관리자B");

    expect(uploads.some((path) => path.endsWith(".thumb.webp"))).toBe(true);
  });

  it("표에 적은 경로도 새 자리로 바꾼다", async () => {
    sourceRow = snsSource();

    await copyWorkToSelf("sns", "원본", "관리자B");

    const data = (updated as { data: { flow: { cards: Array<{ assetPath: string }> } } }).data;
    expect(data.flow.cards[0]!.assetPath).toBe("관리자B/sns/새작업/0.png");
  });

  it("새 작업 id 를 돌려준다", async () => {
    sourceRow = snsSource();

    expect(await copyWorkToSelf("sns", "원본", "관리자B")).toEqual({ id: "새작업" });
  });

  it("원본이 없으면 던진다", async () => {
    sourceRow = null;

    await expect(copyWorkToSelf("sns", "없는-id", "관리자B")).rejects.toThrow();
  });
});

describe("copyWorkToSelf — 포스터", () => {
  it("변형 행을 복사한 사람 것으로 다시 적는다", async () => {
    sourceRow = posterSource();
    imageRows = [posterImageRow()];

    await copyWorkToSelf("poster", "원본", "관리자B");

    const rows = insertedBy.poster_images as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      user_id: "관리자B",
      project_id: "새작업",
      asset_path: "관리자B/poster/새작업/0.png",
      thumb_path: "관리자B/poster/새작업/0.thumb.webp",
    });
  });

  it("생성 요청 행을 **복사한 사람 것으로 비용 0** 으로 만든다", async () => {
    /*
      `poster_images.generation_request_id` 는 not null 이라 채워야 하는데,
      남의 장부 줄을 가리키면 안 된다. 그래서 새로 만든다 — **비용은
      0 이다.** 복사는 AI 를 안 부르므로 돈이 안 나간다. 0 이 아닌 값을
      적으면 장부가 쓰지 않은 돈을 세게 된다.

      (전에는 이 시험이 `expect(true)` 하나뿐이라 아무것도 안 쟀다 — 2026-09-29 리뷰.)
    */
    sourceRow = posterSource();
    imageRows = [posterImageRow()];

    await copyWorkToSelf("poster", "원본", "관리자B");

    const [request] = insertedBy.poster_generation_requests as Array<Record<string, unknown>>;
    expect(request).toMatchObject({ user_id: "관리자B", cost_usd: 0, unit_cost_usd: 0 });
  });

  it("원본을 못 읽은 그림은 줄을 적지 않는다 — 깨진 그림으로 서지 않게", async () => {
    sourceRow = posterSource();
    imageRows = [
      posterImageRow(),
      {
        id: "원본그림1", generation_request_id: "원본요청1", variant_index: 1, selected: false,
        width: 1024, height: 1536, review: null,
        asset_path: "회원A/poster/원본/1.png", thumb_path: null,
      },
    ];
    missingDownloads = ["회원A/poster/원본/1.png"];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await copyWorkToSelf("poster", "원본", "관리자B");

    errors.mockRestore();
    const rows = insertedBy.poster_images as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.asset_path)).toEqual(["관리자B/poster/새작업/0.png"]);
  });

  it("변형 행이 새로 만든 요청을 가리킨다", async () => {
    sourceRow = posterSource();
    imageRows = [posterImageRow()];

    await copyWorkToSelf("poster", "원본", "관리자B");

    const [request] = insertedBy.poster_generation_requests as Array<Record<string, unknown>>;
    const rows = insertedBy.poster_images as Array<Record<string, unknown>>;

    expect(request).toBeTruthy();
    expect(request!.user_id).toBe("관리자B");
    expect(request!.cost_usd).toBe(0);
    // 남의 줄이 아니라 방금 만든 줄을 가리킨다.
    expect(rows[0]!.generation_request_id).toBe(request!.id);
    expect(rows[0]!.generation_request_id).not.toBe("원본요청1");
  });

  /*
   * **고치기·다시 만들기가 있던 작업도 복사된다**(2026-09-29 리뷰).
   *
   * 전에는 모든 줄을 새 요청 하나에 원래 번호 그대로 붙여, 번호 0 이 둘이 되며
   * `unique (generation_request_id, variant_index)` 에 걸렸다 — 작업·요청·파일은
   * 이미 만든 뒤라 빈 복사본이 남았다.
   */
  it("회차마다 요청을 따로 만든다 — 같은 번호가 한 요청에 겹치지 않는다", async () => {
    sourceRow = posterSource();
    imageRows = [
      posterImageRow(),
      {
        id: "원본고친것", generation_request_id: "원본요청2", variant_index: 0, selected: false,
        width: 1024, height: 1536, review: null,
        asset_path: "회원A/poster/원본/원본요청2/0.png", thumb_path: null,
      },
    ];
    requestRows = [
      { id: "원본요청1", parent_image_id: null, edit_instruction: null, mode: "t2i" },
      { id: "원본요청2", parent_image_id: "원본그림0", edit_instruction: "배경을 밤으로", mode: "i2i" },
    ];

    await copyWorkToSelf("poster", "원본", "관리자B");

    // **한 문장으로 넣는다** — 중간에 실패해 요청 줄 일부만 남는 일이 없다.
    expect(insertsBy.poster_generation_requests).toHaveLength(1);
    const requests = insertedBy.poster_generation_requests as Array<Record<string, unknown>>;
    expect(requests).toHaveLength(2);
    // 비용은 여전히 0 이다 — 복사는 AI 를 안 부른다.
    expect(requests.every((request) => request.cost_usd === 0 && request.user_id === "관리자B")).toBe(true);
    const rows = insertedBy.poster_images as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.generation_request_id)).toEqual([requests[0]!.id, requests[1]!.id]);
    expect(requests[0]!.id).not.toBe(requests[1]!.id);
  });

  it("고친 이력을 복사본에서도 잇는다 — 지시와 복사된 부모 그림", async () => {
    sourceRow = posterSource();
    imageRows = [
      posterImageRow(),
      {
        id: "원본고친것", generation_request_id: "원본요청2", variant_index: 0, selected: false,
        width: 1024, height: 1536, review: null,
        asset_path: "회원A/poster/원본/원본요청2/0.png", thumb_path: null,
      },
    ];
    requestRows = [
      { id: "원본요청1", parent_image_id: null, edit_instruction: null, mode: "t2i", model_id: "m1", ratio_id: "2:3", size: {} },
      {
        id: "원본요청2", parent_image_id: "원본그림0", edit_instruction: "배경을 밤으로", mode: "i2i",
        // 고치기는 비율·모델을 바꿀 수 있다 — 작업 값이 아니라 그 회차 값을 옮긴다.
        model_id: "m2", ratio_id: "9:16", size: { width: 1080, height: 1920 },
      },
    ];

    await copyWorkToSelf("poster", "원본", "관리자B");

    expect((insertedBy.poster_generation_requests as Array<Record<string, unknown>>)[1])
      .toMatchObject({ model_id: "m2", ratio_id: "9:16", size: { width: 1080, height: 1920 } });
    const requests = insertedBy.poster_generation_requests as Array<Record<string, unknown>>;
    expect(requests[1]).toMatchObject({ edit_instruction: "배경을 밤으로", mode: "i2i" });
    // 복사된 첫 그림(새그림-0)이 원본그림0 의 복사본이다 — 그것을 **고치기 요청 줄에** 단다.
    expect(updatesBy.poster_generation_requests).toEqual([{ parent_image_id: "새그림-0" }]);
    expect(eqBy.poster_generation_requests).toContainEqual(["id", requests[1]!.id]);
    // 원본 요청은 **이 작업 것만** 읽는다.
    expect(eqBy.poster_generation_requests).toContainEqual(["project_id", "원본"]);
  });
});

/**
 * **회원이 지운 작업은 복사하지 않는다**(2026-10-08). 내 사본은 6개월 파기·탈퇴 파기에 안 걸려 영영 남는다 —
 * 처리방침 제2-1조와 어긋난다(리뷰).
 */
describe("copyWorkToSelf — 회원이 지운 작업", () => {
  it("카드뉴스: 살아 있는 원본만 고른다", async () => {
    sourceRow = snsSource();
    await copyWorkToSelf("sns", "원본", "관리자B");
    expect(eqBy["sns_projects"]).toContainEqual(["is:deleted_at", null]);
  });

  it("포스터: 살아 있는 원본만 고른다", async () => {
    sourceRow = null;
    await expect(copyWorkToSelf("poster", "원본", "관리자B")).rejects.toThrow();
    expect(eqBy["poster_projects"]).toContainEqual(["is:deleted_at", null]);
  });
});
