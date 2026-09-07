// 스위치는 잎 모듈에 있다 — 그것만 읽으려고 sharp 를 끌고 오면 안 된다.
export { isAdExportEnabled } from "./feature";
import { assembleBanner, type AssembledBanner } from "./assemble";
import { isTooSmall } from "./layout-rules";
import { checkAgainstSpec } from "./check";
import { planDerivation } from "./derive";
import { exportForAd } from "./export";
import { AD_SPECS, type AdSpec } from "./specs";

/**
 * 그림 한 장에서 고른 규격들을 **한 번에** 뽑는다.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §5.2·§10 2단계
 *
 * **파생을 두 번 돌리지 않는 것이 이 모듈의 존재 이유다.** 설계 §8.1 은
 * 「내려받을 때 만든다」고 적고 §5.2 는 「내려받기 전에 보여 준다」고 적는데,
 * 그대로 합치면 같은 파생이 두 번 돈다. 여기서 한 번 뽑아 **미리보기와 ZIP 이
 * 같은 바이트를 쓴다.**
 *
 * **실측**: 규격 17개를 전부 요청하면 sharp 인코드는 **20회**다(12MP 마스터에서
 * 4.4초). 17개 중 sharp 를 타는 것은 14개뿐이고(로고는 업로드, 투명 둘은 미지원),
 * 이분 탐색이 붙는 것은 용량 상한이 빡빡한 `naver-gfa-main` 하나다.
 * 설계 §5.2 가 적은 「70~90회」는 규격 10개 기준의 어림이었고 **실제와 다르다.**
 *
 * ZIP 은 만들지 않는다. `jszip` 이 이미 화면 쪽에 있고
 * (`app/library/ResultViewer.tsx:153`) 거기서 묶는 것이 이 저장소의 결이다.
 */

/**
 * 한 요청이 뽑을 수 있는 규격 수.
 *
 * **초판은 24 로 뒀는데 그것은 도달할 수 없는 수였다.** 아는 id 는 17개뿐이고
 * 중복은 아래에서 제거하므로, 24 가 실제로 막는 유일한 것은 **모르는 id 를 길게
 * 보내는 것**이었다. CPU 천장은 `AD_SPECS.length` 가 이미 정하고 있다.
 *
 * 그래서 목록 길이에 맞춘다. 규격이 늘면 따라 늘고, 전부 고르는 것은 막지 않는다.
 *
 * **CPU 를 막는 것은 이 수가 아니다.** 요청 하나의 크기가 아니라 요청의 빈도가
 * 문제이고, 그것은 라우트의 `withRenderSlot` 이 막는다.
 */
export const MAX_SPECS_PER_REQUEST = AD_SPECS.length;

export interface AdBatchEntry {
  specId: string;
  label: string;
  portal: AdSpec["portal"];
  product: string;
  required: boolean;
  sourceKind: AdSpec["sourceKind"];
  /** 파일 형식. 화면이 data URL 을 만들 때와 ZIP 확장자에 쓴다. */
  format: AdSpec["format"];
  target: { width: number; height: number };
  safeArea?: AdSpec["safeArea"];
  status: "ok" | "failed";
  /** 실패한 까닭. 화면이 「무엇이 왜 빠졌는지」를 적을 때 쓴다. */
  reason?: string;
  /** 규격 검증에서 걸린 것들. `status: "ok"` 여도 비어 있지 않을 수 있다. */
  failures: string[];
  bytes?: Buffer;
  byteLength?: number;
  quality?: number;
  /**
   * 원본을 몇 배로 줄였는가.
   *
   * 214×214 는 1200×1200 에서 5.6배다 — 헤드라인이 안 읽히는 결과가 규격 검증을
   * 전부 통과하고 나간다(설계 §5.2). 화면이 「많이 줄었음」을 표시할 수 있어야 한다.
   */
  shrink?: number;
  /**
   * 오브젝트가 캔버스 폭의 15% 미만인가 — **조립 규격에만 붙는다.**
   *
   * 세로로 긴 피사체(사람 전신, 병, 튜브형 제품)를 가로로 긴 배너에 놓으면
   * 폭 5~13% 까지 쪼그라든다. 1029px 배너에 62px 짜리 조각 하나면 **빈 배너에
   * 점 하나**인데, 픽셀·형식·알파·용량이 전부 맞아 `checkAgainstSpec` 을
   * **통과한다**(설계 §5.4② · §6.2).
   *
   * **막지 않고 알린다.** 늘이면 찌그러지고 자르면 얼굴이 잘린다 — 둘 다 광고로
   * 못 쓴다. 사람이 보고 다른 마스터를 고르는 편이 낫다.
   */
  tooSmall?: boolean;
}


export interface ExportBatchOptions {
  /**
   * 마스터에서 배경을 지워 오브젝트만 남긴다. **조립 규격에만 쓴다.**
   *
   * **주입으로 받는다.** 이 모듈은 규격마다 도는 순수한 루프이고 배경 제거는
   * 네트워크다 — 직접 부르면 시험이 fal 없이 못 돌고, 계약상 `lib/ad/` 의
   * 순수 층에 fal 이 새는 것도 막아야 한다(설계 §4.2).
   *
   * 안 넘기면 조립 규격만 실패한다. **조용히 빈 배너를 만들지 않는다.**
   */
  cutout?: (master: Buffer) => Promise<Buffer>;
  /**
   * 뽑은 바이트를 **검증 전에** 한 번 거치게 하는 자리.
   *
   * AI 표기(격리 계약 7)가 여기로 들어온다. 설계 §4.3 이 「크롭이 배지를
   * 잘라내고 축소가 뭉갠다 → 파생 뒤에 다시 태운다」로 결론냈고, `export.ts` 의
   * 머리말이 그 의무를 **이 함수를 부르는 쪽**에 지목했다.
   *
   * **검증보다 먼저 태운다.** 배지가 용량을 키우므로, 태우기 전 바이트로
   * `maxBytes` 를 통과시키면 그 통과가 거짓말이 된다.
   *
   * 주입으로 받는 이유: `markAsAi` 는 `server-only` 이고 호출마다 설정을
   * 조회한다. 여기서 직접 부르면 이 모듈이 시험에서 안 돌고, 규격 수만큼
   * 조회가 늘어난다. **켤지 말지는 부르는 쪽이 한 번 정한다.**
   */
  finish?: (bytes: Buffer) => Promise<Buffer>;
}

export async function exportBatch(
  master: Buffer,
  specIds: string[],
  options: ExportBatchOptions = {},
): Promise<AdBatchEntry[]> {
  // 같은 규격을 여러 번 골라도 한 번만 뽑는다. 순서는 고른 순서를 지킨다.
  const wanted = [...new Set(specIds)];
  if (!wanted.length) throw new Error("규격을 하나 이상 고르세요.");
  if (wanted.length > MAX_SPECS_PER_REQUEST) {
    throw new Error(`한 번에 ${MAX_SPECS_PER_REQUEST}개까지 뽑을 수 있습니다.`);
  }

  const entries: AdBatchEntry[] = [];
  // 마스터당 하나. 여러 조립 규격이 같은 오브젝트를 나눠 쓴다.
  const cache: { object?: Buffer } = {};
  for (const id of wanted) {
    const spec = AD_SPECS.find((entry) => entry.id === id);
    if (!spec) {
      // **조용히 빠뜨리지 않는다.** 화면이 고른 것과 받은 것을 맞대 볼 수 있어야 한다.
      entries.push({
        specId: id, label: id, portal: "google", product: "?", required: false,
        sourceKind: "reference", format: "jpg", target: { width: 0, height: 0 },
        // **잘라서 되비춘다.** 스키마가 길이를 막고 있지만 스키마는 언제든
        // 갈아끼워진다 — 되비추는 쪽이 스스로를 지켜야 한다.
        status: "failed", reason: `모르는 규격입니다: ${id.slice(0, 64)}`, failures: [],
      });
      continue;
    }

    const shared = {
      specId: spec.id, label: spec.label, portal: spec.portal, product: spec.product,
      required: spec.required, sourceKind: spec.sourceKind, format: spec.format,
      target: spec.target,
      ...(spec.safeArea ? { safeArea: spec.safeArea } : {}),
    };

    const plan = planDerivation(spec);

    /**
     * **조립은 파생과 길이 다르다.** 자르거나 줄이는 것이 아니라, 배경을 지운
     * 오브젝트를 투명 캔버스에 얹는다 — 모델이 못 만드는 비율(3.99:1·4.69:1)이
     * 그렇게 나온다(설계 §3.1).
     *
     * **오브젝트는 마스터당 한 번만 만든다.** 두 규격이 같은 마스터를 쓰면
     * 배경 제거가 한 번이다 — 아끼는 것은 돈($0.003)이 아니라 **시간**이다
     * (3.7초 × 규격 수만큼 사용자가 기다린다, 설계 §8).
     */
    if (plan.kind === "assemble") {
      const assembled = await assembleFor(spec, master, options, cache);
      if ("failed" in assembled) {
        entries.push({ ...shared, status: "failed", reason: assembled.failed, failures: [] });
        continue;
      }
      const bytes = options.finish ? await options.finish(assembled.bytes) : assembled.bytes;
      const check = await checkAgainstSpec(bytes, spec);
      entries.push({
        ...shared,
        status: check.ok ? "ok" : "failed",
        ...(check.ok ? {} : { reason: check.failures.join(" · ") }),
        failures: check.failures,
        bytes,
        byteLength: bytes.length,
        // **막지 않고 알린다.** 규격 검증은 이것을 통과시킨다(§5.4②).
        ...(isTooSmall(spec.target, assembled.placement) ? { tooSmall: true } : {}),
      });
      continue;
    }

    const made = await exportForAd(master, spec, plan);
    if ("failed" in made) {
      entries.push({ ...shared, status: "failed", reason: made.failed, failures: [] });
      continue;
    }

    /**
     * **만든 뒤에 검사한다.** 계획이 아니라 바이트를 본다(설계 §5.1).
     *
     * 검증에 걸려도 바이트는 함께 준다 — 무엇이 왜 걸렸는지 사람이 보고
     * 판단해야 한다. 「검증 실패」만 던지고 그림을 안 보여 주면 판단할 수가 없다.
     */
    const bytes = options.finish ? await options.finish(made.bytes) : made.bytes;
    const check = await checkAgainstSpec(bytes, spec);
    entries.push({
      ...shared,
      status: check.ok ? "ok" : "failed",
      ...(check.ok ? {} : { reason: check.failures.join(" · ") }),
      failures: check.failures,
      bytes,
      byteLength: bytes.length,
      quality: made.quality,
    });
  }
  return withShrink(master, entries);
}

/**
 * 축소 배율을 채운다.
 *
 * 원본 크기를 한 번만 읽어 전체에 나눠 쓴다 — 규격마다 다시 읽으면 디코드가
 * 규격 수만큼 늘어난다.
 */
async function withShrink(master: Buffer, entries: AdBatchEntry[]): Promise<AdBatchEntry[]> {
  const made = entries.filter((entry) => entry.bytes);
  if (!made.length) return entries;

  // sharp 를 여기서만 부르려고 동적으로 들인다 — 이 모듈의 나머지는 순수하다.
  // @ts-expect-error sharp 0.35.0 의 꾸러미 메타데이터가 선언을 가린다.
  const { default: sharp } = await import("sharp");
  const meta = await sharp(master, { limitInputPixels: 40_000_000 }).metadata();
  const sourceWidth: number = meta.width ?? 0;

  for (const entry of entries) {
    entry.shrink = entry.bytes && entry.target.width
      ? Number((sourceWidth / entry.target.width).toFixed(2))
      : undefined;
  }
  return entries;
}

/**
 * 조립 규격 한 장.
 *
 * **실패를 삼키지 않는다.** 배경 제거가 실패하면 그 규격만 실패로 두고 나머지는
 * 그대로 나온다 — 실패 지점이 생성 **뒤**로 옮겨가므로, 하나 때문에 전부 못
 * 받으면 **이미 쓴 돈이 통째로 버려진다**(설계 §9.3).
 */
async function assembleFor(
  spec: AdSpec,
  master: Buffer,
  options: ExportBatchOptions,
  cache: { object?: Buffer },
): Promise<AssembledBanner | { failed: string }> {
  if (!options.cutout) {
    return { failed: "투명 배경을 만들 준비가 안 됐습니다." };
  }
  try {
    // 마스터당 한 번. 두 번째 규격부터는 같은 오브젝트를 쓴다.
    cache.object ??= await options.cutout(master);
    return await assembleBanner(spec.target, cache.object);
  } catch (error) {
    return { failed: error instanceof Error ? error.message : "투명 배너를 만들지 못했습니다." };
  }
}
