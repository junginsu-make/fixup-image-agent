import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 광고 규격을 뽑는 길.
 *
 * **여기에 시험이 하나도 없었다.** 그래서 보안 리뷰가 잡아 준 HIGH 둘을 고쳐
 * 놓고도, 그 고침을 **지우면 시험 674개가 전부 통과**했다 — 문자열 상한을
 * 없애도, 동시 실행 게이트를 걷어내도, 인증을 통째로 빼도 조용했다.
 *
 * 다음 사람에게 남는 것이 「674개 통과」라는 문장뿐이면, 그 문장은 이 라우트의
 * 접근 통제와 자원 방어에 대해 아무것도 말하지 않는다.
 *
 * 소유권 판정 자체는 `lib/__tests__/library-image-file.test.ts` 가 덮는다.
 * 여기서 보는 것은 **라우트가 그 함수에 무엇을 넘기는지** — 배선이다.
 */

vi.mock("server-only", () => ({}));

let enabled = true;
let authOk = true;
let member = { userId: "u1", role: "member" as "member" | "admin" };
let file: { bytes: Buffer; mimeType: string } | null = { bytes: Buffer.from("x"), mimeType: "image/png" };
let busy = false;
let batchThrows: Error | null = null;

const authCalls: number[] = [];
const viewers: Array<{ userId: string; role: string }> = [];
const fileArgs: Array<{ itemId: string; position: number }> = [];
const batchArgs: Array<{ specIds: string[] }> = [];

vi.mock("../../../../lib/ad/batch", async () => {
  const real = await vi.importActual<typeof import("../../../../lib/ad/batch")>(
    "../../../../lib/ad/batch",
  );
  return {
    ...real,
    isAdExportEnabled: () => enabled,
    exportBatch: async (_master: Buffer, specIds: string[]) => {
      batchArgs.push({ specIds });
      if (batchThrows) throw batchThrows;
      return [{
        specId: specIds[0]!, label: "시험", portal: "google" as const, product: "p",
        required: true, sourceKind: "official" as const, format: "jpg" as const,
        target: { width: 10, height: 10 }, status: "ok" as const,
        failures: [], bytes: Buffer.from("bytes"), byteLength: 5, quality: 90, shrink: 1,
      }];
    },
  };
});

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => {
    authCalls.push(1);
    return authOk
      ? { ok: true as const, member: { userId: member.userId, profile: { role: member.role } } }
      : { ok: false as const, response: new Response("로그인이 필요합니다.", { status: 401 }) };
  },
}));

// 팀은 여기서 시험하는 것이 아니다. 소속 없는 사람으로 둔다 — 그러면
// 소유자 판정이 지금까지와 같게 돈다.
vi.mock("../../../../lib/teams/store", () => ({
  teamIdOf: async () => null,
}));

vi.mock("../../../../lib/server-library", () => ({
  getLibraryImageFile: async (
    viewer: { userId: string; role: string }, itemId: string, position: number,
  ) => {
    viewers.push(viewer);
    fileArgs.push({ itemId, position });
    return file;
  },
}));

vi.mock("../../../../lib/layout/render-gate", async () => {
  const real = await vi.importActual<typeof import("../../../../lib/layout/render-gate")>(
    "../../../../lib/layout/render-gate",
  );
  return {
    ...real,
    withRenderSlot: async <T,>(_userId: string, work: () => Promise<T>) => {
      if (busy) throw new real.RenderBusyError("붐빕니다.");
      return work();
    },
  };
});

const { POST } = await import("../export/route");

const call = (body: unknown) =>
  POST(new Request("http://x/api/ad/export", { method: "POST", body: JSON.stringify(body) }));

const good = { itemId: "item-1", position: 0, specIds: ["google-rda-square"] };

beforeEach(() => {
  enabled = true;
  authOk = true;
  member = { userId: "u1", role: "member" };
  file = { bytes: Buffer.from("x"), mimeType: "image/png" };
  busy = false;
  batchThrows = null;
  authCalls.length = 0;
  viewers.length = 0;
  fileArgs.length = 0;
  batchArgs.length = 0;
});

describe("들어올 수 있는 사람인가", () => {
  it("로그인 안 하면 뽑지 못한다", async () => {
    authOk = false;
    const response = await call(good);
    expect(response.status).toBe(401);
    expect(batchArgs, "인증 전에 일을 시작하면 안 된다").toEqual([]);
  });

  /**
   * **세션의 역할만 넘긴다.** 본문에 `role` 을 실어 보내 관리자 행세를 하면
   * 남의 그림을 뽑을 수 있다 — `getLibraryImageFile` 은 관리자에게 소유자
   * 조건을 걸지 않기 때문이다.
   */
  it("본문에 실린 역할을 믿지 않는다", async () => {
    const response = await call({ ...good, role: "admin" });
    expect(response.status, "모르는 필드는 스키마가 막아야 한다").toBe(400);
    expect(viewers).toEqual([]);
  });

  it("소유자 판정에 세션의 역할을 그대로 넘긴다", async () => {
    await call(good);
    // 팀은 세션에서 꺼낸다. 본문에 실려 오지 않는다 — 실려 오면 남의 팀
    // ID 를 적는 것으로 남의 그림을 뽑을 수 있다.
    expect(viewers).toEqual([{ userId: "u1", role: "member", teamId: null }]);
  });

  it("관리자면 관리자로 넘긴다 — 역할을 지어내지 않는다", async () => {
    member = { userId: "admin-1", role: "admin" };
    await call(good);
    expect(viewers).toEqual([{ userId: "admin-1", role: "admin", teamId: null }]);
  });

  it("그림이 없으면 404 다", async () => {
    file = null;
    expect((await call(good)).status).toBe(404);
  });
});

describe("기능 스위치", () => {
  it("꺼져 있으면 404 다", async () => {
    enabled = false;
    expect((await call(good)).status).toBe(404);
  });

  it("꺼져 있으면 아무 일도 시작하지 않는다", async () => {
    enabled = false;
    await call(good);
    expect(batchArgs).toEqual([]);
    expect(viewers).toEqual([]);
  });
});

describe("자원을 지킨다", () => {
  /**
   * 이 상한이 없으면 4MB 문자열 여러 개가 들어와 본문 파싱만으로 프로세스가
   * 죽는다 — sharp 는 한 번도 안 타는데. 본문 크기 상한이 어느 층에도 없어
   * 스키마가 마지막 문이다.
   */
  it("긴 itemId 를 거절한다", async () => {
    const response = await call({ ...good, itemId: "x".repeat(65) });
    expect(response.status).toBe(400);
    expect(viewers, "거절한 요청으로 창고를 읽으면 안 된다").toEqual([]);
  });

  it("긴 규격 id 를 거절한다", async () => {
    expect((await call({ ...good, specIds: ["y".repeat(65)] })).status).toBe(400);
  });

  it("규격을 너무 많이 고르면 거절한다", async () => {
    const many = Array.from({ length: 100 }, (_, i) => `s${i}`);
    expect((await call({ ...good, specIds: many })).status).toBe(400);
  });

  it("음수 위치를 거절한다", async () => {
    expect((await call({ ...good, position: -1 })).status).toBe(400);
  });

  /**
   * 이 게이트가 없으면 무거운 요청 넷이 겹쳐 libuv 스레드풀을 굶긴다 —
   * 다른 모든 요청의 파일 읽기·DNS 까지 함께 멈춘다.
   */
  it("붐비면 429 다 — 게이트를 지나간다", async () => {
    busy = true;
    const response = await call(good);
    expect(response.status).toBe(429);
    expect(batchArgs, "게이트를 못 지났으면 일을 시작하면 안 된다").toEqual([]);
  });
});

describe("제대로 뽑는다", () => {
  it("고른 것을 그대로 넘긴다", async () => {
    await call({ ...good, specIds: ["google-rda-square", "naver-gfa-thumb"] });
    expect(batchArgs).toEqual([{ specIds: ["google-rda-square", "naver-gfa-thumb"] }]);
    expect(fileArgs).toEqual([{ itemId: "item-1", position: 0 }]);
  });

  it("바이트를 data URL 로 실어 보낸다 — 미리보기와 ZIP 이 같은 것을 쓴다", async () => {
    const body = await (await call(good)).json();
    expect(body.ok).toBe(true);
    expect(body.results[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("원시 버퍼를 그대로 내보내지 않는다", async () => {
    const body = await (await call(good)).json();
    expect(body.results[0]).not.toHaveProperty("bytes");
  });
});

describe("실패를 어떻게 말하는가", () => {
  /**
   * **사용자가 고칠 수 있는 것만 문장을 준다.**
   *
   * 「규격을 하나 이상 고르세요」는 다시 눌러 고칠 수 있는 말이다. 그런데
   * sharp 동적 import 실패나 Supabase 클라이언트 생성 실패는 내부 사정이라
   * 문구를 그대로 내보내면 라이브러리 버전 단서만 샌다.
   */
  it("사용자가 고칠 수 있는 것은 그대로 말해 준다", async () => {
    batchThrows = new Error("규격을 하나 이상 고르세요.");
    const response = await call(good);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/고르세요/);
  });

  it("내부 오류는 문구를 감추고 500 이다", async () => {
    batchThrows = new Error("vips__something: internal detail at /srv/app/node_modules/...");
    const response = await call(good);
    expect(response.status, "사용자가 고칠 수 없는 것을 400 이라 하면 안 된다").toBe(500);
    const body = await response.json();
    expect(body.message).toBe("뽑지 못했습니다.");
    expect(JSON.stringify(body), "내부 문구가 새면 안 된다").not.toMatch(/vips|node_modules/);
  });
});
