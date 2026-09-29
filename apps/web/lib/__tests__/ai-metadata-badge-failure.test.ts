import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

/**
 * **배지를 굽다 실패해도 파일 안 표시는 남는가**(2026-09-29).
 *
 * ── 왜 별도 파일인가 ───────────────────────────────────────
 *
 * `markAsAi` 의 `catch` 는 **표시를 찍는 데는 성공하고 배지를 굽는 데만 실패한**
 * 경우에만 뜻이 있다. 그 갈래에서 원본을 돌려주면, 배지를 못 그린 그림만
 * 표시 없이 밖으로 나간다.
 *
 * 그 상황을 **진짜 그림으로는 만들 수 없다.** `badgePlacement` 가 자리 값을
 * 전부 1 이상으로 가두어서 아주 작거나 아주 납작한 그림도 정상으로 지나가고,
 * 깨진 바이트를 넣으면 표시 찍기가 **먼저** 실패해 원본과 구별이 안 된다.
 *
 * 그래서 실패하는 자리를 실제 이음매에서 만든다 — 배지 그림을 못 읽게 한다.
 * 이것이 운영기에서 이 `catch` 가 뜰 실제 사정과도 같다(배지 자산이 깨지거나
 * sharp 가 그 형식을 못 읽는 경우).
 *
 * 흉내가 아니다 — 부르는 코드는 손대지 않았고, **파일에 남았는지는 진짜로 읽는다.**
 */

vi.mock("server-only", () => ({}));

vi.mock("../ai-badge-setting", () => ({
  // 배지를 켠 상태여야 `try` 안으로 들어간다.
  isAiBadgeEnabled: async () => true,
}));

vi.mock("../ai-badge", () => ({
  // 자리 계산은 정상으로 두고, 그림만 못 읽게 한다.
  BADGE_SIZE: { width: 422, height: 94 },
  badgeImage: () => Buffer.from("이건 그림이 아니다"),
}));

const { markAsAi } = await import("../watermark");
const { hasAiMetadata } = await import("../ai-metadata");

const 그림 = () =>
  sharp({ create: { width: 400, height: 400, channels: 3, background: "#6a8caf" } })
    .png()
    .toBuffer();

describe("배지가 실패하는 경우", () => {
  it("**배지를 못 구워도 표시는 남는다**", async () => {
    const 원본 = await 그림();

    const 나온것 = await markAsAi(원본);

    expect(await hasAiMetadata(나온것), "배지 실패로 표시까지 잃었다").toBe(true);
  });

  /** 표시를 넣느라 그림을 잃으면 안 된다. 배지만 없고 그림은 멀쩡해야 한다. */
  it("**그림 자체는 멀쩡하다**", async () => {
    const 원본 = await 그림();

    const 나온것 = await markAsAi(원본);

    const [a, b] = await Promise.all([
      sharp(원본).raw().toBuffer(),
      sharp(나온것).raw().toBuffer(),
    ]);
    expect(b.equals(a), "배지가 실패했는데 픽셀이 바뀌었다").toBe(true);
  });
});
