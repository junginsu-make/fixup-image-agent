// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import type { AdSpec } from "./specs";

/**
 * 내보내기 직전에 **만들어진 바이트 자체**를 검사한다.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §5.1
 *
 * **계획을 검사하는 것이 아니다.** 계획은 맞았는데 인코딩에서 어긋나는 것이
 * 실제로 일어난다 — 이 저장소의 무손실 WebP 작업에서 16비트 강등과 투명 픽셀
 * 소실이 그렇게 났다.
 *
 * **확대 금지는 여기서 안 본다.** `planDerivation`(§3.6 불변식 3)과
 * `exportForAd` 에 이미 있다. 같은 규칙을 세 곳에 두면 어느 하나가 어긋났을 때
 * 조용해진다 — 이 저장소가 최근에만 두 번 당한 실수다.
 *
 * **안전영역도 여기서 안 본다.** 「가장자리가 거의 단색인가」는 실사·그라디언트
 * 배경에서 상시 경고를 내고, 상시 뜨는 경고는 사용자가 진짜 실패까지 무시하게
 * 만든다. 미리보기의 반투명 띠가 그 답이다(§5.2).
 */

const MAX_INPUT_PIXELS = 40_000_000;

export interface SpecCheck {
  ok: boolean;
  failures: string[];
}

/** sharp 가 돌려주는 형식 이름을 규격의 형식으로 옮긴다. */
function formatOf(meta: { format?: string }): string | null {
  if (meta.format === "jpeg" || meta.format === "jpg") return "jpg";
  if (meta.format === "png") return "png";
  return meta.format ?? null;
}

export async function checkAgainstSpec(bytes: Buffer, spec: AdSpec): Promise<SpecCheck> {
  const failures: string[] = [];
  try {
    const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();

    // 픽셀은 **정확히** 같아야 한다. 「비슷하면 된다」는 규격이 아니다.
    if (meta.width !== spec.target.width || meta.height !== spec.target.height) {
      failures.push(
        `픽셀이 다릅니다: ${meta.width}×${meta.height} (규격은 ${spec.target.width}×${spec.target.height})`,
      );
    }

    const wanted = spec.format === "png-alpha" ? "png" : spec.format;
    const actual = formatOf(meta);
    if (actual !== wanted) failures.push(`형식이 다릅니다: ${actual} (규격은 ${wanted})`);

    /**
     * **투명이 요구되면 실제로 투명한지 본다.**
     *
     * 형식만 보면 불투명 PNG 가 통과한다. 그러면 포털이 등록 단계에서 거부하는데,
     * 우리 화면은 「검증 통과」라고 말한 뒤다.
     *
     * 알파 채널이 있는 것으로도 모자라다 — 전부 불투명한 알파는 없는 것과 같다.
     * 이 저장소는 같은 함정을 이미 한 번 겪었다(`image-encoding.ts` 의 알파 최소값).
     *
     * 오늘은 `planDerivation` 이 `png-alpha` 를 미지원으로 막지만, 이 함수의 존재
     * 이유가 **「계획이 아니라 바이트를 본다」**이고 2·3단계는 업로드 바이트도 받는다.
     */
    if (spec.format === "png-alpha") {
      if (!meta.hasAlpha) {
        failures.push("투명 배경이 필요한데 알파 채널이 없습니다");
      } else {
        const stats = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).stats();
        const alpha = stats.channels[stats.channels.length - 1];
        if (!alpha || alpha.min !== 0) failures.push("알파 채널은 있지만 완전히 투명한 픽셀이 없습니다");
      }
    }

    if (spec.maxBytes && bytes.length > spec.maxBytes) {
      failures.push(
        `용량이 넘칩니다: ${Math.round(bytes.length / 1024)}KB (상한 ${Math.round(spec.maxBytes / 1024)}KB)`,
      );
    }

    // **하한도 본다.** 상한만 보면 단색에 가까운 시안이 2KB 로 나와도 통과하는데,
    // 네이버 메인은 50KB 미만을 받지 않는다.
    if (spec.minBytes && bytes.length < spec.minBytes) {
      failures.push(
        `용량이 모자랍니다: ${Math.round(bytes.length / 1024)}KB (하한 ${Math.round(spec.minBytes / 1024)}KB)`,
      );
    }

    // 200KB 예산에서 ICC·EXIF 는 사치다. 목록 썸네일(`grid-thumbnail.ts`)은
    // 정반대로 `keepMetadata()` 를 쓰는데, 거기는 색이 틀어지면 안 되기 때문이다.
    if (meta.icc || meta.exif) failures.push("메타데이터가 남아 있습니다 (ICC 또는 EXIF)");
  } catch (error) {
    failures.push(`읽지 못했습니다: ${error instanceof Error ? error.message : error}`);
  }
  return { ok: failures.length === 0, failures };
}
