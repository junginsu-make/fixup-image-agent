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
 * 그대로 합치면 같은 파생이 두 번 돈다 — 요청당 sharp 인코드가 70~90회에서
 * 140~180회가 된다. 여기서 한 번 뽑아 **미리보기와 ZIP 이 같은 바이트를 쓴다.**
 *
 * ZIP 은 만들지 않는다. `jszip` 이 이미 화면 쪽에 있고
 * (`app/library/ResultViewer.tsx:153`) 거기서 묶는 것이 이 저장소의 결이다.
 */

/**
 * 한 요청이 뽑을 수 있는 규격 수.
 *
 * 이 경로는 규격 하나당 크롭 1회 + 용량 이분 탐색 6~8회를 돈다. 상한이 없으면
 * **목록을 길게 보내는 것만으로 서버를 밀어붙일 수 있다.** 실제 규격 수보다는
 * 넉넉해야 한다 — 전부 고르는 것을 막으면 기능이 반쪽이 된다.
 */
export const MAX_SPECS_PER_REQUEST = 24;

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
}

/**
 * 기능을 통째로 끄는 스위치 (설계 §4.1 계약 5).
 *
 * `isLocalStoreEnabled` 와 같은 모양이다 — **켜는 것이 명시적이어야 한다.**
 * 오타나 빈 값으로 켜지면 스위치가 아니다.
 */
export function isAdExportEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.AD_EXPORT === "1";
}

export async function exportBatch(master: Buffer, specIds: string[]): Promise<AdBatchEntry[]> {
  // 같은 규격을 여러 번 골라도 한 번만 뽑는다. 순서는 고른 순서를 지킨다.
  const wanted = [...new Set(specIds)];
  if (!wanted.length) throw new Error("규격을 하나 이상 고르세요.");
  if (wanted.length > MAX_SPECS_PER_REQUEST) {
    throw new Error(`한 번에 ${MAX_SPECS_PER_REQUEST}개까지 뽑을 수 있습니다.`);
  }

  const entries: AdBatchEntry[] = [];
  for (const id of wanted) {
    const spec = AD_SPECS.find((entry) => entry.id === id);
    if (!spec) {
      // **조용히 빠뜨리지 않는다.** 화면이 고른 것과 받은 것을 맞대 볼 수 있어야 한다.
      entries.push({
        specId: id, label: id, portal: "google", product: "?", required: false,
        sourceKind: "reference", format: "jpg", target: { width: 0, height: 0 },
        status: "failed", reason: `모르는 규격입니다: ${id}`, failures: [],
      });
      continue;
    }

    const shared = {
      specId: spec.id, label: spec.label, portal: spec.portal, product: spec.product,
      required: spec.required, sourceKind: spec.sourceKind, format: spec.format,
      target: spec.target,
      ...(spec.safeArea ? { safeArea: spec.safeArea } : {}),
    };

    const made = await exportForAd(master, spec, planDerivation(spec));
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
    const check = await checkAgainstSpec(made.bytes, spec);
    entries.push({
      ...shared,
      status: check.ok ? "ok" : "failed",
      ...(check.ok ? {} : { reason: check.failures.join(" · ") }),
      failures: check.failures,
      bytes: made.bytes,
      byteLength: made.bytes.length,
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
