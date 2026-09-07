import { describe, expect, it } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { assembleBanner, EMPTY_OBJECT } from "../ad/assemble";

/**
 * 투명 캔버스에 오브젝트를 얹는다.
 *
 * 설계: `docs/superpowers/plans/2026-09-07-ad-assembly-engine.md` §3.1 · §6
 *
 * **모델이 못 만드는 비율을 여기서 만든다.** 비즈보드는 3.99:1, 스마트채널은
 * 4.69:1 이라 `gpt-image-2` 의 3:1 상한을 넘는다. 캔버스를 우리가 만들면
 * 그 상한이 상관없어진다.
 */

async function makeObject(width: number, height: number, opaque = true) {
  return sharp({
    create: {
      width, height, channels: 4,
      background: opaque ? { r: 30, g: 120, b: 60, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer();
}

const BIZBOARD = { width: 1029, height: 258 };

describe("투명 배너 조립", () => {
  it("정확한 픽셀로 나온다", async () => {
    const png = await assembleBanner(BIZBOARD, await makeObject(800, 800));
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1029);
    expect(meta.height).toBe(258);
    expect(meta.format).toBe("png");
  });

  /** **모델이 못 만드는 비율이다.** 3.99:1 은 `gpt-image-2` 의 3:1 상한을 넘는다. */
  it("3:1 을 넘는 비율을 만든다", async () => {
    const meta = await sharp(await assembleBanner(BIZBOARD, await makeObject(800, 800))).metadata();
    expect(meta.width! / meta.height!).toBeGreaterThan(3);
  });

  /**
   * **`hasAlpha` 만으로는 부족하다.** 알파 채널이 있어도 값이 전부 255 면
   * 불투명하다 — 3단계 `check.ts` 가 같은 판단을 한다.
   */
  it("진짜 투명하다 — 알파가 0 인 픽셀이 있다", async () => {
    const png = await assembleBanner(BIZBOARD, await makeObject(400, 400));
    const stats = await sharp(png).stats();
    expect(stats.channels).toHaveLength(4);
    expect(stats.channels[3]!.min).toBe(0);
  });

  it("왼쪽은 비워 둔다 — 광고주가 글자를 얹을 자리다", async () => {
    const png = await assembleBanner(BIZBOARD, await makeObject(400, 400));
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // 왼쪽 위 모서리의 알파
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3]!;
    expect(alphaAt(10, 10)).toBe(0);
    expect(alphaAt(10, info.height - 10)).toBe(0);
  });

  it("오브젝트가 실제로 얹혔다 — 오른쪽에 불투명 픽셀이 있다", async () => {
    const png = await assembleBanner(BIZBOARD, await makeObject(400, 400));
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3]!;
    expect(alphaAt(info.width - 100, Math.round(info.height / 2))).toBeGreaterThan(200);
  });

  /**
   * **이 검사가 없으면 「빈 배너」가 규격 검증을 전부 통과한다.**
   * 배경 제거가 실패하면 전부 투명한 PNG 가 오는데, `trim` 도 방어가 안 된다 —
   * 완전 투명한 800×600 을 `trim` 에 넣으면 800×600 이 그대로 나온다(실측).
   */
  it("오브젝트가 비어 있으면 던진다", async () => {
    await expect(assembleBanner(BIZBOARD, await makeObject(800, 600, false)))
      .rejects.toThrow(EMPTY_OBJECT);
  });

  it("스마트채널 4.69:1 도 만든다", async () => {
    const meta = await sharp(await assembleBanner({ width: 750, height: 160 }, await makeObject(600, 600))).metadata();
    expect(meta.width).toBe(750);
    expect(meta.height).toBe(160);
  });

  /** 세로로 긴 오브젝트도 캔버스 밖으로 안 나간다 — 배치 규칙이 보증한다. */
  it("세로로 긴 오브젝트를 얹어도 안 넘친다", async () => {
    const png = await assembleBanner(BIZBOARD, await makeObject(422, 899));
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1029);
  });

  it("가로로 아주 긴 오브젝트도 안 넘친다", async () => {
    const png = await assembleBanner(BIZBOARD, await makeObject(4500, 1000));
    expect((await sharp(png).metadata()).width).toBe(1029);
  });
});
