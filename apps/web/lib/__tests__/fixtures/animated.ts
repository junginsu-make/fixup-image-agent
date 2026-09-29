import sharp from "sharp";

/**
 * 2프레임 애니메이션 GIF. 손으로 짠 85바이트짜리다.
 *
 * 파일에서 읽지 않고 여기 둔 것은, 이 픽스처가 **막으려는 사고 그 자체**라
 * 어딘가에서 조용히 사라지면 안 되기 때문이다. sharp 로는 애니메이션 GIF 를
 * 만들 수 없어 바이트를 직접 적었다.
 *
 * 쓰는 곳이 둘이라 여기로 모았다(`image-encoding.test.ts`, `ai-metadata.test.ts`).
 */
export const ANIMATED_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAZAAAACwAAAAAAQABAAACAkQBACH5BABkAAAALAAAAAABAAEAAAICTAEAOw==",
  "base64",
);

/**
 * 움직이는 WebP.
 *
 * **이것은 `pages` 로 갈라야 한다.** APNG 와 반대다 — APNG 는 libvips 가 아예
 * 못 읽어 `pages` 가 `undefined` 로 오지만(그래서 바이트에서 `acTL` 을 찾는다),
 * 움직이는 WebP 는 `pages` 가 제대로 2 로 온다(2026-09-29 실측).
 *
 * 두 방어가 각각 상대가 놓치는 쪽을 잡는다. 하나라도 빼면 그쪽 형식이 조용히
 * 첫 장만 남는다.
 *
 * GIF 를 거쳐 만드는 것은 sharp 로 애니메이션을 처음부터 쓸 수 없기 때문이다.
 * `{ animated: true }` 없이 읽으면 첫 장만 들어와 정지 WebP 가 나온다.
 */
export function animatedWebp(): Promise<Buffer> {
  return sharp(ANIMATED_GIF, { animated: true }).webp().toBuffer();
}
