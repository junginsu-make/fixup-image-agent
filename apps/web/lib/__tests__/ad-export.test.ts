import { describe, expect, it } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { AD_SPECS, type AdSpec } from "../ad/specs";
import { planDerivation } from "../ad/derive";
import { exportForAd } from "../ad/export";
import { checkAgainstSpec } from "../ad/check";

/**
 * 마스터에서 광고 규격을 뽑고, 만들어진 바이트를 검사한다.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §5.1·§8
 *
 * **단색 이미지로 시험하지 않는다.** 용량 상한이 늘 통과해 아무것도 검증하지
 * 못한다. 아래 `busy()` 는 잡음을 채워 실제 시안처럼 압축이 어려운 그림을 만든다.
 */

/** 압축이 잘 안 되는 그림. 용량 상한 검사가 헛돌지 않게 한다. */
async function busy(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = (i * 2654435761) % 256;
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** 압축이 아주 잘 되는 그림. 「작아서 통과」를 확인할 때 쓴다. */
async function flat(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 60, b: 120 } } })
    .png().toBuffer();
}

const specById = (id: string): AdSpec => AD_SPECS.find((spec) => spec.id === id)!;

async function derive(specId: string, master: Buffer) {
  const spec = specById(specId);
  const result = await exportForAd(master, spec, planDerivation(spec));
  if ("failed" in result) throw new Error(`뽑지 못했습니다: ${result.failed}`);
  return { spec, ...result };
}

describe("규격대로 뽑는다", () => {
  it("픽셀이 목표와 정확히 같다 — 축소만 하는 규격", async () => {
    const { bytes } = await derive("naver-powerlink", await flat(1200, 1200));
    const meta = await sharp(bytes).metadata();
    expect([meta.width, meta.height]).toEqual([214, 214]);
  });

  it("픽셀이 목표와 정확히 같다 — 깎는 규격", async () => {
    const { bytes } = await derive("naver-brand-pc", await flat(2048, 1072));
    const meta = await sharp(bytes).metadata();
    expect([meta.width, meta.height]).toEqual([228, 152]);
  });

  // 두 변을 따로 본다. 가로·세로가 동시에 모자란 입력만 쓰면 한쪽 조건을 지워도 통과한다.
  it.each([
    ["둘 다 모자람", 400, 210],
    ["세로만 모자람", 1600, 300],
    ["가로만 모자람", 900, 1200],
  ])("작은 그림을 받으면 실패로 알린다 (%s) — 조용히 늘리지 않는다", async (_label, w, h) => {
    const spec = specById("naver-gfa-banner");
    const result = await exportForAd(await flat(w, h), spec, planDerivation(spec));
    expect("failed" in result).toBe(true);
  });

  it("만들 수 없는 규격은 뽑지 않는다", async () => {
    const spec = specById("kakao-bizboard");
    const result = await exportForAd(await flat(1200, 1200), spec, planDerivation(spec));
    expect("failed" in result).toBe(true);
  });
});

describe("용량 상한을 지킨다", () => {
  it("빡빡한 상한도 맞춘다 — 네이버 메인 250KB", async () => {
    const spec = specById("naver-gfa-main");
    const { bytes } = await derive(spec.id, await busy(1600, 800));
    expect(bytes.length).toBeLessThanOrEqual(spec.maxBytes!);
  });

  it("상한이 넉넉하면 품질을 깎지 않는다", async () => {
    const loose = await derive("google-rda-square", await busy(1200, 1200));
    const tight = await derive("naver-gfa-main", await busy(1600, 800));
    expect(loose.quality).toBeGreaterThan(tight.quality);
  });

  /**
   * **「가장 높은 품질」이 정의대로인지 본다.**
   *
   * 위 시험은 `loose > tight` 만 보므로 tight 가 40 이든 76 이든 통과한다.
   * 실제로 이분 탐색의 방향을 뒤집는 뮤테이션(`low = mid + 1` → `high = mid - 1`)
   * 이 품질 76 을 40 으로 떨어뜨리는데 — 예산 250KB 중 107KB 만 쓰고 화질을
   * 최저로 깎는데 — 시험이 전부 초록이었다(독립 리뷰 실측).
   *
   * 최대의 정의는 **한 칸 올리면 상한을 넘는다**는 것이다. 그것을 직접 잰다.
   */
  it("상한 안에서 더 올릴 수 없는 품질을 고른다", async () => {
    const spec = specById("naver-gfa-main");
    const master = await busy(1600, 800);
    const { bytes, quality } = await derive(spec.id, master);
    expect(bytes.length).toBeLessThanOrEqual(spec.maxBytes!);
    expect(quality).toBeLessThan(92);

    const oneHigher = await sharp(master)
      .resize(spec.target.width, spec.target.height, { fit: "cover", position: "centre" })
      .jpeg({ quality: quality + 1, mozjpeg: true })
      .toBuffer();
    expect(oneHigher.length).toBeGreaterThan(spec.maxBytes!);
  });

  it("품질 하한을 지킨다 — 그 아래는 글자가 뭉개져 광고로 못 쓴다", async () => {
    const spec: AdSpec = { ...specById("naver-gfa-main"), maxBytes: 20_000 };
    const result = await exportForAd(await busy(1600, 800), spec, planDerivation(spec));
    // 40 아래로 내려가며 억지로 맞추지 않는다. 못 맞추면 실패로 알린다.
    if (!("failed" in result)) expect(result.quality).toBeGreaterThanOrEqual(40);
  });

  it("어떤 품질로도 못 맞추면 실패로 알린다 — 조용히 넘기지 않는다", async () => {
    const impossible: AdSpec = { ...specById("google-rda-square"), maxBytes: 500 };
    const result = await exportForAd(await busy(1200, 1200), impossible, planDerivation(impossible));
    expect("failed" in result).toBe(true);
  });
});

describe("메타데이터를 지운다", () => {
  /**
   * 목록 썸네일(`grid-thumbnail.ts`)은 `keepMetadata()` 로 ICC 를 지킨다 —
   * 색이 틀어지면 안 되기 때문이다. **광고는 반대다.** 200KB 예산에서 ICC·EXIF 는
   * 사치다. 두 경로가 다르다는 것을 여기서 못 박는다.
   */
  it("ICC 프로파일이 붙어 나오지 않는다", async () => {
    const withIcc = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 200, g: 30, b: 30 } },
    }).withMetadata({ icc: "srgb" }).png().toBuffer();

    expect((await sharp(withIcc).metadata()).icc).toBeTruthy();
    const { bytes } = await derive("google-rda-square", withIcc);
    expect((await sharp(bytes).metadata()).icc).toBeFalsy();
  });
});

describe("규격 검증 — 만들어진 바이트를 본다", () => {
  it("제대로 만든 것은 통과한다", async () => {
    const { spec, bytes } = await derive("google-rda-square", await flat(1200, 1200));
    expect((await checkAgainstSpec(bytes, spec)).ok).toBe(true);
  });

  // 가로·세로를 따로 본다. 한쪽만 시험하면 다른 쪽 조건을 지워도 통과한다.
  it.each([[1199, 1200], [1200, 1199]])("픽셀이 %ix%i 로 어긋나면 잡는다", async (w, h) => {
    const spec = specById("google-rda-square");
    const wrong = await sharp({
      create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).jpeg().toBuffer();
    const check = await checkAgainstSpec(wrong, spec);
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/1199/);
  });

  it("형식이 어긋나면 잡는다", async () => {
    const spec = specById("google-rda-square");
    const png = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();
    const check = await checkAgainstSpec(png, spec);
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/형식/);
  });

  it("용량이 넘치면 잡는다", async () => {
    const spec: AdSpec = { ...specById("google-rda-square"), maxBytes: 100 };
    const bytes = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 90, g: 90, b: 90 } },
    }).jpeg().toBuffer();
    const check = await checkAgainstSpec(bytes, spec);
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/용량/);
  });

  /**
   * **ICC 와 EXIF 를 따로 본다.**
   *
   * `withMetadata({ icc })` 는 sharp 가 EXIF 도 함께 쓴다. 그래서 그것만으로
   * 시험하면 **ICC 검사를 지워도 EXIF 가 대신 잡아 준다** — 색관리된 원본에서
   * 나오는 「ICC 만 달린 JPEG」이 검사 밖에 남는다(독립 리뷰 실측).
   */
  it("ICC 만 남아 있어도 잡는다", async () => {
    const spec = specById("google-rda-square");
    const bytes = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).withIccProfile("srgb").jpeg().toBuffer();
    const meta = await sharp(bytes).metadata();
    expect(meta.icc, "이 시험은 ICC 가 실제로 붙어야 뜻이 있다").toBeTruthy();
    expect(meta.exif, "EXIF 가 함께 붙으면 ICC 검사를 못 가린다고 말할 수 없다").toBeFalsy();

    const check = await checkAgainstSpec(bytes, spec);
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/메타데이터/);
  });

  it("EXIF 만 남아 있어도 잡는다", async () => {
    const spec = specById("google-rda-square");
    const bytes = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 10, g: 10, b: 10 } },
    }).withExif({ IFD0: { Copyright: "시험" } }).jpeg().toBuffer();
    expect((await sharp(bytes).metadata()).exif).toBeTruthy();

    const check = await checkAgainstSpec(bytes, spec);
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/메타데이터/);
  });

  it("검사 넷이 각각 독립적으로 실패를 잡는다 — 하나가 다른 것을 가리지 않는다", async () => {
    const spec = specById("google-rda-square");
    const { bytes } = await derive(spec.id, await flat(1200, 1200));
    const good = await checkAgainstSpec(bytes, spec);
    expect(good.failures).toEqual([]);
  });
});
