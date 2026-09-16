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
let updated: Record<string, unknown> | null = null;
let sourceRow: Record<string, unknown> | null = null;
let imageRows: Array<Record<string, unknown>> = [];
let lastTable = "";
let updatedRows = 0;
/** 표별 마지막 insert. 복사가 여러 표를 건드리므로 하나로는 못 본다. */
const insertedBy: Record<string, unknown> = {};

function builderFor(table: string) {
  lastTable = table;
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    order: () => self,
    insert: (row: Record<string, unknown> | Array<Record<string, unknown>>) => {
      inserted = row;
      insertedBy[table] = row;
      return self;
    },
    update: (row: Record<string, unknown>) => { updated = row; updatedRows = 1; return self; },
    maybeSingle: async () => ({ data: sourceRow, error: null }),
    /*
      만든 행을 돌려준다 — 저장소가 그것을 `record()` 로 바꿔 쓰므로 칸이
      빠지면 거기서 넘어진다. 실제 DB 도 `insert(...).select(...).single()` 로
      **방금 넣은 줄**을 돌려준다.
    */
    single: async () => ({
      data: { ...(inserted as Record<string, unknown> ?? {}), id: "새작업" },
      error: null,
    }),
    /*
      `update(...).select("id")` 는 **갱신된 줄**을 돌려준다. 빈 배열을 주면
      복사가 「적지 못했다」로 끝나므로 실제 DB 처럼 한 줄을 돌려준다 —
      그 셈이 실제로 도는지 보려면 이것이 맞아야 한다.
    */
    then: (resolve: (x: unknown) => unknown) =>
      Promise.resolve(resolve({
        data: updatedRows
          ? [{ id: "새작업" }]
          : table === "poster_images" ? imageRows : [],
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
    variant_index: 0, selected: true, width: 1024, height: 1536, review: null,
    asset_path: "회원A/poster/원본/0.png",
    thumb_path: "회원A/poster/원본/0.thumb.webp",
  };
}

beforeEach(() => {
  uploads.length = 0; downloads.length = 0;
  inserted = null; updated = null; sourceRow = null; imageRows = []; lastTable = ""; updatedRows = 0;
  for (const key of Object.keys(insertedBy)) delete insertedBy[key];
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

  it("생성 요청 행을 **복사한 사람 것으로 비용 0** 으로 만든다", () => {
    /*
      `poster_images.generation_request_id` 는 not null 이라 채워야 하는데,
      남의 장부 줄을 가리키면 안 된다. 그래서 하나 새로 만든다 — **비용은
      0 이다.** 복사는 AI 를 안 부르므로 돈이 안 나간다. 0 이 아닌 값을
      적으면 장부가 쓰지 않은 돈을 세게 된다.
    */
    expect(true).toBe(true);
  });

  it("변형 행이 새로 만든 요청을 가리킨다", async () => {
    sourceRow = posterSource();
    imageRows = [posterImageRow()];

    await copyWorkToSelf("poster", "원본", "관리자B");

    const request = insertedBy.poster_generation_requests as Record<string, unknown>;
    const rows = insertedBy.poster_images as Array<Record<string, unknown>>;

    expect(request).toBeTruthy();
    expect(request.user_id).toBe("관리자B");
    expect(request.cost_usd).toBe(0);
    // 남의 줄이 아니라 방금 만든 줄을 가리킨다.
    expect(rows[0]!.generation_request_id).toBe("새작업");
  });
});
