import { errorLogText } from "../easy/log-text";

/**
 * **검수가 왜 버렸는지 서버 기록에 한 줄 남긴다**(2026-10-07).
 *
 * 까닭은 오류 봉투의 `detail`(코어가 적은 불합격 결함 목록)에만 있었다. 그래서
 * nano-banana 일반판이 3/3 불합격한 원인을 알 수 없었다. 코어는 바꾸지 않고 그 칸을 읽는다.
 *
 * 결함 종류 · 자리 · 심각도만 남긴다. 검수 모델의 설명(`evidence`)에는 사용자 카피가
 * 섞일 수 있어 뺀다. 값은 소문자 이름 꼴일 때만 싣는다 — 낯선 글이 기록에 새지 않게.
 */
export function logQaRejection(sectionId: string, envelope: { code?: string; detail?: string }): void {
  if (envelope.code !== "PDP_IMAGE_QA_REJECTED") return;
  console.warn(`[pdp] 품질검수 불합격 (${errorLogText(sectionId.slice(0, 40))}): ${defectSummary(envelope.detail)}`);
}

function defectSummary(detail?: string): string {
  let defects: unknown;
  try {
    defects = JSON.parse(detail ?? "");
  } catch {
    return "(결함 목록을 읽지 못했습니다)";
  }
  if (!Array.isArray(defects) || defects.length === 0) return "(결함 목록 없음)";
  return defects
    .map((defect: { type?: unknown; location?: unknown; severity?: unknown } | null) => {
      const location = defect?.location === undefined ? "" : `@${이름(defect.location)}`;
      return `${이름(defect?.type)}${location}/${이름(defect?.severity)}`;
    })
    .join(", ");
}

const 이름 = (value: unknown) => (typeof value === "string" && /^[a-z_]{1,40}$/.test(value) ? value : "?");
