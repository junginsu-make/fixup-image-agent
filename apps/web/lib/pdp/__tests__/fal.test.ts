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
 *
 * **S3a 부터 대기열이다**(설계 2026-09-29 §3.3). 제출 `POST queue.fal.run/<엔드포인트>` → 상태
 * `GET …/requests/<id>/status` → 결과 `GET …/requests/<id>` → 그림 내려받기. 상태·결과는 공식
 * 클라이언트가 같은 전역 `fetch` 로 부르므로 여기서 한꺼번에 흉내 낸다.
 */

const 환경 = { FAL_KEY: "fal-key" };
const 입력 = {
  prompt: "a clean product photo",
  systemPrompt: "art direction",
  aspectRatio: "3:4" as const,
  references: [],
};
const 빨리 = { sleep: async () => {} };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type FetchArgs = [string, RequestInit?];
let calls: FetchArgs[] = [];
let onSubmit: () => Response;
let statuses: string[];
let onResult: () => Response;
let onDownload: () => Response;

beforeEach(() => {
  calls = [];
  onSubmit = () => json({ request_id: "req-1", status: "IN_QUEUE" });
  statuses = ["COMPLETED"];
  onResult = () => json({ images: [{ url: "https://cdn/x.png", content_type: "image/png" }] });
  onDownload = () => new Response(new Uint8Array([1, 2, 3]));
  vi.stubGlobal("fetch", async (...args: FetchArgs) => {
    const url = String(args[0]);
    calls.push([url, args[1]]);
    if (!url.startsWith("https://queue.fal.run/")) return onDownload();
    if (url.includes("/requests/req-1/status")) return json({ status: statuses.shift() ?? "COMPLETED" });
    if (url.includes("/requests/req-1/cancel")) return json({ status: "CANCELLATION_REQUESTED" }, 202);
    if (url.includes("/requests/req-1")) return onResult();
    return onSubmit();
  });
});

afterEach(() => vi.unstubAllGlobals());

const 제출 = () => calls.find(([url, init]) => url.startsWith("https://queue.fal.run/") && init?.method === "POST")!;

describe("어디로 어떻게 보내나", () => {
  it("대기열의 모델 엔드포인트로 POST 한다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    expect(제출()[0]).toBe("https://queue.fal.run/fal-ai/nano-banana");
  });

  it("첨부가 있으면 편집 엔드포인트로 간다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", {
      ...입력,
      references: [{ kind: "anchor", base64: "A", mimeType: "image/png" }],
    });
    expect(제출()[0]).toBe("https://queue.fal.run/fal-ai/nano-banana/edit");
  });

  /** `Bearer` 로 바꾸면 fal 인증이 전부 실패한다. */
  it("인증 헤더는 Key 다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    const headers = 제출()[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Key fal-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("fal 쪽 대기 상한(120초)을 함께 보낸다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    expect((제출()[1]?.headers as Record<string, string>)["x-fal-request-timeout"]).toBe("120");
  });

  it("프롬프트가 몸통에 실린다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    const body = JSON.parse(String(제출()[1]?.body)) as { prompt?: string };
    expect(body.prompt).toContain("a clean product photo");
  });

  it("끝날 때까지 상태를 묻고, 같은 키로 결과를 받는다", async () => {
    statuses = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    const statusCalls = calls.filter(([url]) => url.includes("/requests/req-1/status"));
    expect(statusCalls).toHaveLength(3);
    // 상태 주소는 엔드포인트의 앞 두 칸만 쓴다(공식 클라이언트 규칙).
    expect(statusCalls[0]![0]).toMatch(/^https:\/\/queue\.fal\.run\/fal-ai\/nano-banana\/requests\/req-1\/status/);
    const result = calls.find(([url]) => /\/requests\/req-1$/.test(url))!;
    expect(new Headers(result[1]?.headers).get("authorization")).toBe("Key fal-key");
  });

  it("그림은 받은 주소에서 내려받는다", async () => {
    const image = await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    expect(calls.at(-1)![0]).toBe("https://cdn/x.png");
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
  it("제출이 429 면 쿼터 초과다", async () => {
    onSubmit = () => new Response("rate limited", { status: 429 });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "AI_QUOTA_EXCEEDED",
    });
  });

  it("fal 이 대기 상한 안에 시작하지 못했으면(504 user) 몰린 것이다", async () => {
    onResult = () => new Response(JSON.stringify({ detail: "start timeout" }), {
      status: 504, headers: { "content-type": "application/json", "x-fal-request-timeout-type": "user" },
    });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "AI_QUOTA_EXCEEDED",
    });
  });

  it("그 밖의 제출 실패는 생성 실패다", async () => {
    onSubmit = () => new Response("boom", { status: 500 });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("결과가 거절(422)로 끝나도 생성 실패다", async () => {
    onResult = () => json({ detail: "content checker" }, 422);
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("우리 쪽 상한을 넘기면 취소를 보내고 생성 실패로 말한다", async () => {
    statuses = Array(10).fill("IN_PROGRESS");
    let clock = 0;
    const 느린 = { sleep: async () => { clock += 100_000; }, now: () => clock };
    await expect(createPdpImageGenerator(환경, undefined, 느린)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
      message: "이미지 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.",
    });
    expect(calls.some(([url, init]) => url.endsWith("/requests/req-1/cancel") && init?.method === "PUT")).toBe(true);
  });

  it("그림 주소가 없으면 생성 실패다", async () => {
    onResult = () => json({ images: [] });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("내려받기가 실패해도 생성 실패로 말한다", async () => {
    onResult = () => json({ images: [{ url: "https://cdn/x.png" }] });
    onDownload = () => new Response("gone", { status: 404 });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("형식을 안 알려주면 png 로 본다", async () => {
    onResult = () => json({ images: [{ url: "https://cdn/x.png" }] });
    onDownload = () => new Response(new Uint8Array([9]));
    expect((await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).mimeType).toBe("image/png");
  });
});
