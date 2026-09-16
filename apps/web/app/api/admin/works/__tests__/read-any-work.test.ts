import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 관리자 단건 읽기.
 *
 * 목록(`listAllWorks`)은 서비스 키로 RLS 를 우회해 전부 보여 주는데, 상세
 * 화면은 세션 클라이언트라 RLS 가 적용되고 `same_team` 에 관리자 예외가 없다
 * (`supabase/migrations/202609070003_team_rls.sql:43`). 그래서 목록에서는
 * 보이는데 눌러서는 못 여는 상태였다.
 *
 * **회원용 길에 조건을 심지 않는다.** `deleteAnyWork` 가 같은 이유로 갈라져
 * 있다 — 같은 함수에 조건을 심으면 언젠가 그 조건이 어긋나 회원이 남의 것을
 * 읽는다.
 */
vi.mock("server-only", () => ({}));

let snsRow: Record<string, unknown> | null = null;
let posterRow: Record<string, unknown> | null = null;
const queried: string[] = [];

function builderFor(table: string) {
  queried.push(table);
  const row = table === "sns_projects" ? snsRow : posterRow;
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    order: () => self,
    maybeSingle: async () => ({ data: row, error: null }),
    then: (resolve: (x: unknown) => unknown) =>
      Promise.resolve(resolve({ data: row ? [row] : [], error: null })),
  };
  return self;
}

vi.mock("../../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (table: string) => builderFor(table) }),
}));

vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));

const { readAnyWork } = await import("../store");

/** 표에 실제로 있는 칸 이름 그대로. 화면이 쓰는 이름과 다르다. */
function snsProjectRow(): Record<string, unknown> {
  return {
    id: "s1", user_id: "남의-id", candidate_id: null, title: "겨울",
    status: "done", ratio: "1:1", language: "ko", model_id: "m1",
    card_count_mode: "auto", card_count: null, tone_note: null,
    data: {
      source: {}, attachments: [], flow: { stage: "result", cards: [] },
      look: {}, userInstruction: "겨울 느낌으로",
      attachmentIntents: { "0": "따라 만들기" }, slotPlan: null,
    },
    created_at: "2026-01-01", updated_at: "2026-01-02",
  };
}

beforeEach(() => { snsRow = null; posterRow = null; queried.length = 0; });

describe("readAnyWork", () => {
  it("카드뉴스 한 건을 소유자와 무관하게 읽는다", async () => {
    snsRow = snsProjectRow();

    const work = await readAnyWork("sns", "s1");

    expect(queried).toContain("sns_projects");
    expect(work).toMatchObject({ id: "s1", title: "겨울" });
  });

  it("**화면이 쓰는 모양**으로 준다 — DB 행 그대로가 아니다", async () => {
    /*
      상세 화면은 `SnsProjectRecord`(낙타 표기)를 그린다. 행을 그대로 주면
      `userId`·`modelId` 가 `undefined` 라 화면이 빈다. 모양을 맞추는 규칙은
      `api/sns/projects/project-store.ts` 의 `record()` 하나뿐이고 여기서도
      그것을 쓴다 — 따로 적으면 칸 하나가 갈리는 날이 온다.
    */
    snsRow = snsProjectRow();

    const work = await readAnyWork("sns", "s1") as Record<string, unknown>;

    expect(work.userId).toBe("남의-id");
    expect(work.modelId).toBe("m1");
    expect(work).not.toHaveProperty("user_id");
    expect(work).not.toHaveProperty("model_id");
  });

  it("사용자가 적은 글을 떨어뜨리지 않는다", async () => {
    // 같은 자리에서 한 번 사라진 적이 있다(2026-09-08 리뷰).
    snsRow = snsProjectRow();

    const work = await readAnyWork("sns", "s1") as { data: Record<string, unknown> };

    expect(work.data.userInstruction).toBe("겨울 느낌으로");
    expect(work.data.attachmentIntents).toEqual({ "0": "따라 만들기" });
  });

  it("포스터는 다른 표를 본다", async () => {
    posterRow = { id: "p1", user_id: "남의-id", title: "가을" };

    await readAnyWork("poster", "p1");

    expect(queried).toContain("poster_projects");
    expect(queried).not.toContain("sns_projects");
  });

  it("없으면 null 이다 — 던지지 않는다", async () => {
    // 부르는 쪽이 404 로 답할 수 있어야 한다. 예외로 던지면 500 이 된다.
    expect(await readAnyWork("sns", "없는-id")).toBeNull();
  });
});
