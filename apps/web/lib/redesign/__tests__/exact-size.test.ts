import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { exactOutputSize, fitDataUrlToSize } from "../exact-size";

/**
 * **「1080×1920」을 고르면 정말 1080×1920 이 나온다**(2026-09-23 사용자 결정).
 *
 * 전에는 「9:16」과 「1080×1920」이 코어에서 둘 다 1152×2048 로 바뀌었다
 * (`SIZE_BY_RATIO`). 이름만 다르고 결과는 같은 선택지였다. 그리는 모델은
 * 픽셀 크기를 정확히 지키지 않으므로(어떤 모델은 비율만 본다) **다 만든 뒤
 * 서버에서 정확한 크기로 맞춘다.**
 */
const 그림 = async (width: number, height: number, format: "png" | "jpeg" | "webp" = "png") => {
  const buffer = await sharp({ create: { width, height, channels: 3, background: "#c96" } })[format]().toBuffer();
  const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  return `data:${mime};base64,${buffer.toString("base64")}`;
};
const 크기 = async (dataUrl: string) => {
  const meta = await sharp(Buffer.from(dataUrl.split(",")[1]!, "base64")).metadata();
  return { width: meta.width, height: meta.height, format: meta.format };
};

describe("어떤 비율이 정확한 크기를 요구하나", () => {
  it("「1080×1920」·「1080x1920」은 1080×1920 이다", () => {
    expect(exactOutputSize("1080×1920")).toEqual({ width: 1080, height: 1920 });
    expect(exactOutputSize("1080x1920")).toEqual({ width: 1080, height: 1920 });
  });

  it("「9:16」은 정확한 크기를 요구하지 않는다 — 모델이 그린 그대로 둔다", () => {
    expect(exactOutputSize("9:16")).toBeNull();
    expect(exactOutputSize("")).toBeNull();
    expect(exactOutputSize(undefined)).toBeNull();
  });
});

describe("다 만든 그림을 정확한 크기로 맞춘다", () => {
  it("**1152×2048 을 1080×1920 으로** — 같은 9:16 이라 잘리는 곳이 없다", async () => {
    const 결과 = await fitDataUrlToSize(await 그림(1152, 2048), { width: 1080, height: 1920 });
    expect(await 크기(결과)).toMatchObject({ width: 1080, height: 1920, format: "png" });
  });

  it("비율이 조금 다른 모델 출력(1536×2752)도 1080×1920 이 된다", async () => {
    const 결과 = await fitDataUrlToSize(await 그림(1536, 2752), { width: 1080, height: 1920 });
    expect(await 크기(결과)).toMatchObject({ width: 1080, height: 1920 });
  });

  it("형식을 바꾸지 않는다 — JPEG 는 JPEG, WEBP 는 WEBP", async () => {
    expect((await 크기(await fitDataUrlToSize(await 그림(1152, 2048, "jpeg"), { width: 1080, height: 1920 }))).format).toBe("jpeg");
    expect((await 크기(await fitDataUrlToSize(await 그림(1152, 2048, "webp"), { width: 1080, height: 1920 }))).format).toBe("webp");
  });

  it("이미 그 크기면 손대지 않는다 — 다시 압축하며 화질을 깎지 않는다", async () => {
    const 원래 = await 그림(1080, 1920);
    expect(await fitDataUrlToSize(원래, { width: 1080, height: 1920 })).toBe(원래);
  });

  /*
    **맞추다 실패해도 이미 만든 그림을 잃지 않는다**(독립 리뷰 MEDIUM). 값은 이미
    나갔다 — 크기 맞추기가 던지면 그 장이 통째로 실패로 보였다.
  */
  it("**깨진 그림은 원본을 그대로 돌려준다** — 던지지 않는다", async () => {
    const 깨진것 = "data:image/png;base64,AAAAAAAAAAAA";
    await expect(fitDataUrlToSize(깨진것, { width: 1080, height: 1920 })).resolves.toBe(깨진것);
  });

  /*
    **모양이 크게 다르면 자르지 않는다**(독립 리뷰 LOW). 정사각형을 9:16 으로
    채우면 가로의 44% 가 잘린다. 그런 그림은 원본을 둔다.
  */
  it("정사각형처럼 모양이 크게 다르면 원본을 둔다", async () => {
    const 정사각 = await 그림(1024, 1024);
    expect(await fitDataUrlToSize(정사각, { width: 1080, height: 1920 })).toBe(정사각);
  });

  it("그림이 아닌 값은 그대로 돌려준다 — 여기서 결과를 잃지 않는다", async () => {
    expect(await fitDataUrlToSize("", { width: 1080, height: 1920 })).toBe("");
    expect(await fitDataUrlToSize("https://example.com/a.png", { width: 1080, height: 1920 })).toBe("https://example.com/a.png");
  });
});
