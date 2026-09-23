import { beforeEach, describe, expect, it, vi } from "vitest";
import { referencePng } from "../../../../lib/__tests__/fixtures/reference-png";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), reserve: vi.fn(), finalize: vi.fn(), settle: vi.fn(), generate: vi.fn(), edit: vi.fn(), makeGenerator: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({ authenticateApiMember: mocks.auth, reserveAiUsage: mocks.reserve,
  finalizeAiUsage: mocks.finalize, settleAiUsage: mocks.settle }));
vi.mock("../../../../lib/server-keys", () => ({ resolveOpenaiKey: () => "test", resolveGoogleKey: () => "test" }));
vi.mock("../../../../lib/redesign/image-generator", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/redesign/image-generator")>("../../../../lib/redesign/image-generator");
  return {
    ...actual,
    createRedesignImageGenerator: (...args: unknown[]) => {
      mocks.makeGenerator(...args);
      return async () => ({ buffer: Buffer.from("IMG"), mimeType: "image/png" });
    },
  };
});
vi.mock("../../../../lib/characters", () => ({ loadCharacterView: async () => null }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("@fixup/redesign-core", async () => ({ ...(await vi.importActual("@fixup/redesign-core")), generateSections: mocks.generate, editSection: mocks.edit }));
const { POST: generate } = await import("../generate/route");
/** 진짜 PNG 바이트. 라우트 문지기가 딱지가 아니라 바이트를 본다(F-7-1). */
const 진짜png = await referencePng();
const 원본 = () => new File([Uint8Array.from(진짜png)], "p.png", { type: "image/png" });
const { POST: edit } = await import("../edit-section/route");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, member: { userId: "u1" } });
  mocks.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "r1" });
  mocks.finalize.mockRejectedValue(new Error("settlement down"));
  mocks.settle.mockResolvedValue(undefined);
  mocks.generate.mockResolvedValue({ project: { sections: [{ imageUrl: "result" }] } });
  mocks.edit.mockResolvedValue({ imageUrl: "edited" });
});
describe("T-SETTLE: 리디자인 생성과 수정", () => {
  it("정산 실패가 생성 결과를 버리지 않는다", async () => {
    const form = new FormData(); form.append("files", 원본());
    const response = await generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));
    expect(response.status).toBe(200); expect((await response.json()).project.sections).toHaveLength(1);
    expect(mocks.settle).toHaveBeenCalledTimes(1); expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it("정산 실패가 수정 결과를 버리지 않는다", async () => {
    const response = await edit(new Request("http://local/api/redesign/edit", { method: "POST", body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게" }) }));
    expect(response.status).toBe(200); expect((await response.json()).imageUrl).toBe("edited");
    expect(mocks.settle).toHaveBeenCalledTimes(1);
  });
  it("인증 실패는 multipart 파싱 전에 반환한다", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const req = new Request("http://local/api/redesign/generate", { method: "POST", body: "invalid" });
    expect((await generate(req)).status).toBe(401); expect(req.bodyUsed).toBe(false);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("수정 본문이 잘못되면 예약하지 않는다", async () => {
    const response = await edit(new Request("http://local/api/redesign/edit", { method: "POST", body: "null" }));
    expect(response.status).toBe(400); expect(mocks.reserve).not.toHaveBeenCalled();
  });
});

/**
 * **예약과 차감이 같은 계산기에서 나와야 한다.**
 *
 * 2026-09-17 리뷰(F-7-5·F-7-6): 섹션 수정이 `imageCreditUnits`(4장)로 예약하고
 * 확정은 손으로 적은 1장을 넘겼다. 사용량은 1장 줄고 장부에는 4장이 남는다.
 */
describe("T-COST: 리디자인 섹션 수정", () => {
  it("예약한 장수와 차감한 장수가 같다", async () => {
    const response = await edit(
      new Request("http://local/api/redesign/edit", {
        method: "POST",
        body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게" }),
      }),
    );

    expect(response.status).toBe(200);
    const 예약한장 = mocks.reserve.mock.calls[0]![2] as number;
    const 차감한장 = mocks.settle.mock.calls[0]![2] as number;
    expect(차감한장).toBe(예약한장);
    expect(예약한장).toBeGreaterThan(1);
  });

  it("고친 그림도 새로 만든 그림과 같은 품질로 그린다", async () => {
    await edit(
      new Request("http://local/api/redesign/edit", {
        method: "POST",
        body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게" }),
      }),
    );

    // 값은 gpt-image-2.5 `max` 기준으로 받는다. 실제로 저품질로 그리면
    // 사용자는 비싼 값을 내고 뭉개진 글자를 받는다.
    const 넘긴인자 = mocks.edit.mock.calls[0]![0] as { generateImage?: unknown };
    expect(넘긴인자.generateImage).toBeTypeOf("function");
  });
});

/**
 * **고른 모델로 그리고, 그린 모델로 값을 매긴다.**
 *
 * 2026-09-17 리뷰(F-7-4): fal 통로가 붙은 뒤로 「속도형」을 골라도 늘
 * `gpt-image-2.5-flare` 가 그렸다. 선택은 **값에만** 쓰였다 — 사용자는 고른 적
 * 없는 모델의 그림을 받고, 회사는 실제 원가와 다른 값을 받았다.
 */
describe("T-COST: 리디자인 모델 선택", () => {
  const 폼 = (model: string) => {
    const form = new FormData();
    form.append("files", 원본());
    form.append("model", model);
    return new Request("http://local/api/redesign/generate", { method: "POST", body: form });
  };

  it("속도형을 고르면 그 계열 모델로 그린다", async () => {
    await generate(폼("google"));
    await generate(폼("openai"));

    const 속도형 = mocks.makeGenerator.mock.calls[0]!.at(-1);
    const 정밀형 = mocks.makeGenerator.mock.calls[1]!.at(-1);
    expect(속도형).toMatch(/nano-banana/);
    expect(정밀형).toMatch(/gpt-image/);
  });

  it.each(["google", "openai"])("%s: 예약과 차감이 같은 모델 단가에서 나온다", async (선택) => {
    await generate(폼(선택));

    const 예약한장 = mocks.reserve.mock.calls[0]![2] as number;
    const 차감한장 = mocks.settle.mock.calls[0]![2] as number;
    expect(차감한장).toBe(예약한장);
  });

  it("실패해도 이미 나간 글값은 장부에 남긴다", async () => {
    mocks.generate.mockRejectedValue(new Error("fal down"));

    await generate(폼("openai"));

    const 기록 = mocks.settle.mock.calls[0]!.at(-1);
    expect(기록).toMatchObject({ billableImages: 0 });
    expect(기록).toHaveProperty("llmUsd");
  });

  it("장부에는 실제로 그린 모델을 남긴다", async () => {
    await generate(폼("google"));

    const 기록 = mocks.settle.mock.calls[0]!.at(-1) as { model: string };
    expect(기록.model).toMatch(/nano-banana/);
  });
});

/**
 * **리디자인 라우트 시험 공백을 메운다**(X-04).
 *
 * 설계 §14.6: 「redesign route 시험 공백 | **인증·본문·모델·정산·부분 실패
 * 동작 시험**」. 다섯 축 중 고치는 길의 **인증**과 생성의 **부분 실패**가
 * 비어 있었다(2026-09-21 조사).
 */
describe("고치는 길도 인증이 먼저다", () => {
  it("**로그인 안 했으면 본문을 안 읽는다**", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const request = new Request("http://local/api/redesign/edit", {
      method: "POST",
      body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게" }),
    });

    const response = await edit(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed, "본문을 읽었다").toBe(false);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("**로그인 안 했으면 고치지도 않는다**", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });

    await edit(
      new Request("http://local/api/redesign/edit", {
        method: "POST",
        body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게" }),
      }),
    );

    expect(mocks.edit).not.toHaveBeenCalled();
  });
});

/**
 * **일부만 만들어졌으면 만든 만큼만 받는다.**
 *
 * 전량 실패(`sections: []`)는 이미 잰다(`chunked-billing.test.ts`). 그 사이 —
 * **셋을 시켰는데 둘만 나온 경우**는 아무도 안 봤다. 여기서 값이 틀리면
 * 사용자는 못 받은 장까지 낸다.
 */
describe("부분 성공은 만든 만큼만 받는다", () => {
  const 여러장 = async (요청장수: number, 만든장수: number) => {
    mocks.generate.mockResolvedValue({
      project: { sections: Array.from({ length: 만든장수 }, (_, i) => ({ imageUrl: `img-${i}` })) },
    });
    const form = new FormData();
    form.append("files", 원본());
    form.append("count", String(요청장수));
    return generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));
  };

  it("**셋을 시켜 둘이 나오면 둘 값이다**", async () => {
    const { imageCreditUnits } = await import("../../../../lib/credit-cost");

    await 여러장(3, 2);

    expect(mocks.settle.mock.calls[0]![2]).toBe(imageCreditUnits("gpt-image-2.5-flare", 2));
  });

  it("**셋을 시켜 둘이 나와도 성공으로 닫는다** — 만든 것이 있다", async () => {
    await 여러장(3, 2);

    expect(mocks.settle.mock.calls[0]![1]).toBe(true);
  });

  it("**시킨 것보다 많이 나와도 시킨 만큼만 받는다**", async () => {
    const { imageCreditUnits } = await import("../../../../lib/credit-cost");

    await 여러장(2, 5);

    expect(mocks.settle.mock.calls[0]![2]).toBe(imageCreditUnits("gpt-image-2.5-flare", 2));
  });

  it("**한 장도 못 만들면 그 까닭을 장부에 적는다**", async () => {
    await 여러장(3, 0);

    expect(mocks.settle.mock.calls[0]![1]).toBe(false);
    expect(mocks.settle.mock.calls[0]![3]).toBe("no_image_generated");
  });
});


/**
 * **「1080×1920」을 고르면 정말 1080×1920 이 나온다**(2026-09-23 사용자 결정).
 *
 * 전에는 「9:16」과 같은 1152×2048 이 나왔다. 모델이 크기를 정확히 안 지키므로
 * 라우트가 다 만든 그림을 맞춘다. 고친 그림도 작업의 크기를 지킨다.
 */
describe("정확한 출력 크기", () => {
  const sharpLib = async () => (await import("sharp")).default;
  const 그림 = async (width: number, height: number) => {
    const sharp = await sharpLib();
    const buffer = await sharp({ create: { width, height, channels: 3, background: "#c96" } }).png().toBuffer();
    return `data:image/png;base64,${buffer.toString("base64")}`;
  };
  const 크기 = async (dataUrl: string) => {
    const sharp = await sharpLib();
    const meta = await sharp(Buffer.from(dataUrl.split(",")[1]!, "base64")).metadata();
    return `${meta.width}x${meta.height}`;
  };
  const 생성 = async (ratio: string) => {
    mocks.generate.mockResolvedValue({ project: { sections: [{ imageUrl: await 그림(1152, 2048) }] } });
    const form = new FormData();
    form.append("files", 원본());
    form.append("ratio", ratio);
    const response = await generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));
    const json = await response.json();
    if (!json.project) throw new Error(`route said ${response.status}: ${JSON.stringify(json)}`);
    return json.project.sections[0].imageUrl as string;
  };

  it("**생성: 1080×1920 을 고르면 1080×1920 이다**", async () => {
    expect(await 크기(await 생성("1080×1920"))).toBe("1080x1920");
  });

  it("생성: 9:16 은 모델이 그린 그대로다", async () => {
    expect(await 크기(await 생성("9:16"))).toBe("1152x2048");
  });

  it("**수정: 1080×1920 작업의 고친 그림도 1080×1920 이다**", async () => {
    mocks.edit.mockResolvedValue({ imageUrl: await 그림(1152, 2048) });
    const response = await edit(new Request("http://local/api/redesign/edit", {
      method: "POST",
      body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게", project: { ratio: "1080×1920" } }),
    }));
    expect(await 크기((await response.json()).imageUrl)).toBe("1080x1920");
  });
});
