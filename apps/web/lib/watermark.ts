import "server-only";

// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { BADGE_OPACITY, badgePlacement, isBrightCorner } from "@fixup/sns-core";
import { BADGE_SIZE, badgeImage } from "./ai-badge";
import { isAiBadgeEnabled } from "./ai-badge-setting";

/**
 * 만든 그림에 "AI 이미지" 를 새긴다.
 *
 * **파일 안에 새긴다.** 화면에만 덧씌우면 내려받는 순간 사라져서, 알리려는
 * 목적이 사라진다. 내보낸 그림 어디에 가 있어도 표기가 따라가야 한다.
 *
 * 눈에 거슬리지 않게 둔다 — 작게, 옅게, 오른쪽 아래. 그래도 안 보이면 안
 * 되므로 그 구석이 밝으면 글자를 검게 뒤집는다. 흰 글자만 쓰면 흰 배경에서
 * 아예 사라진다.
 *
 * **실패해도 원본을 돌려준다.** 표기를 못 넣었다고 만든 그림을 잃는 것이
 * 훨씬 나쁘다.
 *
 * 관리자가 꺼 두었으면 그대로 돌려준다. 켜고 끄는 자리를 이 한 곳에 둔 것은,
 * 부르는 쪽이 세 군데라 각자 확인하게 하면 언젠가 한 곳이 빠지기 때문이다.
 */
export async function markAsAi(bytes: Buffer): Promise<Buffer> {
  if (!(await isAiBadgeEnabled())) return bytes;

  try {
    const image = sharp(bytes);
    const meta = await image.metadata();
    if (!meta.width || !meta.height) return bytes;

    const place = badgePlacement({ width: meta.width, height: meta.height }, BADGE_SIZE);

    // 글자가 놓일 자리만 떼어 밝기를 잰다. 그림 전체 평균으로는 어두운 그림의
    // 밝은 구석을 놓친다.
    const corner = await sharp(bytes)
      .extract({ left: place.left, top: place.top, width: place.width, height: place.height })
      .greyscale()
      .raw()
      .toBuffer();

    let badge = sharp(badgeImage()).resize(place.width, place.height, { fit: "fill" });
    if (isBrightCorner(corner)) badge = badge.negate({ alpha: false });

    const layer = await badge
      .composite([{
        // 알파를 통째로 낮춰 옅게 만든다. 글자 모양은 그대로 두고 진하기만 준다.
        input: Buffer.from([255, 255, 255, Math.round(BADGE_OPACITY * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      }])
      .png()
      .toBuffer();

    return await sharp(bytes)
      .composite([{ input: layer, left: place.left, top: place.top }])
      .png()
      .toBuffer();
  } catch {
    // 표기를 못 넣었다고 그림을 잃을 수는 없다.
    return bytes;
  }
}
