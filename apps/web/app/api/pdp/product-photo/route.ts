import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { createFalUploader } from "../../../../lib/fal/upload";
import { withLlmMeter } from "../../../../lib/llm/meter";
import { errorLogText } from "../../../../lib/easy/log-text";
import { BodyLimitError, readBoundedBody } from "../../../../lib/pdp/request";
import { isFalStorageUrl } from "../../../../lib/pdp/fal-storage-url";
import { PRODUCT_PHOTO_MAX_BYTES, prepareProductPhoto } from "../../../../lib/pdp/product-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * **제품 원본을 한 번만 올린다**(설계 2026-10-08 §4).
 *
 * 섹션 요청마다 원본을 몸통에 실으면 서버가 큰 그림을 그림이 끝날 때까지 쥐고 있다.
 * 여기서 한 번 fal 저장소에 올리고 주소만 돌려준다 — 포스터·카드뉴스·리디자인이
 * 이미 쓰는 길(`lib/fal/upload.ts`, 1시간 뒤 지워짐)이다.
 *
 * 시간당 횟수는 레퍼런스 올리기와 **같은 칸**(`reference_analyze`)을 쓴다. 새 칸은
 * DB 마이그레이션이 필요하다(설계 §4.4).
 */
const FAL_URL_LIFETIME_MS = 60 * 60 * 1000;
const UPLOAD_FAILED = "제품 사진을 올리지 못했습니다. 다시 시도해 주세요.";

function fail(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}

/**
 * 글 모델은 부르지 않지만 `reserveAiUsage` 가 있는 길은 모두 계량기를 연다
 * (`paid-route-settle-contract` 가 파일 기준으로 센다). 안 열면 이 요청의 기록이 문맥 없이 남는다.
 */
export async function POST(req: Request) {
  return withLlmMeter(() => upload(req));
}

async function upload(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  let bytes: Buffer;
  try {
    bytes = await readBoundedBody(req, PRODUCT_PHOTO_MAX_BYTES + 1024);
  } catch (error) {
    return error instanceof BodyLimitError
      ? fail(413, "이미지 용량이 너무 큽니다. 20MB 이하로 올려 주세요.")
      : fail(400, "이미지를 읽지 못했습니다.");
  }

  // 문지기를 지난 뒤에 예약한다 — 깨진 입력으로 시간당 칸을 태우지 않게(style-references 와 같은 판단).
  const prepared = await prepareProductPhoto(bytes);
  if (!prepared.ok) return fail(prepared.status, prepared.message);

  const reservation = await reserveAiUsage(req, "reference_analyze", 0, freeCreditPlan("pdp:product-photo"), auth.member);
  if (!reservation.ok) return reservation.response;

  try {
    const url = await createFalUploader().uploadReference(prepared.bytes, prepared.mimeType);
    if (!isFalStorageUrl(url)) throw new Error(`unexpected upload host: ${new URL(url).hostname}`);
    await settleAiUsage(reservation, true, 0, undefined, { model: "", billableImages: 0 });
    return Response.json({ ok: true, url, expiresAt: Date.now() + FAL_URL_LIFETIME_MS });
  } catch (error) {
    await settleAiUsage(reservation, false, 0, "upload_failed", { model: "", billableImages: 0 });
    console.error("[pdp-product-photo] 업로드 실패", errorLogText(error));
    return fail(502, UPLOAD_FAILED);
  }
}
