import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { oversizedPng } from "../../../../lib/__tests__/fixtures/oversized-png";

/**
 * **레퍼런스를 올리는 문에 문지기가 없었다**(C-7 · C-10-c).
 *
 * `/api/pdp/style-references` 는 `await req.json()` 한 줄로 본문을 받았다.
 * 용량 상한도, 그림인지 보는 눈도 없다. 삭제는 빈 본문·잘못된 id 에 500 을
 * 돌려주고, 남의 것을 지우라고 해도 성공이라고 답했다.
 *
 * 설계 §12: 「Content-Length 만 신뢰하지 않는다. 수신 스트림·파일 수·MIME
 * signature·이미지 픽셀을 제한한다.」
 * 설계 §14.3(C-10-c): 「형식 오류 400, 소유권 없는 자원 404; 이미 삭제된 정상
 * ID 는 멱등 삭제 정책 명시.」
 */

vi.mock("server-only", () => ({}));

let member: { ok: boolean; member?: { userId: string }; response?: Response } = {
  ok: true,
  member: { userId: "u1" },
};

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => member,
}));

const 등록된것: Array<{ imageBase64: string; mimeType: string }> = [];
/** 표에 실제로 있는 행. `userId` 가 주인이다. */
const 있는행 = new Map<string, string>();

vi.mock("../../../../lib/user-style-references", () => ({
  registerUserStyleReference: async (input: { imageBase64: string; mimeType: string }) => {
    등록된것.push(input);
    return { ok: true as const, id: "new-id", description: "설명" };
  },
  listUserStyleReferences: async () => [],
  deleteUserStyleReference: async (userId: string, id: string) => {
    if (있는행.get(id) === userId) {
      있는행.delete(id);
      return { ok: true as const, deleted: true };
    }
    return { ok: true as const, deleted: false };
  },
  ownerOfStyleReference: async (id: string) => 있는행.get(id) ?? null,
}));

const { POST, DELETE } = await import("../style-references/route");

const 요청 = (method: string, body: unknown) =>
  new Request("http://localhost/api/pdp/style-references", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** 진짜 PNG 바이트. 딱지만 보는 문은 이것과 글자를 구분하지 못한다. */
async function png(width = 8, height = 8) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  }).png().toBuffer();
}

beforeEach(() => {
  등록된것.length = 0;
  있는행.clear();
  member = { ok: true, member: { userId: "u1" } };
});

describe("올리는 문", () => {
  it("**빈 본문은 400 이다** — 500 은 우리가 터졌다는 뜻이다", async () => {
    const response = await POST(요청("POST", ""));

    expect(response.status).toBe(400);
  });

  it("**그림이 아닌 바이트는 딱지가 image/png 여도 막는다**", async () => {
    const response = await POST(
      요청("POST", { imageBase64: Buffer.from("이건 그림이 아니다").toString("base64"), mimeType: "image/png" }),
    );

    expect(response.status).toBe(400);
    expect(등록된것).toHaveLength(0);
  });

  /**
   * **딱지는 화면이 알려 준 값이다.**
   *
   * `.png` 라는 이름의 JPEG 을 `image/png` 로 저장하면 브라우저가 못 여는
   * 파일이 된다. `lib/image-encoding.ts` 가 이미 같은 이유로 바이트를 본다.
   */
  it("**실제 바이트로 종류를 정한다**", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } })
      .jpeg().toBuffer();

    await POST(요청("POST", { imageBase64: jpeg.toString("base64"), mimeType: "image/png" }));

    expect(등록된것[0]?.mimeType).toBe("image/jpeg");
  });

  it("멀쩡한 그림은 그대로 지나간다", async () => {
    const response = await POST(요청("POST", { imageBase64: (await png()).toString("base64"), mimeType: "image/png" }));

    expect(response.status).toBe(200);
    expect(등록된것).toHaveLength(1);
  });

  /**
   * **작은 파일 한 장으로 서버를 넘어뜨릴 수 있다.**
   *
   * 16383×16383 단색 PNG 는 수백 KB 로 눌린다. 펼치면 1GB 다. 그래서 바이트
   * 크기가 아니라 **화소 수**로 막아야 한다.
   *
   * 여기서 쓰는 예산은 40MP 다 — `lib/grid-thumbnail.ts` 의 `GRID_MAX_PIXELS`
   * 와 같은 값이다. 그 사본을 만드는 것이 이 바이트가 실제로 가는 곳이다.
   * **12MP 로 막으면 안 된다**: 상세페이지 레퍼런스가 1080×15000(16.2MP)이라
   * 이 기능의 주 사용 사례가 통째로 막힌다. 아래가 그 경계다.
   */
  it("**상세페이지 레퍼런스 크기(16.2MP)는 지나간다**", async () => {
    const response = await POST(요청("POST", {
      imageBase64: oversizedPng(1080, 15000).toString("base64"),
      mimeType: "image/png",
    }));

    expect(response.status).toBe(200);
  });

  it("**40MP 를 넘으면 막는다**", async () => {
    const response = await POST(요청("POST", {
      imageBase64: oversizedPng(20000, 2100).toString("base64"),
      mimeType: "image/png",
    }));

    expect(response.status).toBe(413);
    expect(등록된것).toHaveLength(0);
  });

  it("**본문 자체가 상한을 넘으면 읽다가 끊는다**", async () => {
    const { STYLE_REFERENCE_JSON_LIMIT } = await import("../../../../lib/pdp/reference-limits");
    const 한덩이 = new Uint8Array(1024 * 1024).fill(65);
    let 보낸양 = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (보낸양 > STYLE_REFERENCE_JSON_LIMIT + 1024 * 1024) return controller.close();
        보낸양 += 한덩이.byteLength;
        controller.enqueue(한덩이);
      },
    });

    const response = await POST(
      new Request("http://localhost/api/pdp/style-references", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        // @ts-expect-error 스트림 본문에는 undici 가 이 값을 요구한다
        duplex: "half",
      }),
    );

    expect(response.status).toBe(413);
  });
});

/**
 * **지우는 문.**
 *
 * 설계가 세 가지를 갈라 달라고 했다 — 형식 오류(400), 소유권 없는 자원(404),
 * 이미 지운 정상 id(멱등).
 */
describe("지우는 문", () => {
  const 정상id = "11111111-1111-4111-8111-111111111111";
  const 남의것 = "22222222-2222-4222-8222-222222222222";

  it.each([
    ["빈 본문", ""],
    ["id 가 없다", {}],
    ["id 가 빈 글자", { id: "" }],
    ["UUID 가 아니다", { id: "그냥-글자" }],
  ])("**%s → 400**", async (_label, body) => {
    const response = await DELETE(요청("DELETE", body));

    expect(response.status).toBe(400);
  });

  it("**남의 것은 404 다** — 성공이라고 답하면 지운 줄 안다", async () => {
    있는행.set(남의것, "다른사람");

    const response = await DELETE(요청("DELETE", { id: 남의것 }));

    expect(response.status).toBe(404);
    expect(있는행.has(남의것)).toBe(true);
  });

  it("내 것은 지운다", async () => {
    있는행.set(정상id, "u1");

    const response = await DELETE(요청("DELETE", { id: 정상id }));

    expect(response.status).toBe(200);
    expect(있는행.has(정상id)).toBe(false);
  });

  /**
   * **두 번 눌러도 같은 답을 준다.**
   *
   * 없는 것과 이미 지운 것은 구분할 수 없고, 구분할 필요도 없다 — 사용자가
   * 원한 상태(그것이 없는 상태)가 이미 이루어져 있다.
   */
  it("**이미 지운 것은 멱등이다**", async () => {
    있는행.set(정상id, "u1");
    await DELETE(요청("DELETE", { id: 정상id }));

    const 두번째 = await DELETE(요청("DELETE", { id: 정상id }));

    expect(두번째.status).toBe(200);
    expect(await 두번째.json()).toMatchObject({ ok: true, deleted: false });
  });
});

/**
 * **화면이 상한을 먼저 말한다**(설계 §12 「정책 상수와 UI 에서 일치」).
 *
 * 전에는 413 을 받고 나서야 얼마까지 되는지 알았다. 두 벌로 적으면 화면만
 * 옛말을 하는 날이 오므로, 화면도 서버도 **같은 상수 하나**를 읽는다.
 */
describe("상한을 사용자에게 말한다", () => {
  it("**안내 문구가 실제 상한과 같은 수를 쓴다**", async () => {
    const limits = await import("../../../../lib/pdp/reference-limits");

    expect(limits.STYLE_REFERENCE_LIMIT_HINT).toContain(`${limits.STYLE_REFERENCE_MAX_MB}MB`);
    expect(limits.STYLE_REFERENCE_LIMIT_HINT).toContain(
      `${limits.STYLE_REFERENCE_MAX_PIXELS / 1_000_000}백만`,
    );
  });

  /**
   * **약속은 내림한 쪽으로 한다.** 실제로는 조금 더 통과하지만, 「20MB 까지
   * 된다」고 해 놓고 20MB 가 막히는 것이 그 반대보다 훨씬 나쁘다.
   */
  it("**말한 크기는 반드시 통과한다**", async () => {
    const { STYLE_REFERENCE_MAX_MB, STYLE_REFERENCE_JSON_LIMIT } =
      await import("../../../../lib/pdp/reference-limits");
    const 약속한바이트 = STYLE_REFERENCE_MAX_MB * 1024 * 1024;

    // base64 는 3바이트를 4글자로 늘린다. 그 상태로도 문을 통과해야 한다.
    expect(Math.ceil(약속한바이트 / 3) * 4).toBeLessThanOrEqual(STYLE_REFERENCE_JSON_LIMIT);
  });

  it.each([
    ["계정 화면", "app/settings/StyleReferenceManager.tsx"],
    ["기획 화면", "app/create/StyleReferenceAttach.tsx"],
  ])("**%s 이 그 문구를 건다**", (_label, relative) => {
    const source = readFileSync(new URL(`../../../../${relative}`, import.meta.url), "utf8");

    expect(source).toContain("STYLE_REFERENCE_LIMIT_HINT");
    // 수를 손으로 적어 두면 상수가 바뀐 날 화면만 옛말을 한다.
    expect(source).not.toMatch(new RegExp(String.raw`\d+MB 이하`));
  });
});
