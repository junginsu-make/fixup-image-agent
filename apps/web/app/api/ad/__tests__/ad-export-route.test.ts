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
const batchArgs: Array<{
  specIds: string[];
  options?: { cutout?: (master: Buffer) => Promise<Buffer>; finish?: (bytes: Buffer) => Promise<Buffer> };
}> = [];
const posterOwners: string[] = [];
const scopes: string[] = [];
/** 무엇이 먼저 일어났는가. cutout 이 slot 보다 앞이어야 한다. */
const order: string[] = [];
let cutoutThrows: Error | null = null;
let posterImages: Array<{ variantIndex: number; assetPath: string }> = [
  { variantIndex: 0, assetPath: "u1/poster/p1/0.png" },
];

vi.mock("../../../../lib/ad/batch", async () => {
  const real = await vi.importActual<typeof import("../../../../lib/ad/batch")>(
    "../../../../lib/ad/batch",
  );
  return {
    ...real,
    isAdExportEnabled: () => enabled,
    exportBatch: async (_master: Buffer, specIds: string[], options?: {
      cutout?: (master: Buffer) => Promise<Buffer>;
      finish?: (bytes: Buffer) => Promise<Buffer>;
    }) => {
      batchArgs.push({ specIds, options });
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

vi.mock("../../../../lib/ad/background", () => ({
  createBackgroundRemover: () => ({}),
  removeBackground: async () => {
    order.push("cutout");
    if (cutoutThrows) throw cutoutThrows;
    return "https://fal/cut.png";
  },
}));

vi.mock("../../../../lib/poster/providers", () => ({
  createPosterFalClients: () => ({ uploader: { uploadReference: async () => "https://fal/up.png" } }),
}));

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => {
    authCalls.push(1);
    return authOk
      ? { ok: true as const, member: { userId: member.userId, profile: { role: member.role } } }
      : { ok: false as const, response: new Response("로그인이 필요합니다.", { status: 401 }) };
  },
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: (userId: string) => {
    posterOwners.push(userId);
    return { images: { byProject: async () => posterImages } };
  },
}));

vi.mock("../../../../lib/poster/asset-bytes", () => ({
  posterImageBytes: async () => ({ bytes: Buffer.from("poster"), contentType: "image/png" }),
}));

vi.mock("../../../../lib/server-library", () => ({
  getLibraryImageFile: async (
    viewer: { userId: string; role: string }, itemId: string, position: number,
    action?: string,
  ) => {
    viewers.push(viewer);
    scopes.push(action ?? "read");
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
      order.push("slot");
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
  posterOwners.length = 0;
  scopes.length = 0;
  order.length = 0;
  cutoutThrows = null;
  posterImages = [{ variantIndex: 0, assetPath: "u1/poster/p1/0.png" }];
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
    expect(viewers).toEqual([{ userId: "u1", role: "member" }]);
  });

  it("관리자면 관리자로 넘긴다 — 역할을 지어내지 않는다", async () => {
    member = { userId: "admin-1", role: "admin" };
    await call(good);
    expect(viewers).toEqual([{ userId: "admin-1", role: "admin" }]);
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
    expect(batchArgs.map((call) => call.specIds)).toEqual([["google-rda-square", "naver-gfa-thumb"]]);
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

/**
 * 포스터 작업에서 뽑기 (설계 §10 3-e).
 *
 * **2단계와 3단계가 이어져 있지 않았다.** 3단계는 `poster_images` 에 만들고
 * 2단계는 `library_images` 를 읽어서, 광고 모드로 마스터를 만들고 `/ad` 에 가면
 * **고를 그림이 하나도 없었다.** 로컬에서 실제로 켜 보고 알았다 — 리뷰 넷이
 * 전부 못 봤다. 양쪽이 각각은 맞았기 때문이다.
 */
describe("포스터 작업에서 뽑는다", () => {
  const posterCall = { itemId: "p1", position: 0, specIds: ["google-rda-square"], source: "poster" as const };

  it("포스터 그림을 읽어 뽑는다", async () => {
    const response = await call(posterCall);
    expect(response.status).toBe(200);
    expect(batchArgs.map((call) => call.specIds)).toEqual([["google-rda-square"]]);
  });

  /**
   * **소유권을 넓히지 않는다.** `images/[index]/file` 은 관리자에게 조건을
   * 빼 주는데(첫 화면에 걸 것을 고르려고), 내보내기에는 그 필요가 없다 —
   * 넓히면 관리자가 **남의 그림으로 광고를 뽑는다.**
   */
  it("자기 작업만 읽는다 — 관리자도 마찬가지다", async () => {
    member = { userId: "admin-1", role: "admin" };
    await call(posterCall);
    expect(posterOwners, "세션의 userId 로만 조회해야 한다").toEqual(["admin-1"]);
  });

  it("없는 작업이면 404 다", async () => {
    posterImages = [];
    expect((await call(posterCall)).status).toBe(404);
  });

  it("없는 변형 번호면 404 다", async () => {
    expect((await call({ ...posterCall, position: 7 })).status).toBe(404);
  });

  /** 안 보내면 지금까지처럼 라이브러리를 읽는다 — 2단계 사용자가 안 깨진다. */
  it("source 를 안 보내면 라이브러리를 읽는다", async () => {
    await call(good);
    expect(viewers).toHaveLength(1);
    expect(posterOwners).toEqual([]);
  });

  it("모르는 source 는 거절한다", async () => {
    expect((await call({ ...good, source: "어디선가" })).status).toBe(400);
  });
});

/**
 * 관리자가 남의 그림으로 광고를 뽑지 못한다 (설계 §10 3-e).
 *
 * **「보기」와 「가공해 내보내기」는 무게가 다르다.** `libraryScope` 가
 * 관리자에게 전체를 여는 근거는 「잘못 올라온 것을 치울 방법이 없다」인데,
 * 그것은 보고 지우는 일이다. ZIP 은 서비스 밖으로 나가고 누구 것인지 안 적힌다.
 */
describe("내보내기는 자기 것만", () => {
  it("라이브러리 조회에 export 범위를 쓴다", async () => {
    member = { userId: "admin-1", role: "admin" };
    await call(good);
    expect(scopes, "read 를 쓰면 관리자에게 전체가 열린다").toEqual(["export"]);
  });

  /** 역할은 그대로 넘긴다 — 지어내지 않는다. 가르는 것은 액션이다. */
  it("역할을 위조해 넘기지 않는다", async () => {
    member = { userId: "admin-1", role: "admin" };
    await call(good);
    expect(viewers).toEqual([{ userId: "admin-1", role: "admin" }]);
  });
});

/**
 * 배경 제거는 CPU 자리 **밖**에서 한다 (설계 §9.2).
 *
 * `withRenderSlot` 은 「스레드풀이 넷이라」 만든 **CPU** 게이트다. 그런데 배경
 * 제거는 fal 이 일하는 4초 동안 **우리 CPU 를 안 쓴다** — 그 4초를 자리 안에서
 * 기다리면 카드뉴스 미리보기가 이유 없이 429 를 받는다.
 */
describe("배경 제거와 CPU 자리", () => {
  it("자리를 잡기 전에 배경을 지운다", async () => {
    await call({ ...good, specIds: ["kakao-bizboard"] });
    expect(order, "cutout 이 slot 보다 앞이어야 한다").toEqual(["cutout", "slot"]);
  });

  /** 조립이 없으면 부를 이유가 없다 — 돈과 4초를 헛되이 쓴다. */
  it("파생 규격만 고르면 배경을 안 지운다", async () => {
    await call({ ...good, specIds: ["google-rda-square"] });
    expect(order).toEqual(["slot"]);
  });

  it("하나라도 조립이면 지운다", async () => {
    await call({ ...good, specIds: ["google-rda-square", "naver-smartchannel"] });
    expect(order).toEqual(["cutout", "slot"]);
  });

  /**
   * **배경 제거가 실패해도 자리를 잡고 나머지를 뽑는다.** 조립 규격만 실패로
   * 두면 되는데, 여기서 통째로 던지면 **파생 규격까지 못 받는다**(설계 §9.3).
   */
  it("배경 제거가 실패해도 나머지는 뽑는다", async () => {
    cutoutThrows = new Error("fal 이 응답하지 않습니다.");
    const response = await call({ ...good, specIds: ["google-rda-square", "kakao-bizboard"] });
    expect(response.status).toBe(200);
    expect(order).toContain("slot");
  });
});

describe("지워 둔 오브젝트를 실제로 넘긴다", () => {
  /**
   * **이 줄을 지워도 저장소 전체 시험이 초록이었다.** 그 상태의 운영 결과는
   * 필수 규격 둘이 「투명 배경을 만들 준비가 안 됐습니다」로 전부 실패 —
   * **4단계 기능이 통째로 죽은 채 CI 가 초록이다.**
   *
   * 순서(cutout → slot)는 잠겨 있었는데 **전달**이 안 잠겨 있었다. 판단을 잘
   * 뽑아 놓고 그것을 부르는 줄을 안 잠그는 일이 이 프로젝트에서 **다섯 번**
   * 반복됐다.
   */
  it("조립 규격을 고르면 오브젝트를 넘긴다", async () => {
    globalThis.fetch = (async () => new Response(Buffer.from("cut"))) as never;
    await call({ ...good, specIds: ["kakao-bizboard"] });
    const passed = batchArgs[0]!.options?.cutout;
    expect(passed, "cutout 을 안 넘기면 조립 규격이 전부 실패한다").toBeDefined();
    const bytes = await passed!(Buffer.from("master"));
    expect(bytes.toString(), "지워 둔 바이트가 그대로 와야 한다").toBe("cut");
  });

  /** 파생만 고르면 안 넘긴다 — 넘기면 batch 가 헛되이 부를 수 있다. */
  it("파생 규격만 고르면 안 넘긴다", async () => {
    await call({ ...good, specIds: ["google-rda-square"] });
    expect(batchArgs[0]!.options?.cutout).toBeUndefined();
  });

  /**
   * 실패했으면 사유를 들고 있다가 그 규격만 실패로 남긴다.
   *
   * **문구는 걸러진다** — fal 내부 오류는 그대로 안 보인다(아래 「배경 제거
   * 실패를 어떻게 말하는가」). 여기서 보는 것은 **실패가 전달되는가**다.
   */
  it("배경 제거가 실패하면 그 사유를 넘긴다", async () => {
    cutoutThrows = new Error("fal 이 응답하지 않습니다.");
    await call({ ...good, specIds: ["kakao-bizboard"] });
    const passed = batchArgs[0]!.options?.cutout;
    expect(passed).toBeDefined();
    await expect(passed!(Buffer.from("m"))).rejects.toThrow();
  });
});

describe("배경 제거 실패를 어떻게 말하는가", () => {
  /**
   * **내부 사정을 사용자 화면에 쓰지 않는다.** `createPosterFalClients()` 가
   * 던지는 말은 「다음 환경변수가 없어…: FAL_KEY」다 — 그대로 쓰면 사용자가
   * 그것을 본다. 이 라우트의 꼬리 catch 가 이미 같은 정책을 적어 두었다.
   */
  it("환경변수 이름을 사용자에게 안 보인다", async () => {
    cutoutThrows = new Error("다음 환경변수가 없어 포스터를 만들 수 없습니다: FAL_KEY");
    globalThis.fetch = (async () => new Response(Buffer.from("x"))) as never;
    await call({ ...good, specIds: ["kakao-bizboard"] });
    const passed = batchArgs[0]!.options?.cutout;
    await expect(passed!(Buffer.from("m"))).rejects.toThrow(/배경을 지우지 못했습니다/);
    await expect(passed!(Buffer.from("m"))).rejects.not.toThrow(/FAL_KEY/);
  });

  /** 사용자가 고칠 수 있는 말은 그대로 준다 — 다시 누르면 되는 것들이다. */
  it("시한 초과는 그대로 말해 준다", async () => {
    cutoutThrows = new Error("배경을 지우는 데 너무 오래 걸립니다(60초).");
    globalThis.fetch = (async () => new Response(Buffer.from("x"))) as never;
    await call({ ...good, specIds: ["kakao-bizboard"] });
    const passed = batchArgs[0]!.options?.cutout;
    await expect(passed!(Buffer.from("m"))).rejects.toThrow(/오래 걸립니다/);
  });
});
