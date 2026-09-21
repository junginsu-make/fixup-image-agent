import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { oversizedPng } from "../../../../lib/__tests__/fixtures/oversized-png";
import { referencePng } from "../../../../lib/__tests__/fixtures/reference-png";

/**
 * **두 코어가 참조 규칙을 따로 쓴다**(F-7-1).
 *
 * 설계 §14.6: 「별도 코어의 **참조**·검수·예산·근거 규칙 불일치 | **공통
 * 실행/검수 계약 공유**, 도메인 전체 병합은 하지 않음 | W3/W5/W8」.
 * 설계 §12: 「Content-Length 만 신뢰하지 않는다. 수신 스트림·파일 수·**MIME
 * signature·이미지 픽셀**을 제한한다.」
 *
 * 상세페이지는 낯선 바이트를 받는 문에 문지기를 세웠다
 * (`lib/pdp/image-gate.ts`) — 바이트를 보고 종류를 정하고, 화소가 너무 많으면
 * 막는다.
 *
 * **리디자인에는 그 문지기가 없었다.** `prepareReferenceImages` 가
 * `file.type || guessMimeType(이름)` 으로 **딱지를 믿는다**(`generate.ts`).
 * 그래서
 *
 *   · `.png` 라는 이름의 글자 몇 개가 참조로 모델에 간다
 *   · 16383×16383 단색 PNG(수백 KB)가 통과한다 — 펼치면 1GB 가 넘는다
 *
 * 같은 회사의 같은 위험인데 한쪽 문만 잠겨 있었다. **문지기를 공유한다** —
 * 도메인을 합치는 것이 아니라 계약을 함께 쓴다.
 */

const mocks = vi.hoisted(() => ({ auth: vi.fn(), reserve: vi.fn(), settle: vi.fn(), generate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: mocks.auth, reserveAiUsage: mocks.reserve,
  finalizeAiUsage: vi.fn(), settleAiUsage: mocks.settle,
}));
vi.mock("../../../../lib/server-keys", () => ({ resolveOpenaiKey: () => "test", resolveGoogleKey: () => "test" }));
vi.mock("../../../../lib/redesign/image-generator", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/redesign/image-generator")>(
    "../../../../lib/redesign/image-generator",
  );
  return { ...actual, createRedesignImageGenerator: () => async () => ({ buffer: Buffer.from("IMG"), mimeType: "image/png" }) };
});
vi.mock("../../../../lib/characters", () => ({ loadCharacterView: async () => null }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("@fixup/redesign-core", async () => ({
  ...(await vi.importActual("@fixup/redesign-core")), generateSections: mocks.generate,
}));

const { POST: generate } = await import("../generate/route");

const png = referencePng;

const 올린다 = async (files: Array<{ name: string; type: string; bytes: Buffer }>) => {
  const form = new FormData();
  for (const file of files) {
    form.append("files", new File([Uint8Array.from(file.bytes)], file.name, { type: file.type }));
  }
  form.append("count", "1");
  return generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, member: { userId: "u1" } });
  mocks.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "r1" });
  mocks.settle.mockResolvedValue(undefined);
  mocks.generate.mockResolvedValue({ project: { sections: [{ imageUrl: "result" }] } });
});

describe("리디자인도 같은 문지기를 쓴다", () => {
  it("**멀쩡한 그림은 그대로 통과한다**", async () => {
    const response = await 올린다([{ name: "원본.png", type: "image/png", bytes: await png() }]);

    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  /**
   * **딱지가 아니라 바이트를 본다.** `.png` 라는 이름의 글자가 참조로 모델에
   * 가면, 값은 그대로 나가고 결과만 엉뚱하다.
   */
  it("**그림이 아닌 바이트는 막는다**", async () => {
    const response = await 올린다([
      { name: "원본.png", type: "image/png", bytes: Buffer.from("이건 글자다") },
    ]);

    expect(response.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  /**
   * **작은 파일 한 장으로 서버를 넘어뜨릴 수 있다.** 16383×16383 단색 PNG 는
   * 수백 KB 로 눌리는데 펼치면 1GB 가 넘는다.
   */
  it("**화소가 너무 많으면 막는다**", async () => {
    const response = await 올린다([
      { name: "원본.png", type: "image/png", bytes: oversizedPng(16383, 16383) },
    ]);

    expect(response.status).toBe(413);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  /**
   * **문지기에서 끝나면 예약도 안 한다**(C-9 와 같은 판단). 값싼 실패로
   * 한도를 태우면 안 된다.
   */
  it("**막힌 요청은 한 칸도 안 먹는다**", async () => {
    await 올린다([{ name: "원본.png", type: "image/png", bytes: Buffer.from("글자") }]);

    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  /**
   * **한 장이라도 나쁘면 막는다.** 남은 것으로 조용히 진행하면 사용자는
   * 자기가 올린 것 중 하나가 빠진 줄 모른 채 값을 낸다.
   */
  it("**여러 장 중 하나만 나빠도 막는다**", async () => {
    const response = await 올린다([
      { name: "좋은것.png", type: "image/png", bytes: await png() },
      { name: "나쁜것.png", type: "image/png", bytes: Buffer.from("글자") },
    ]);

    expect(response.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  /**
   * **바이트로 정한 종류를 코어에 넘긴다.** 딱지가 틀렸으면 고쳐서 넘겨야
   * 모델이 받는 `data:` 앞머리가 실제와 맞는다.
   */
  it("**딱지가 틀렸으면 실제 종류로 고쳐 넘긴다**", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#456" } })
      .jpeg().toBuffer();

    await 올린다([{ name: "원본.png", type: "image/png", bytes: jpeg }]);

    const 넘긴것 = mocks.generate.mock.calls[0]![0] as { files: Array<{ type: string }> };
    expect(넘긴것.files[0]!.type).toBe("image/jpeg");
  });
});
