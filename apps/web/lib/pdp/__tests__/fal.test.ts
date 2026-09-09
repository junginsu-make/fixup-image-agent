import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createPdpImageGenerator } = await import("../fal");

/**
 * fal 로 나가는 요청을 **값으로** 잰다.
 *
 * 이 구간에는 시험이 한 건도 없었다. 독립 리뷰가 아래 넷을 동시에 넣고 돌렸는데
 * 타입검사 0건 · 1,406건 전부 통과였다.
 *
 *   Key → Bearer            fal 인증이 전부 실패
 *   주소 뒤에 /WRONG        전 요청 404
 *   429 → 503               쿼터 초과가 안 잡힘
 *   AI_KEY_MISSING 바꿔치기 키 없음이 파싱 오류로 보고됨
 *
 * 유효한 코드끼리 바꿔치기는 tsc 가 못 잡는다. 값으로 재야 한다.
 */

const 환경 = { FAL_KEY: "fal-key" };
const 입력 = {
  prompt: "a clean product photo",
  systemPrompt: "art direction",
  aspectRatio: "3:4" as const,
  references: [],
};

type FetchArgs = [string, RequestInit?];
let calls: FetchArgs[] = [];
let onFetch: (url: string) => Response;

beforeEach(() => {
  calls = [];
  onFetch = (url) =>
    url.startsWith("https://fal.run")
      ? new Response(JSON.stringify({ images: [{ url: "https://cdn/x.png", content_type: "image/png" }] }))
      : new Response(new Uint8Array([1, 2, 3]));
  vi.stubGlobal("fetch", async (...args: FetchArgs) => {
    calls.push(args);
    return onFetch(String(args[0]));
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("어디로 어떻게 보내나", () => {
  it("fal.run 아래 모델 엔드포인트로 POST 한다", async () => {
    await createPdpImageGenerator(환경)("nano-banana", 입력);
    expect(calls[0]![0]).toBe("https://fal.run/fal-ai/nano-banana");
    expect(calls[0]![1]?.method).toBe("POST");
  });

  it("첨부가 있으면 편집 엔드포인트로 간다", async () => {
    await createPdpImageGenerator(환경)("nano-banana", {
      ...입력,
      references: [{ kind: "anchor", base64: "A", mimeType: "image/png" }],
    });
    expect(calls[0]![0]).toBe("https://fal.run/fal-ai/nano-banana/edit");
  });

  /** `Bearer` 로 바꾸면 fal 인증이 전부 실패한다. */
  it("인증 헤더는 Key 다", async () => {
    await createPdpImageGenerator(환경)("nano-banana", 입력);
    const headers = calls[0]![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Key fal-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("프롬프트가 몸통에 실린다", async () => {
    await createPdpImageGenerator(환경)("nano-banana", 입력);
    const body = JSON.parse(String(calls[0]![1]?.body)) as { prompt?: string };
    expect(body.prompt).toContain("a clean product photo");
  });

  it("그림은 받은 주소에서 내려받는다", async () => {
    const image = await createPdpImageGenerator(환경)("nano-banana", 입력);
    expect(calls[1]![0]).toBe("https://cdn/x.png");
    expect(image.mimeType).toBe("image/png");
    expect(image.base64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });
});

describe("잘못됐을 때 무엇이라고 말하나", () => {
  it("키가 없으면 키가 없다고 한다", () => {
    expect(() => createPdpImageGenerator({})).toThrow(
      expect.objectContaining({ code: "AI_KEY_MISSING" }),
    );
    expect(() => createPdpImageGenerator({ FAL_KEY: "   " })).toThrow(
      expect.objectContaining({ code: "AI_KEY_MISSING" }),
    );
  });

  /** 429 는 「몰렸다」다. 다른 실패와 섞이면 사용자에게 엉뚱한 안내가 간다. */
  it("429 는 쿼터 초과다", async () => {
    onFetch = () => new Response("rate limited", { status: 429 });
    await expect(createPdpImageGenerator(환경)("nano-banana", 입력)).rejects.toMatchObject({
      code: "AI_QUOTA_EXCEEDED",
    });
  });

  it("그 밖의 실패는 생성 실패다", async () => {
    onFetch = () => new Response("boom", { status: 500 });
    await expect(createPdpImageGenerator(환경)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("JSON 이 아니면 응답 해석 실패다", async () => {
    onFetch = () => new Response("not json");
    await expect(createPdpImageGenerator(환경)("nano-banana", 입력)).rejects.toMatchObject({
      code: "AI_RESPONSE_INVALID",
    });
  });

  it("그림 주소가 없으면 생성 실패다", async () => {
    onFetch = () => new Response(JSON.stringify({ images: [] }));
    await expect(createPdpImageGenerator(환경)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("내려받기가 실패해도 생성 실패로 말한다", async () => {
    onFetch = (url) =>
      url.startsWith("https://fal.run")
        ? new Response(JSON.stringify({ images: [{ url: "https://cdn/x.png" }] }))
        : new Response("gone", { status: 404 });
    await expect(createPdpImageGenerator(환경)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("형식을 안 알려주면 png 로 본다", async () => {
    onFetch = (url) =>
      url.startsWith("https://fal.run")
        ? new Response(JSON.stringify({ images: [{ url: "https://cdn/x.png" }] }))
        : new Response(new Uint8Array([9]));
    expect((await createPdpImageGenerator(환경)("nano-banana", 입력)).mimeType).toBe("image/png");
  });
});
