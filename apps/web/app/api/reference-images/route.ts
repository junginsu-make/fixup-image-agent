import { z } from "zod";
import { hasFullScope, viewerFrom } from "../../../lib/access/core";
import { authenticateApiMember } from "../../../lib/membership/api";
import { listReferenceImages, localFileUrl, saveReferenceImage } from "../../../lib/reference-images";
import { isLocalStoreEnabled } from "../../../lib/local-store";
import { ReferencePurposeSchema } from "../reference-sets/schema";
import { teamIdOf } from "../../../lib/teams/store";
import { BodyLimitError, readBoundedBody } from "../../../lib/pdp/request";
import { inspectUploadedImage } from "../../../lib/pdp/image-gate";
import { REFERENCE_UPLOAD_BODY_LIMIT, REFERENCE_UPLOAD_MAX_MB } from "./limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

/**
 * **제목은 거절하지 않고 자른다**(2026-10-07 운영 보고).
 *
 * 화면은 파일 이름을 제목으로 보낸다. 전에는 200자를 넘으면 거절해, 이름이 긴
 * 그림(인터넷에서 받은 그림 등)은 한 장도 못 올렸다. 제목은 이름표일 뿐이다.
 *
 * **글자 단위로 자른다.** 칸 단위(`slice`)로 자르면 이모지(두 칸)가 반쪽만 남아
 * DB 가 거절한다(2026-10-07 리뷰). DB 의 `char_length` 도 글자 단위다.
 */
const TITLE_MAX = 200;
const TitleSchema = z.string().transform((value) => Array.from(value).slice(0, TITLE_MAX).join(""));

/**
 * 라이브러리의 참고 이미지.
 *
 * 로컬이든 운영이든 이 길 하나만 쓴다. 전에는 로컬에서만 열리고 운영에서는
 * 404 였는데, 그걸 부르던 화면은 실패를 조용히 삼켜 "저장된 이미지가 없다"로
 * 보였다.
 *
 * **올린 사람만 본다**(2026-09-28). 운영자는 전부 본다. 규칙은
 * `lib/teams/reference-scope.ts` 한 곳이다 — 팀이 붙어 있어도 넓히지 않는다.
 *
 * 각 줄에 `mine` 을 실어, 화면이 지우기 단추를 자기 것에만 보일 수 있게 한다.
 */

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    // 팀은 세션에서 꺼낸다. 본문이나 주소로 받으면 남의 팀 ID 를 적어 보내는
    // 것만으로 남의 본보기를 볼 수 있다.
    const images = await listReferenceImages({
      userId: auth.member.userId,
      role: auth.member.profile.role,
      teamId: await teamIdOf(auth.member.userId),
    });
    // 관리자는 남이 올린 것도 지울 수 있다. 화면이 그 단추를 낼지 정하려면
    // 알아야 하는데, 줄마다 실을 값이 아니라 보는 사람의 성질이다.
    // 화면은 이 값으로 「남이 올린 것에도 지우기를 낼지」를 가른다.
    // 서버의 실제 판단(`canModifyReferenceImage`)과 같은 곳에서 나와야
    // 화면에 뜬 단추가 눌리지 않는 일이 안 생긴다.
    const viewer = viewerFrom(auth.member);
    return Response.json({ ok: true, images, isAdmin: hasFullScope(viewer, "delete") });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "참고 이미지를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

/**
 * **낯선 바이트를 받는 문**(F-7-10-b).
 *
 * 전에는 `await request.formData()` 한 줄이었다. 용량 상한도, 그림인지 보는
 * 눈도 없었다. 인증된 회원이 임의 크기 파일로 서버 메모리를 **두 배로**
 * 부풀릴 수 있었고(원본 + `Uint8Array` 사본), 16383×16383 단색 PNG 는 수백
 * KB 로 눌리는데 펼치면 1GB 가 넘는다.
 *
 * 상세페이지 레퍼런스 문에는 이미 같은 문지기가 있다. 같은 회사의 같은
 * 위험인데 이 문만 열려 있었다 — **계약을 함께 쓴다.**
 *
 * **되던 것은 안 좁아진다.** 저장 쪽이 이미 PNG·JPG·WEBP 만 받고 화면
 * `accept` 도 같은 셋이다. 바뀌는 것은 **딱지 대신 바이트를 본다**는 것뿐이다.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    // 본문을 상한까지만 읽는다. `formData()` 는 끝까지 읽는다.
    const bytes = await readBoundedBody(request, REFERENCE_UPLOAD_BODY_LIMIT);
    form = await new Response(Uint8Array.from(bytes), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof BodyLimitError
          ? `이미지 용량이 너무 큽니다. ${REFERENCE_UPLOAD_MAX_MB}MB 이하로 올려 주세요.`
          : "요청 형식이 올바르지 않습니다.",
      },
      { status: error instanceof BodyLimitError ? 413 : 400 },
    );
  }

  try {
    const id = IdSchema.parse(form.get("id"));
    const title = TitleSchema.parse(form.get("title") ?? "");
    const purpose = ReferencePurposeSchema.parse(form.get("purpose"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("이미지 파일을 골라 주세요.");

    /*
      **딱지를 믿지 않고 바이트를 본다.** 화면이 준 `type` 은 확장자에서 온
      값이라, `.png` 라는 이름의 JPEG 이 `image/png` 로 저장돼 브라우저가 못
      여는 파일이 된다. 그림이 아닌 바이트도 여기서 끝난다.
    */
    const bytes = Buffer.from(await file.arrayBuffer());
    const inspected = await inspectUploadedImage(bytes);
    if (!inspected.ok) {
      return Response.json(
        { ok: false, message: inspected.message },
        { status: inspected.reason === "too_many_pixels" ? 413 : 400 },
      );
    }

    const image = await saveReferenceImage({
      userId: auth.member.userId,
      id,
      title,
      purpose,
      bytes: new Uint8Array(bytes),
      // 화면이 준 딱지가 아니라 **실제 바이트로 정한 값**이다.
      mimeType: inspected.mimeType,
    });

    // 로컬은 서명 URL 이 없어 자체 경로로 내려 준다. 운영은 목록을 다시
    // 부를 때 서명 URL 이 붙는다.
    // 목록 한 줄과 같은 모양으로 돌려준다 — 화면이 새로고침 없이 이 값을
    // 그대로 목록에 끼워 넣기 때문이다. 방금 내가 올렸으니 mine 은 참이다.
    return Response.json(
      {
        ok: true,
        image: {
          ...image,
          signedUrl: isLocalStoreEnabled() ? localFileUrl(image.id) : null,
          mine: true,
          ownerEmail: null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    /*
      **입력 검사 원문을 화면에 내지 않는다.** zod 오류의 `message` 는 JSON 배열
      이라 `[{"code":"too_big",…}]` 가 그대로 떴다(2026-10-07 운영 보고).
    */
    const message = error instanceof z.ZodError
      ? "그림 정보를 읽지 못했습니다. 다시 올려 주세요."
      : error instanceof Error ? error.message : "참고 이미지를 올리지 못했습니다.";
    return Response.json({ ok: false, message }, { status: 400 });
  }
}
