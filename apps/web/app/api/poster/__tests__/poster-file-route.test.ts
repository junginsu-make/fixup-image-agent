import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

/**
 * 포스터 결과 한 장을 내려 주는 길.
 *
 * 여기에 시험이 하나도 없었다. 그래서 **사본 기능의 읽는 쪽 절반이 통째로
 * 무검증**이었고, 사본을 아예 안 쓰게 만들어도 목록에서 변형 번호를 무시하고
 * 늘 첫 장을 주게 만들어도 아무도 몰랐다.
 */

vi.mock("server-only", () => ({}));

let member = { userId: "u1", role: "member" as "member" | "admin" };
let byProject: Array<Record<string, unknown>> = [];
/** `byProject` 에 넘어온 선택. 파일 한 장 줄 때 장부까지 읽으면 썸네일마다 질의가 는다. */
const byProjectOptions: unknown[] = [];
let adminRow: Record<string, unknown> | null = null;
const reads: string[] = [];
let missingPaths: string[] = [];
/** 없을 때 저장소가 돌려주는 글. 서명한 주소가 섞여 올 수 있다. */
let missingMessage = "없음";

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({
    ok: true as const,
    member: { userId: member.userId, profile: { role: member.role } },
  }),
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    images: {
      byProject: async (_projectId: string, options?: unknown) => { byProjectOptions.push(options); return byProject; },
    },
  }),
}));

vi.mock("../../../../lib/local-store", () => ({
  isLocalStoreEnabled: () => false,
  localStoreRoot: () => "/tmp",
}));

vi.mock("../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      // **`maybeSingle` 이 아니라 목록으로 받는다.** 변형 번호는 회차가 둘
      // 이상이면 겹치는데, 그때 `maybeSingle` 은 다중 행 오류를 준다 —
      // 관리자에게만 모든 그림이 404 로 떨어지던 자리다.
      const self: Record<string, unknown> = {
        select: () => self,
        eq: () => self,
        order: () => self,
        limit: async () => ({ data: adminRow ? [adminRow] : [], error: null }),
      };
      return self;
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          reads.push(path);
          if (missingPaths.includes(path)) return { data: null, error: { message: missingMessage } };
          const bytes = new Uint8Array([1, 2, 3]);
          return { data: { arrayBuffer: async () => bytes.buffer }, error: null };
        },
      }),
    },
  }),
}));

const { GET } = await import("../projects/[id]/images/[index]/file/route");

const call = (url: string, index = "1") =>
  GET(new Request(url), { params: Promise.resolve({ id: "p1", index }) });

beforeEach(() => {
  member = { userId: "u1", role: "member" };
  reads.length = 0;
  missingPaths = [];
  missingMessage = "없음";
  adminRow = null;
  byProjectOptions.length = 0;
  byProject = [
    { id: "img-0", createdAt: "2026-01-01", variantIndex: 0, assetPath: "u1/poster/p1/0.png", thumbPath: "u1/poster/p1/0.thumb.webp" },
    { id: "img-1", createdAt: "2026-01-01", variantIndex: 1, assetPath: "u1/poster/p1/1.png", thumbPath: "u1/poster/p1/1.thumb.webp" },
  ];
});

describe("GET 포스터 결과 파일", () => {
  /*
   * 목록 화면은 그림마다 이 길을 한 번씩 부른다(썸네일). 고친 이력은 목록 이름표에만
   * 쓰이므로 여기서 읽으면 그림 수만큼 장부 질의가 는다(2026-09-29 리뷰).
   */
  it("파일 한 장을 줄 때는 고친 이력을 읽지 않는다", async () => {
    await call("https://x/f?size=thumb", "img-1");

    expect(byProjectOptions).toEqual([{ lineage: false }]);
  });

  it("청한 변형만 준다 — 번호를 무시하면 남의 변형이 열린다", async () => {
    await call("https://x/f", "1");

    expect(reads).toEqual(["u1/poster/p1/1.png"]);
  });

  it("size=thumb 이면 사본을 준다", async () => {
    const response = await call("https://x/f?size=thumb", "1");

    expect(reads).toEqual(["u1/poster/p1/1.thumb.webp"]);
    expect(response.headers.get("content-type")).toBe("image/webp");
  });

  it("사본을 안 청하면 원본이다", async () => {
    const response = await call("https://x/f", "1");

    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("사본 자리가 비어 있으면 원본으로 떨어진다 — 옛 결과가 안 깨진다", async () => {
    byProject = [{ id: "img-1", createdAt: "2026-01-01", variantIndex: 1, assetPath: "u1/poster/p1/1.png", thumbPath: null }];

    const response = await call("https://x/f?size=thumb", "1");

    expect(reads).toEqual(["u1/poster/p1/1.png"]);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("사본 파일만 사라져도 원본으로 떨어진다 — 목록이 비면 안 된다", async () => {
    missingPaths = ["u1/poster/p1/1.thumb.webp"];

    const response = await call("https://x/f?size=thumb", "1");

    expect(response.status).toBe(200);
    expect(reads).toEqual(["u1/poster/p1/1.thumb.webp", "u1/poster/p1/1.png"]);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  /** 서버 기록에도 서명한 주소 · 열쇠를 남기지 않는다(2026-10-07, `errorLogText`). */
  it("사본을 못 읽은 기록에 서명한 주소를 남기지 않는다", async () => {
    missingPaths = ["u1/poster/p1/1.thumb.webp"];
    missingMessage = "Object not found https://x.supabase.co/storage/v1/object/sign/library/a.webp?token=SECRET";
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => logged.mockRestore());

    await call("https://x/f?size=thumb", "1");

    expect(logged).toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(" ")).not.toContain("SECRET");
  });

  it("원본까지 못 읽으면 고정 문장이고 500 이다 — 저장소 원문은 안 보인다", async () => {
    missingPaths = ["u1/poster/p1/1.png"];
    missingMessage = 'relation "storage.objects" does not exist';

    const response = await call("https://x/f", "1");

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("이미지를 읽지 못했습니다.");
  });

  it("없는 변형은 404 다", async () => {
    const response = await call("https://x/f", "9");

    expect(response.status).toBe(404);
    expect(reads).toEqual([]);
  });

  it("관리자는 남의 것도 보되 같은 갈래를 쓴다", async () => {
    member = { userId: "admin-1", role: "admin" };
    adminRow = { asset_path: "u2/poster/p1/1.png", thumb_path: "u2/poster/p1/1.thumb.webp" };

    await call("https://x/f?size=thumb", "1");

    expect(reads).toEqual(["u2/poster/p1/1.thumb.webp"]);
  });

  /**
   * **변형 번호가 겹쳐도 제 장을 준다.**
   *
   * `variant_index` 는 그 요청 안의 배열 번호라 회차가 바뀌면 다시 0 부터다.
   * 다시 만들기나 수정을 한 번만 해도 같은 번호의 줄이 둘 이상 생긴다.
   */
  it("줄 id 로 물으면 그 장을 준다 — 번호가 겹쳐도 안 헷갈린다", async () => {
    byProject = [
      { id: "old", createdAt: "2026-01-01", variantIndex: 0, assetPath: "u1/poster/p1/req-1/0.png", thumbPath: null },
      { id: "new", createdAt: "2026-02-01", variantIndex: 0, assetPath: "u1/poster/p1/req-2/0.png", thumbPath: null },
    ];

    await call("https://x/f", "old");

    expect(reads).toEqual(["u1/poster/p1/req-1/0.png"]);
  });

  /*
   * Postgres 는 시각의 끝자리 0 을 떼고 준다 — 초에서 딱 떨어지면 소수점이 없다.
   * 글자(`localeCompare`)로 견주면 `…01+00:00` 이 `…01.5+00:00` 보다 뒤로 가서
   * **먼저 만든 장**을 줬다(2026-09-29 리뷰). 시각으로 견준다.
   */
  it("옛 번호 주소의 「가장 나중」은 시각으로 가린다 — 소수점 자리 수가 달라도", async () => {
    byProject = [
      { id: "old", createdAt: "2026-09-29T08:00:01+00:00", variantIndex: 0, assetPath: "u1/poster/p1/req-1/0.png", thumbPath: null },
      { id: "new", createdAt: "2026-09-29T08:00:01.5+00:00", variantIndex: 0, assetPath: "u1/poster/p1/req-2/0.png", thumbPath: null },
    ];

    await call("https://x/f", "0");

    expect(reads).toEqual(["u1/poster/p1/req-2/0.png"]);
  });

  it("옛 번호 주소는 가장 나중 장으로 떨어진다 — 화면이 비는 것보다 낫다", async () => {
    byProject = [
      { id: "old", createdAt: "2026-01-01", variantIndex: 0, assetPath: "u1/poster/p1/req-1/0.png", thumbPath: null },
      { id: "new", createdAt: "2026-02-01", variantIndex: 0, assetPath: "u1/poster/p1/req-2/0.png", thumbPath: null },
    ];

    await call("https://x/f", "0");

    expect(reads).toEqual(["u1/poster/p1/req-2/0.png"]);
  });
});
