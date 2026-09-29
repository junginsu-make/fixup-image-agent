import "server-only";

import sharp from "sharp";
import { BADGE_OPACITY, badgePlacement, isBrightCorner } from "@fixup/sns-core";
import { MAX_INPUT_PIXELS } from "./image-encoding";
import { BADGE_SIZE, badgeImage } from "./ai-badge";
import { isAiBadgeEnabled } from "./ai-badge-setting";
import { stampAiMetadata } from "./ai-metadata";

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
 * 여는 자리마다 픽셀 상한을 건다. 저장 경로가 이 함수를 **먼저** 부르므로,
 * 인코딩 쪽에만 상한을 두면 표기 단계가 그 상한을 앞질러 간다 — 작은 파일
 * 한 장으로 메모리를 훑는 길이 열린 채 남는다.
 *
 * 관리자가 꺼 두었으면 그대로 돌려준다. 켜고 끄는 자리를 이 한 곳에 둔 것은,
 * 부르는 쪽이 세 군데라 각자 확인하게 하면 언젠가 한 곳이 빠지기 때문이다.
 */
export async function markAsAi(bytes: Buffer): Promise<Buffer> {
  /*
    **파일 안 표시는 배지와 무관하게 늘 넣는다**(2026-09-29).

    인공지능기본법 제31조는 결과물이 AI 로 생성됐다는 사실을 표시하라고 하고,
    다운로드로 밖에 나가는 그림은 파일 자체에 표시가 있어야 한다. 배지는
    관리자가 끌 수 있으므로 **끈 상태에서는 표시가 하나도 안 남는다.**

    그래서 이것이 먼저다 — 배지를 켜든 끄든 지나간다.
    자세한 사정은 `lib/ai-metadata.ts` 와 `docs/ai-labeling-law.html` 에 적었다.
  */
  const stamped = await stampAiMetadata(bytes);

  if (!(await isAiBadgeEnabled())) return stamped;

  try {
    const image = sharp(stamped, { limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await image.metadata();
    /*
      **타입을 좁히는 줄이다.** sharp 가 `width` 를 `number | undefined` 로 주지만,
      metadata 를 읽어낸 그림에는 늘 값이 있고 못 읽으면 위에서 던져 아래 `catch`
      로 간다. 그래서 이 갈래는 밟을 입력이 없다 — 변이 시험에서 `bytes` 로 바꿔도
      초록인 것이 그 이유다(2026-09-29). 시험이 약한 것이 아니라 등가 변이다.

      그래도 `stamped` 를 준다. 배지를 못 그리는 어느 갈래에서도 파일 안 표시는
      남아야 하고, 나중에 이 줄이 닿게 되는 날 `bytes` 였으면 그 갈래만 표시 없는
      그림이 나간다.
    */
    if (!meta.width || !meta.height) return stamped;

    const place = badgePlacement({ width: meta.width, height: meta.height }, BADGE_SIZE);

    // 글자가 놓일 자리만 떼어 밝기를 잰다. 그림 전체 평균으로는 어두운 그림의
    // 밝은 구석을 놓친다.
    // 표시를 찍은 쪽에서 잰다. 픽셀은 같지만, 이 아래로는 다룰 바이트가
    // `stamped` 하나뿐이어야 한다 — 두 벌을 섞어 쓰면 한쪽만 고쳐진다.
    const corner = await sharp(stamped, { limitInputPixels: MAX_INPUT_PIXELS })
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

    return await sharp(stamped, { limitInputPixels: MAX_INPUT_PIXELS })
      .composite([{ input: layer, left: place.left, top: place.top }])
      /*
        **`keepMetadata()` 가 없으면 방금 적은 표시가 지워진다.** sharp 는 기본으로
        메타데이터를 안 옮긴다 — 이 한 줄이 빠져 있어서 그동안 원본에 붙어 오던
        것도 함께 사라지고 있었다(2026-09-29 확인).
      */
      .keepMetadata()
      .png()
      .toBuffer();
  } catch {
    // 표기를 못 넣었다고 그림을 잃을 수는 없다. 파일 안 표시는 이미 들어갔다.
    return stamped;
  }
}
