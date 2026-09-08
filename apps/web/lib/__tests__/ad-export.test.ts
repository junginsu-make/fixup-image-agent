import { describe, expect, it } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { deflateSync } from "node:zlib";
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

/**
 * **머리말에만 큰 크기를 적은 PNG.** 알맹이는 없다.
 *
 * `limitInputPixels` 를 실제로 밟으려면 상한을 넘는 입력이 필요한데, 40MP 짜리
 * 그림을 진짜로 만들면 raw 로 120MB 를 쓴다(이 저장소는 39.7MP 에서 RSS 483MB 를
 * 측정한 적이 있다). sharp 는 머리말만 보고 거부하므로 **68바이트면 충분하다.**
 *
 * 소스에 상수가 적혀 있는지 문자열로 대조하는 대신 **동작을 밟는다** — 이
 * 저장소는 문자열 대조 시험이 무력화 변경을 못 잡는 함정에 이미 한 번 빠졌다.
 */
function oversizedPng(width: number, height: number): Buffer {
  const table = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let crc = 0xffffffff;
    for (const b of body) crc = table[(crc ^ b) & 0xff]! ^ (crc >>> 8);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(16))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
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
    expect([meta.width, meta.height]).toEqual([456, 304]);
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
    const spec = specById("google-rda-logo");
    const result = await exportForAd(await flat(1200, 1200), spec, planDerivation(spec));
    expect("failed" in result).toBe(true);
  });

  /**
   * **조립 규격을 여기서 만들면 안 된다.** 자르거나 줄이면 배경이 그대로 남아
   * 불투명해지는데, 규격 검증은 픽셀만 보므로 **그 상태로 통과한다** — 화면은
   * 「검증 통과」라 하고 포털이 등록을 거부한다(설계 §3.1).
   */
  it("조립 규격은 파생으로 만들지 않는다", async () => {
    const spec = specById("kakao-bizboard");
    const result = await exportForAd(await flat(2048, 1072), spec, planDerivation(spec));
    expect("failed" in result).toBe(true);
    expect((result as { failed: string }).failed).toMatch(/조립/);
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

  // 독립성은 위의 픽셀·형식·용량·ICC·EXIF 시험이 각각 지킨다. 여기서는
  // 「정상 입력에 군더더기 실패가 안 붙는다」만 본다 — 이름이 본문보다 크면
  // 다음 사람이 이 자리를 다시 안 본다.
  it("정상 입력에는 실패가 하나도 안 붙는다", async () => {
    const spec = specById("google-rda-square");
    const { bytes } = await derive(spec.id, await flat(1200, 1200));
    expect((await checkAgainstSpec(bytes, spec)).failures).toEqual([]);
  });
});

describe("압축 폭탄을 막는다", () => {
  /**
   * 입력 픽셀 상한이 없으면 작은 파일 하나가 서버 메모리를 통째로 먹는다.
   * 이 저장소는 그 상한을 **두 번 빠뜨린 적이 있다** — 그래서 시험으로 밟는다.
   */
  it("뽑는 쪽이 40MP 를 넘는 입력을 거부한다", async () => {
    const spec = specById("google-rda-square");
    const bomb = oversizedPng(8000, 5001); // 40,008,000 픽셀
    expect(bomb.length).toBeLessThan(200); // 시험 자체는 값싸야 한다

    const result = await exportForAd(bomb, spec, planDerivation(spec));
    expect("failed" in result).toBe(true);
    // 문구는 감추되 「너무 크다」는 사용자가 고칠 수 있는 말이라 남긴다.
    expect((result as { failed: string }).failed).toMatch(/너무 커서/);
    expect((result as { failed: string }).failed, "libvips 문구가 새면 안 된다")
      .not.toMatch(/pixel limit|vips/i);
  });

  /**
   * **상한에 걸렸다는 것을 정확히 잰다.** `읽지 못했습니다` 는 `check.ts` 의
   * catch 가 **어떤 읽기 실패에든** 붙이는 포장지라, 그것만 보면 `oversizedPng`
   * 조립기가 깨져 PNG 를 아예 못 읽게 돼도 초록이다.
   */
  it("검사하는 쪽도 거부한다", async () => {
    const check = await checkAgainstSpec(oversizedPng(8000, 5001), specById("google-rda-square"));
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/너무 커서/);
    expect(check.failures.join(), "libvips 문구가 새면 안 된다").not.toMatch(/pixel limit|vips/i);
  });

  /**
   * **모듈을 거쳐 잰다.** 앞 판은 `sharp(..., { limitInputPixels: 40_000_000 })` 로
   * 상수를 시험에 다시 적고 sharp 를 직접 불렀다. 그러면 모듈 상수를 40M → 5M 로
   * **조이는** 변경을 못 잡는다(푸는 변경만 잡힌다). 실측으로 확인했다.
   */
  it("상한 바로 아래는 상한에 안 걸린다 — 상한이 아무거나 막는 것이 아니다", async () => {
    const spec = specById("google-rda-square");
    const nearLimit = oversizedPng(8000, 4999); // 39,992,000 픽셀

    const result = await exportForAd(nearLimit, spec, planDerivation(spec));
    expect("failed" in result).toBe(true); // 알맹이가 없는 PNG 라 어차피 못 만든다
    expect((result as { failed: string }).failed).not.toMatch(/너무 커서/);

    const check = await checkAgainstSpec(nearLimit, spec);
    expect(check.failures.join()).not.toMatch(/너무 커서/);
  });
});

describe("용량 하한 — 너무 작아도 거부된다", () => {
  /**
   * 상한만 보면 단색에 가까운 시안이 2KB 로 나와도 통과한다. 네이버 메인은
   * **50KB 미만을 받지 않는다** — 우리 화면이 「검증 통과」라고 말한 뒤에
   * 포털이 거부하면 사용자는 이유를 알 수 없다.
   */
  it("단색에 가까운 그림이 하한 아래로 떨어지면 잡는다", async () => {
    const spec = specById("naver-gfa-main");
    expect(spec.minBytes, "이 시험은 하한이 있어야 뜻이 있다").toBeGreaterThan(0);

    const { bytes } = await derive(spec.id, await flat(1600, 800));
    expect(bytes.length).toBeLessThan(spec.minBytes!);

    const check = await checkAgainstSpec(bytes, spec);
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/모자랍니다/);
  });

  it("하한과 상한 사이는 통과한다", async () => {
    const spec = specById("naver-gfa-main");
    const { bytes } = await derive(spec.id, await busy(1600, 800));
    expect(bytes.length).toBeGreaterThanOrEqual(spec.minBytes!);
    expect((await checkAgainstSpec(bytes, spec)).ok).toBe(true);
  });
});

describe("투명 배경 규격의 알파", () => {
  const alphaSpec = () => specById("naver-smartchannel");

  it("불투명 PNG 를 투명 규격으로 통과시키지 않는다", async () => {
    const opaque = await sharp({
      create: { width: 750, height: 160, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();
    const check = await checkAgainstSpec(opaque, alphaSpec());
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/알파 채널이 없습니다/);
  });

  it("알파 채널이 있어도 전부 불투명이면 잡는다 — 없는 것과 같다", async () => {
    const fakeAlpha = await sharp({
      create: { width: 750, height: 160, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    }).png().toBuffer();
    expect((await sharp(fakeAlpha).metadata()).hasAlpha).toBe(true);

    const check = await checkAgainstSpec(fakeAlpha, alphaSpec());
    expect(check.ok).toBe(false);
    expect(check.failures.join()).toMatch(/완전히 투명한 픽셀이 없습니다/);
  });

  it("실제로 투명한 곳이 있으면 통과한다", async () => {
    const real = await sharp({
      create: { width: 750, height: 160, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } },
    }).png().toBuffer();
    const check = await checkAgainstSpec(real, alphaSpec());
    expect(check.failures.join()).not.toMatch(/알파|투명/);
  });
});

describe("어디를 자르는가", () => {
  /**
   * **크롭 기준이 시험 밖이었다.** `position: "centre"` 를 `"top"` 으로 바꿔도
   * 시험이 전부 통과했다 — 크롭하는 셋의 구도가 통째로 바뀌는데 아무도 안 봤다.
   *
   * 매직 넘버로 재지 않는다. 같은 마스터를 중앙·위·아래로 각각 깎아 두고
   * **모듈의 결과가 어느 쪽에 가장 가까운지**를 본다. 크롭 양이 적어 색만으로는
   * 안 갈리는 경우에도 이 방식은 갈린다.
   */
  async function striped(width: number, height: number): Promise<Buffer> {
    const band = (r: number, g: number, b: number, h: number) =>
      sharp({ create: { width, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();
    const third = Math.round(height / 3);
    return sharp({ create: { width, height, channels: 3, background: { r: 0, g: 255, b: 0 } } })
      .composite([
        { input: await band(255, 0, 0, third), top: 0, left: 0 },
        { input: await band(0, 0, 255, height - third * 2), top: third * 2, left: 0 },
      ])
      .png().toBuffer();
  }

  /** 두 raw 버퍼의 평균 차이. 작을수록 닮았다. */
  function distance(a: Buffer, b: Buffer): number {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i]! - b[i]!);
    return sum / a.length;
  }

  it("가운데를 자른다 — 위도 아래도 아니다", async () => {
    const spec = specById("naver-gfa-main");
    const master = await striped(1600, 800);
    const { bytes } = await derive(spec.id, master);
    // 양쪽을 같은 형태(RGB 3채널)로 맞춘다 — 채널 수가 다르면 버퍼가 어긋나
    // 무의미한 값이 나온다(실제로 그렇게 한 번 틀렸다).
    const asRgb = (pipeline: ReturnType<typeof sharp>) =>
      pipeline.removeAlpha().toColourspace("srgb").raw().toBuffer();

    const got = await asRgb(sharp(bytes));
    const reference = (position: string) =>
      asRgb(sharp(master).resize(spec.target.width, spec.target.height, { fit: "cover", position }));

    const toCentre = distance(got, await reference("centre"));
    const toTop = distance(got, await reference("top"));
    const toBottom = distance(got, await reference("bottom"));
    expect(toCentre, "세 거리가 같으면 버퍼가 어긋난 것이다").not.toBe(toTop);

    expect(toCentre, `중앙=${toCentre.toFixed(2)} 위=${toTop.toFixed(2)}`).toBeLessThan(toTop);
    expect(toCentre, `중앙=${toCentre.toFixed(2)} 아래=${toBottom.toFixed(2)}`).toBeLessThan(toBottom);
  });
});
