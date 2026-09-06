import { describe, expect, it } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { AD_SPECS } from "../ad/specs";
import { exportBatch, isAdExportEnabled, MAX_SPECS_PER_REQUEST } from "../ad/batch";

/**
 * 그림 한 장에서 고른 규격들을 **한 번에** 뽑는다.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §5.2·§10 2단계
 *
 * **파생을 두 번 돌리지 않는 것이 이 모듈의 존재 이유다.** 미리보기와 내려받기가
 * 따로 뽑으면 요청당 sharp 인코드가 70~90회에서 140~180회가 된다.
 */

/** 압축이 아주 잘 되는 그림. 용량 **하한**에 걸리게 할 때 쓴다. */
async function flat(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 60, b: 120 } } })
    .png().toBuffer();
}

async function busy(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = (i * 2654435761) % 256;
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const ok = (results: Awaited<ReturnType<typeof exportBatch>>) =>
  results.filter((entry) => entry.status === "ok");

describe("한 번에 여러 규격을 뽑는다", () => {
  it("고른 규격마다 결과가 하나씩 나온다", async () => {
    const master = await busy(1200, 1200);
    const ids = ["google-rda-square", "naver-gfa-thumb", "naver-powerlink"];
    const results = await exportBatch(master, ids);
    expect(results.map((entry) => entry.specId)).toEqual(ids);
  });

  it("만들어진 바이트가 규격 검증을 통과한다", async () => {
    const results = await exportBatch(await busy(1200, 1200), ["google-rda-square"]);
    expect(results[0]!.status).toBe("ok");
    expect(results[0]!.failures).toEqual([]);
  });

  it("픽셀이 목표와 정확히 같다", async () => {
    const results = await exportBatch(await busy(1200, 1200), ["naver-powerlink"]);
    const bytes = results[0]!.bytes!;
    const meta = await sharp(bytes).metadata();
    expect([meta.width, meta.height]).toEqual([214, 214]);
  });

  /**
   * **못 만든 것 때문에 만든 것까지 잃지 않는다.** 규격 하나가 실패하면 그것만
   * 빼고 나머지를 준다 — 다만 무엇이 왜 빠졌는지 함께 준다(설계 §5.1).
   */
  it("하나가 실패해도 나머지는 나온다", async () => {
    const results = await exportBatch(await busy(1200, 1200), [
      "google-rda-square", "kakao-bizboard", "naver-gfa-thumb",
    ]);
    expect(ok(results).map((entry) => entry.specId)).toEqual(["google-rda-square", "naver-gfa-thumb"]);
    const failed = results.find((entry) => entry.specId === "kakao-bizboard")!;
    expect(failed.status).toBe("failed");
    expect(failed.reason).toBeTruthy();
  });

  /**
   * **뽑기 실패와 검증 실패는 다르게 다룬다.**
   *
   * 뽑지 못했으면 줄 바이트가 없다. 그런데 **뽑았는데 검증에 걸린 것**은 바이트를
   * 함께 준다 — 무엇이 왜 걸렸는지 사람이 그림을 보고 판단해야 한다(설계 §5.2).
   * 「검증 실패」만 던지고 그림을 감추면 판단할 수가 없다.
   */
  it("뽑았지만 검증에 걸리면 실패로 알리되 그림은 준다", async () => {
    // 단색에 가까운 그림은 네이버 메인의 용량 **하한**(50KB)에 걸린다.
    const results = await exportBatch(await flat(1600, 800), ["naver-gfa-main"]);
    expect(results[0]!.status).toBe("failed");
    expect(results[0]!.failures.join()).toMatch(/모자랍니다/);
    expect(results[0]!.bytes, "판단하려면 그림이 있어야 한다").toBeTruthy();
  });

  it("실패한 규격은 바이트를 주지 않는다", async () => {
    const results = await exportBatch(await busy(1200, 1200), ["kakao-bizboard"]);
    expect(results[0]!.bytes).toBeUndefined();
  });

  it("모르는 규격 id 는 실패로 알린다 — 조용히 빠뜨리지 않는다", async () => {
    const results = await exportBatch(await busy(1200, 1200), ["없는-규격"]);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("failed");
    expect(results[0]!.reason).toMatch(/모르는/);
  });

  it("같은 규격을 여러 번 골라도 한 번만 뽑는다", async () => {
    const results = await exportBatch(await busy(1200, 1200), [
      "google-rda-square", "google-rda-square",
    ]);
    expect(results).toHaveLength(1);
  });

  /**
   * **이 상한이 막는 것은 CPU 가 아니다.** 아는 id 는 17개뿐이라 CPU 천장은
   * `AD_SPECS.length` 가 이미 정한다. 이 상한이 실제로 막는 것은 **모르는 id 를
   * 길게 보내는 것**이고, CPU 는 라우트의 `withRenderSlot` 이 막는다.
   */
  it("한 번에 뽑을 수 있는 규격 수에 상한이 있다", async () => {
    const many = Array.from({ length: MAX_SPECS_PER_REQUEST + 1 }, (_, i) => `x${i}`);
    await expect(exportBatch(await busy(1200, 1200), many)).rejects.toThrow(/한 번에/);
  });

  it("상한이 규격 수를 따라간다 — 전부 고르는 것을 막지도, 넘게 받지도 않는다", () => {
    expect(MAX_SPECS_PER_REQUEST).toBe(AD_SPECS.length);
  });

  it("모르는 규격 id 를 통째로 되비추지 않는다", async () => {
    const long = "x".repeat(500);
    const results = await exportBatch(await busy(1200, 1200), [long]);
    expect(results[0]!.reason!.length).toBeLessThan(120);
  });

  it("아무것도 안 고르면 거절한다", async () => {
    await expect(exportBatch(await busy(1200, 1200), [])).rejects.toThrow(/고르/);
  });
});

describe("결과에 화면이 필요한 것이 들어 있다", () => {
  it("규격의 이름·포털·필수 여부를 함께 준다", async () => {
    const results = await exportBatch(await busy(1200, 1200), ["naver-gfa-banner"]);
    const spec = AD_SPECS.find((entry) => entry.id === "naver-gfa-banner")!;
    expect(results[0]).toMatchObject({
      specId: spec.id, label: spec.label, portal: spec.portal,
      product: spec.product, required: spec.required, target: spec.target,
    });
  });

  /**
   * **「참고」 배지가 화면에 뜨려면 여기로 나가야 한다.** 네이버 규격은 공식
   * 확인이 안 됐고(설계 §11), 그 사실이 결과에 없으면 화면이 구글·카카오와
   * 똑같이 보여 준다.
   */
  it("출처 성격을 함께 준다 — 미검증 규격에 「참고」를 띄우려면 필요하다", async () => {
    const results = await exportBatch(await busy(1200, 1200), ["naver-gfa-banner"]);
    expect(results[0]!.sourceKind).toBe("reference");
  });

  it("안전영역을 함께 준다 — 미리보기의 반투명 띠가 쓴다", async () => {
    const results = await exportBatch(await busy(1200, 1200), ["kakao-display-square"]);
    expect(results[0]!.safeArea).toEqual({ top: 100, right: 0, bottom: 100, left: 40 });
  });

  /**
   * **형식을 함께 준다.** 화면이 data URL 의 MIME 과 ZIP 안의 확장자를 이것으로
   * 정한다. 없으면 `jpeg` 로 못 박게 되고, PNG 규격이 열리는 날 조용히
   * 잘못된 그림을 그린다.
   */
  it("파일 형식을 규격에서 가져온다 — 한 값으로 못 박지 않는다", async () => {
    const results = await exportBatch(await busy(1200, 1200), [
      "google-rda-square", "kakao-bizboard",
    ]);
    expect(results.map((entry) => entry.format)).toEqual(["jpg", "png-alpha"]);
  });

  it("실제로 쓴 품질과 용량을 준다 — 사람이 판단할 근거다", async () => {
    const results = await exportBatch(await busy(1600, 800), ["naver-gfa-main"]);
    expect(results[0]!.quality).toBeGreaterThan(0);
    expect(results[0]!.byteLength).toBeGreaterThan(0);
  });

  /**
   * **축소 배율을 준다.** 214×214 는 1200×1200 에서 5.6배 축소다 — 헤드라인이
   * 안 읽히는 결과가 규격 검증을 전부 통과하고 나간다(설계 §5.2). 화면이
   * 「많이 줄었음」을 표시할 수 있어야 한다.
   */
  it("얼마나 줄였는지 준다", async () => {
    const results = await exportBatch(await busy(1200, 1200), ["naver-powerlink"]);
    expect(results[0]!.shrink).toBeCloseTo(1200 / 214, 1);
  });
});

describe("기능을 통째로 끌 수 있다", () => {
  it("환경변수가 없으면 꺼져 있다 — 켜는 것이 명시적이어야 한다", () => {
    expect(isAdExportEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("1 이면 켜진다", () => {
    expect(isAdExportEnabled({ AD_EXPORT: "1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("아무 값이나 켜지지 않는다", () => {
    expect(isAdExportEnabled({ AD_EXPORT: "true" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isAdExportEnabled({ AD_EXPORT: "0" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});
