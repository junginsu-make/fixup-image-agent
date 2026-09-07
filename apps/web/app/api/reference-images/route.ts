import { z } from "zod";
import { hasFullScope, viewerFrom } from "../../../lib/access/core";
import { authenticateApiMember } from "../../../lib/membership/api";
import { listReferenceImages, localFileUrl, saveReferenceImage } from "../../../lib/reference-images";
import { isLocalStoreEnabled } from "../../../lib/local-store";
import { ReferencePurposeSchema } from "../reference-sets/schema";
import { anyTeamExists, teamIdOf } from "../../../lib/teams/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

/**
 * 라이브러리의 참고 이미지.
 *
 * 로컬이든 운영이든 이 길 하나만 쓴다. 전에는 로컬에서만 열리고 운영에서는
 * 404 였는데, 그걸 부르던 화면은 실패를 조용히 삼켜 "저장된 이미지가 없다"로
 * 보였다.
 *
 * **팀을 안 쓰는 동안은 회원 모두에게 같다.** 참고 이미지는 공용 창고였다.
 * 팀이 하나라도 생기면 같은 팀 것으로 좁아진다 — 본보기는 어떤 브랜드를
 * 준비 중인지가 그대로 드러나는 것이라, 남의 팀 것이 보이면 안 된다.
 *
 * 각 줄에 `mine` 을 실어, 화면이 지우기 단추를 자기 것에만 보일 수 있게 한다.
 */

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    // 팀은 세션에서 꺼낸다. 본문이나 주소로 받으면 남의 팀 ID 를 적어 보내는
    // 것만으로 남의 본보기를 볼 수 있다.
    const [teamId, hasTeams] = await Promise.all([
      teamIdOf(auth.member.userId),
      anyTeamExists(),
    ]);
    const images = await listReferenceImages({
      userId: auth.member.userId,
      role: auth.member.profile.role,
      teamId,
      anyTeamExists: hasTeams,
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

export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const form = await request.formData();
    const id = IdSchema.parse(form.get("id"));
    const title = z.string().max(200).parse(form.get("title") ?? "");
    const purpose = ReferencePurposeSchema.parse(form.get("purpose"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("이미지 파일을 골라 주세요.");

    const image = await saveReferenceImage({
      userId: auth.member.userId,
      id,
      title,
      purpose,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
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
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "참고 이미지를 올리지 못했습니다." },
      { status: 400 },
    );
  }
}
