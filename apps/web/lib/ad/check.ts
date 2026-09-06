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

    // `png-alpha` 는 여기 오면 안 된다 — `planDerivation` 이 막는다.
    // 그래도 새어 들어오면 png 로 취급해 형식 검사가 잡는다.
    const wanted = spec.format === "png-alpha" ? "png" : spec.format;
    const actual = formatOf(meta);
    if (actual !== wanted) failures.push(`형식이 다릅니다: ${actual} (규격은 ${wanted})`);

    if (spec.maxBytes && bytes.length > spec.maxBytes) {
      failures.push(
        `용량이 넘칩니다: ${Math.round(bytes.length / 1024)}KB (상한 ${Math.round(spec.maxBytes / 1024)}KB)`,
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
