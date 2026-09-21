import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { oversizedPng } from "../../../../lib/__tests__/fixtures/oversized-png";

/**
 * **낯선 바이트를 받는 문 하나가 잠겨 있지 않았다**(F-7-10-b).
 *
 * 설계 §14.6: 「인증 전 multipart 전체 파싱·**크기 제한 없음** | 수정 |
 * W1/W8 / T-INPUT, **T-LIMIT**」.
 *
 * 인증 순서는 이미 고쳐져 있었다(`settlement.test.ts` 가 리디자인 쪽을 잰다).
 * 그런데 **`/api/reference-images` 는 상한이 아예 없었다.**
 *
 * ```ts
 * const form = await request.formData();   // 얼마가 오든 다 읽는다
 * ...
 * bytes: new Uint8Array(await file.arrayBuffer()),
 * mimeType: file.type,                     // 딱지를 그대로 믿는다
 * ```
 *
 * 인증된 회원이 임의 크기 파일로 서버 메모리를 두 배로 부풀릴 수 있었고
 * (원본 + `Uint8Array` 사본), **16383×16383 단색 PNG 는 수백 KB 로 눌리는데
 * 펼치면 1GB 가 넘는다** — 바이트 크기로는 못 막는 쪽이다.
 *
 * 상세페이지 레퍼런스 문에는 이미 문지기가 있다(`lib/pdp/image-gate.ts`).
 * 같은 회사의 같은 위험인데 이 문만 열려 있었다.
 *
 * **되던 것은 안 깨진다.** 저장 쪽(`saveReferenceImage`)이 이미 PNG·JPG·WEBP
 * 만 받고 화면 `accept` 도 같은 셋이라, 문지기가 좁히는 것이 없다.
 */

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn() }));

vi.mock("../../../../lib/membership/api", () => ({ authenticateApiMember: mocks.auth }));
vi.mock("../../../../lib/reference-images", () => ({
  saveReferenceImage: mocks.save,
  listReferenceImages: async () => [],
  localFileUrl: (id: string) => `/local/${id}`,
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../../../lib/access/core", () => ({
  viewerFrom: () => ({}),
  hasFullScope: () => false,
}));

const { POST } = await import("../route");

const ID = "11111111-1111-4111-8111-111111111111";

const png = (width = 8, height = 8) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .png()
    .toBuffer();

const 올린다 = (bytes: Buffer, type = "image/png") => {
  const form = new FormData();
  form.append("id", ID);
  form.append("title", "본보기");
  form.append("purpose", "both");
  form.append("file", new File([Uint8Array.from(bytes)], "본보기.png", { type }));
  return POST(new Request("http://local/api/reference-images", { method: "POST", body: form }));
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    member: { userId: "u1", profile: { role: "member" } },
  });
  mocks.save.mockResolvedValue({ id: ID, title: "본보기", purpose: "both" });
});

describe("멀쩡한 그림은 그대로 통과한다", () => {
  it("**올라간다**", async () => {
    const response = await 올린다(await png());

    expect(response.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
});

describe("낯선 바이트를 막는다", () => {
  /**
   * **딱지가 아니라 바이트를 본다.** `.png` 라는 이름의 글자가 창고에
   * `image/png` 로 저장되면 브라우저가 못 여는 파일이 된다.
   */
  it("**그림이 아닌 바이트는 막는다**", async () => {
    const response = await 올린다(Buffer.from("이건 글자다"));

    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  /**
   * **바이트 크기로는 못 막는다.** 16383×16383 단색 PNG 는 수백 KB 로 눌리는데
   * 펼치면 1GB 가 넘는다.
   */
  it("**화소가 너무 많으면 막는다**", async () => {
    const response = await 올린다(oversizedPng(16383, 16383));

    expect(response.status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("**딱지가 틀렸으면 실제 종류로 저장한다**", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#456" } })
      .jpeg()
      .toBuffer();

    await 올린다(jpeg, "image/png");

    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ mimeType: "image/jpeg" });
  });

  it("**파일을 안 고르면 막는다**", async () => {
    const form = new FormData();
    form.append("id", ID);
    form.append("purpose", "both");

    const response = await POST(
      new Request("http://local/api/reference-images", { method: "POST", body: form }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("본문이 너무 크면 읽다가 끊는다", () => {
  it("**상한을 넘으면 413 이고 저장하지 않는다**", async () => {
    const { REFERENCE_UPLOAD_BODY_LIMIT } = await import("../limits");
    const 큰것 = Buffer.alloc(REFERENCE_UPLOAD_BODY_LIMIT + 1024, 1);

    /*
      **여기서는 본문을 `FormData` 로 만들지 않는다.**

      `readBoundedBody` 는 상한을 넘으면 `reader.cancel()` 로 끊는다 — 제품
      코드는 맞다. 그런데 `FormData` 로 만든 요청은 undici 가 그 뒤로도
      조각을 밀어 넣어 닫힌 흐름에 부딪히고, 처리 안 된 거부로 **시험 전체가
      실패로 끝난다**(3613건이 통과해도 그렇다). 실제 서버에서는 본문이 망
      흐름이라 이 일이 없다.

      **재는 것은 그대로다.** 라우트는 상한을 넘은 시점에 끊으므로 multipart
      해석까지 가지 않는다 — 안에 무엇이 담겼는지는 이 시험과 무관하다.
    */
    const response = await POST(
      new Request("http://local/api/reference-images", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=abc" },
        body: Uint8Array.from(큰것),
      }),
    );

    expect(response.status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  /**
   * **약속한 크기는 반드시 통과해야 한다.** 「20MB 까지 된다」고 해 놓고
   * 20MB 가 막히는 것이 그 반대보다 훨씬 나쁘다.
   */
  it("**상한이 화면이 말하는 값과 같다**", async () => {
    const { REFERENCE_UPLOAD_BODY_LIMIT } = await import("../limits");
    const { STYLE_REFERENCE_MAX_MB } = await import("../../../../lib/pdp/reference-limits");

    expect(REFERENCE_UPLOAD_BODY_LIMIT).toBeGreaterThan(STYLE_REFERENCE_MAX_MB * 1024 * 1024);
  });
});

describe("인증이 먼저다", () => {
  it("**인증 실패는 본문을 읽기 전에 돌려보낸다**", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    /*
      **여기서는 본문을 흐름으로 만들지 않는다.**

      이 시험이 재는 것이 「본문을 **안 읽는다**」라서, 끝난 뒤에도 본문이 안
      읽힌 채 남는다. `FormData` 로 만들면 undici 가 그 뒤로도 조각을 밀어
      넣다가 닫힌 흐름에 부딪혀 `ERR_INVALID_STATE` 를 던지고, 처리 안 된
      거부로 **시험 전체가 실패로 끝난다** — 3613건이 통과해도 그렇다.

      무엇이 담겼는지는 이 시험과 무관하다. 문지기가 본문을 **펴 보기 전에**
      돌려보내는지만 잰다. 실제 업로드 모양은 이 파일의 다른 시험들이 쓴다.
    */
    const request = new Request("http://local/api/reference-images", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=abc" },
      body: "본문은 펴 보지도 않는다",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
