import { authenticateApiMember, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { freeCreditPlan } from "../../../../lib/membership/credit-ledger";
import { readLlmMeter, withLlmMeter } from "../../../../lib/llm/meter";
import { inspectUploadedImage } from "../../../../lib/pdp/image-gate";
import { BodyLimitError, readBoundedBody } from "../../../../lib/pdp/request";
import {
  STYLE_REFERENCE_JSON_LIMIT,
  STYLE_REFERENCE_MAX_MB,
  STYLE_REFERENCE_MAX_PER_USER,
} from "../../../../lib/pdp/reference-limits";
import {
  deleteUserStyleReference,
  listUserStyleReferences,
  ownerOfStyleReference,
  countUserStyleReferences,
  registerUserStyleReference,
} from "../../../../lib/user-style-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 이미지 분석(Gemini) 한 번이라 오래 걸리지 않는다.
export const maxDuration = 120;

/**
 * 스타일 레퍼런스 — 전부 사용자별이다.
 *
 * 공용 레퍼런스는 두지 않는다. 전역이면 A 셀러가 올린 디자인이 B 셀러의 생성
 * 결과에 씌워진다. 그래서 등록 권한도 관리자가 아니라 **회원**이다. 자기 것만
 * 만들고 지우므로 남에게 영향이 없다.
 *
 * 클라이언트가 보낸 userId 는 믿지 않는다. 세션에서 꺼낸 것만 쓴다.
 *
 * ── 문지기가 없었다 (C-7 · C-10-c) ──────────────────────────
 *
 * 이 라우트는 `await req.json()` 한 줄로 본문을 받았다. 용량 상한도, 그림인지
 * 보는 눈도 없었다. 삭제는 빈 본문·잘못된 id 에 500 을 돌려주고, 남의 것을
 * 지우라고 해도 성공이라고 답했다.
 *
 * 설계 §12: 「Content-Length 만 신뢰하지 않는다. 수신 스트림·파일 수·MIME
 * signature·이미지 픽셀을 제한한다.」
 * 설계 §14.3(C-10-c): 「형식 오류 400, 소유권 없는 자원 404; 이미 삭제된 정상
 * ID 는 멱등 삭제 정책 명시.」
 */

/** UUID 모양. 이것이 아니면 표에 물어볼 것도 없다 — 형식 오류다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}

/**
 * 본문을 상한까지만 읽어 JSON 으로 푼다.
 *
 * **못 읽은 것과 너무 큰 것을 가른다.** 둘 다 500 으로 뭉뚱그리면 사용자는
 * 「서버가 터졌다」고 읽고 같은 파일을 계속 다시 올린다.
 */
async function readBody(req: Request): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; response: Response }
> {
  try {
    const bytes = await readBoundedBody(req, STYLE_REFERENCE_JSON_LIMIT);
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: fail(400, "요청 형식이 올바르지 않습니다.") };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch (error) {
    return error instanceof BodyLimitError
      ? { ok: false, response: fail(413, `이미지 용량이 너무 큽니다. ${STYLE_REFERENCE_MAX_MB}MB 이하로 올려 주세요.`) }
      : { ok: false, response: fail(400, "요청 형식이 올바르지 않습니다.") };
  }
}

/**
 * **200개 뒤를 조용히 숨기지 않는다**(C-7).
 *
 * 전에는 앞 200장만 돌려주면서 그 길이를 `total` 이라 불렀다. 240장을 올린
 * 사용자는 「200장」이라는 말과 함께 40장을 잃어버린다.
 *
 * 설계 §12: 「레퍼런스 목록은 pagination 을 제공한다. 200개 이후 보이지 않게
 * 숨기지 않는다.」
 *
 * `?limit=&offset=` 으로 쪽을 넘기고, `total` 은 **가진 수**를 말한다.
 * `nextOffset` 이 있으면 더 있다는 뜻이다.
 */
export async function GET(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    /*
      **안 준 것과 0 을 가른다.**

      `searchParams.get()` 은 없을 때 `null` 이고 `Number(null)` 은 **0** 이다.
      그대로 내려보내면 `?? 200` 이 0 을 「준 값」으로 보아 기본값이 안 먹고,
      조이기가 한 쪽을 **1장**으로 만든다. 화면 셋이 전부 `limit` 을 안 붙이므로
      목록이 통째로 한 장이 됐다 — 「200개 뒤를 숨기지 않겠다」던 변경이 1개
      뒤를 숨겼다(리뷰가 잡았다).

      빈 글자(`?limit=`)도 `Number("")` 가 0 이라 같이 막는다.
    */
    const asNumber = (name: string) => {
      const raw = url.searchParams.get(name);
      if (raw === null || raw.trim() === "") return undefined;
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    };
    const { failed, ...page } = await listUserStyleReferences(auth.member.userId, {
      limit: asNumber("limit"),
      offset: asNumber("offset"),
    });
    // **못 불러온 것을 「0장」이라고 하지 않는다.** 사라진 줄 알게 된다.
    if (failed) return fail(500, "레퍼런스를 불러오지 못했습니다.");
    return Response.json({ ok: true, ...page });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "레퍼런스를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

/**
 * **글 모델에 쓴 돈을 잰다**(C-4-b).
 *
 * 서술을 만드는 호출은 `registerUserStyleReference` 안쪽에서 일어난다. 계량기가
 * 감싸지 않으면 제공자가 적은 토큰이 **갈 곳이 없어 조용히 버려진다**
 * (`lib/llm/meter.ts`). 그동안 이 길이 그랬고, 레퍼런스만 올리는 사용은 원가
 * 집계에서 $0 으로 보였다.
 */
export async function POST(req: Request) {
  return withLlmMeter(() => register(req));
}

async function register(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const read = await readBody(req);
  if (!read.ok) return read.response;
  const body = read.body as { name?: string; source?: string; imageBase64?: string };

  const imageBase64 = String(body.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!imageBase64) return fail(400, "이미지가 없습니다.");

  /*
    **딱지를 믿지 않고 바이트를 본다.**

    화면이 준 `mimeType` 은 확장자에서 온 값이다. 그대로 쓰면 `.png` 라는
    이름의 JPEG 이 `image/png` 로 저장돼 브라우저가 못 여는 파일이 된다.
    그리고 그림이 아닌 바이트는 여기서 끝난다 — 전에는 그냥 창고에 올라가
    목록에 깨진 칸으로 남았다.
  */
  const bytes = Buffer.from(imageBase64, "base64");
  const inspected = await inspectUploadedImage(bytes);
  if (!inspected.ok) {
    return fail(inspected.reason === "too_many_pixels" ? 413 : 400, inspected.message);
  }

  /*
    **문지기를 지난 뒤에 예약한다**(C-9 와 같은 판단).

    깨진 입력은 모델을 부르기 전에 끝난다. 예약을 먼저 하면 값싼 실패로 한도를
    태울 수 있다. 크레딧은 0 이다 — 새로 그리는 것이 없다.

    칸은 상세페이지 분석과 **다르다**. 레퍼런스는 한자리에서 여러 장을 올리는
    일이 정상이라, 같은 칸을 쓰면 정리하다가 그날 기획이 막힌다
    (`lib/membership/hourly-limit.ts`).
  */
  /*
    **쌓인 총량도 본다**(C-7 의 「누적 목록」).

    본문 크기·화소·시간당 횟수는 막는데 **쌓이는 총량은 아무도 안 봤다.**
    실질 상한이 시간당 60회뿐이라 한 달이면 사실상 무제한이었다.

    문지기 뒤·예약 앞이다. 여기서 끝나는 것은 글 모델을 부르기 전이라 값싼
    실패로 한도를 태우지 않는다.

    **못 세면 막지 않는다.** 표가 잠깐 안 읽히는 날 올리기가 통째로 멎으면
    안 된다. 세는 것은 방어이지 기능이 아니다.
  */
  try {
    const 쌓인것 = await countUserStyleReferences(auth.member.userId);
    if (쌓인것 >= STYLE_REFERENCE_MAX_PER_USER) {
      return fail(
        409,
        `레퍼런스를 ${STYLE_REFERENCE_MAX_PER_USER}장까지 보관할 수 있습니다. 안 쓰는 것을 지운 뒤 다시 올려 주세요.`,
      );
    }
  } catch {
    // 못 셌다. 막지 않고 간다.
  }

  // 넷째 인자가 없으면 크레딧 장부로 옮긴 회원이 무조건 거절된다(2026-09-23 운영).
  // 그리는 것이 없으니 빈 목록이다.
  const reservation = await reserveAiUsage(req, "reference_analyze", 0, freeCreditPlan("pdp:style-reference"));
  if (!reservation.ok) return reservation.response;

  try {
    const result = await registerUserStyleReference({
      userId: auth.member.userId,
      name: String(body.name || "레퍼런스"),
      source: body.source === "generated" ? "generated" : "upload",
      imageBase64,
      // 화면이 준 딱지가 아니라 **실제 바이트로 정한 값**이다.
      mimeType: inspected.mimeType,
    });

    /*
      **장부에는 분석이 됐는지를 적는다.**

      열쇠가 없으면 `analyzeStyleImage` 는 모델을 **안 부르고** 빈 서술을 준다.
      그대로 성공으로 닫으면, 운영자가 키를 빠뜨린 날 사용자는 시간당 칸을 전부
      잃고도 서술을 하나도 못 받는다 — C-9 가 막으려던 바로 그 상황이다.

      `finalize_generation` 은 **성공으로 닫으면서 오류 코드를 남길 수 없다**
      (`p_success` 면 `error_code` 를 null 로 덮는다). 그래서 모델이 안 돈
      경우는 「분석 실패」로 적는다. 레퍼런스 자체는 저장됐고 크레딧도 0 이라
      사용자가 잃는 것은 없다 — 응답은 200 이다.

      **계량기가 안 감싼 경우는 먹는 쪽으로 둔다.** 「안 돌았다」와 「못 쟀다」는
      다르고, 모르는 것은 먹는 쪽이 안전하다(C-9 와 같은 판단).
    */
    const meter = readLlmMeter();
    const 모델이안돌았다 = result.ok && meter.metered && meter.calls === 0;
    const usage = await settleAiUsage(
      reservation,
      result.ok && !모델이안돌았다,
      0,
      result.ok ? (모델이안돌았다 ? "AI_KEY_MISSING" : undefined) : "register_failed",
      { model: "", billableImages: 0, llmUsd: meter.usd },
    );

    return Response.json({ ...result, usage }, { status: result.ok ? 200 : 422 });
  } catch (error) {
    await settleAiUsage(reservation, false, 0, "register_failed", {
      model: "",
      billableImages: 0,
      llmUsd: readLlmMeter().usd,
    });
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "레퍼런스를 등록하지 못했습니다." },
      { status: 500 },
    );
  }
}

/**
 * **삭제는 세 가지를 갈라 답한다**(C-10-c).
 *
 *   - 형식 오류(빈 본문 · id 없음 · UUID 아님) → **400**. 표에 물어볼 것도 없다
 *   - 있지만 내 것이 아님 → **404**. 성공이라고 답하면 지운 줄 안다
 *   - 없음(한 번도 없었거나 이미 지움) → **200, `deleted: false`**
 *
 * 마지막이 **멱등 삭제 정책**이다. 사용자가 원한 상태(그것이 없는 상태)가 이미
 * 이루어져 있으므로 오류가 아니다. 두 번 눌러도 같은 답을 준다.
 */
export async function DELETE(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const read = await readBody(req);
  if (!read.ok) return read.response;

  const id = String(read.body.id || "");
  if (!id) return fail(400, "id 가 없습니다.");
  if (!UUID.test(id)) return fail(400, "id 형식이 올바르지 않습니다.");

  try {
    /*
      **먼저 내 범위에서 지운다.** 지워졌으면 그것으로 끝이다.

      주인을 먼저 묻던 판은 정상 경로에서도 왕복이 한 번 더 들었고, 무엇보다
      **모든 삭제가 남의 행 존재 여부를 묻는 길**을 열어 두었다. 이 순서면
      그 질문은 지울 것이 없었을 때만 나간다.
    */
    const result = await deleteUserStyleReference(auth.member.userId, id);
    if (!result.ok) {
      return Response.json({ ok: false, message: result.message ?? "삭제하지 못했습니다." }, { status: 500 });
    }
    if (result.deleted) return Response.json({ ok: true, deleted: true });

    // 지울 것이 없었다. 남의 것이어서인가, 원래 없어서인가.
    const owner = await ownerOfStyleReference(id);
    return owner
      ? fail(404, "레퍼런스를 찾지 못했습니다.")
      : Response.json({ ok: true, deleted: false });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
