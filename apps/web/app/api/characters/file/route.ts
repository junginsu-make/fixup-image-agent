import { authenticateApiMember } from "../../../../lib/membership/api";
import { readCharacterFile } from "../../../../lib/characters";
import { isLocalStoreEnabled } from "../../../../lib/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 로컬 모드에서 각도 그림을 내려 준다.
 *
 * 운영은 서명 URL 을 쓰므로 이 길이 필요 없다. 로컬은 파일이 디스크에 있고
 * 브라우저가 바로 못 읽으니 여기를 거친다.
 *
 * **경로를 그대로 믿지 않는다.** 저장된 줄 중에 그 경로가 있고 그 줄이 이
 * 사용자의 것일 때만 내려 준다. 경로를 파일 시스템에 바로 넘기면 남의 파일이나
 * 앱 바깥의 파일을 읽어 갈 수 있다.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  if (!isLocalStoreEnabled()) {
    return Response.json({ ok: false, message: "운영에서는 서명 URL 을 씁니다." }, { status: 404 });
  }

  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path) return Response.json({ ok: false, message: "경로가 없습니다." }, { status: 400 });

  try {
    const file = await readCharacterFile(auth.member.userId, path);
    if (!file) return Response.json({ ok: false, message: "그림을 찾지 못했습니다." }, { status: 404 });

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.mimeType,
        // 각도를 다시 만들면 같은 경로에 새 그림이 온다. 캐시하면 옛것이 보인다.
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "그림을 읽지 못했습니다." },
      { status: 500 },
    );
  }
}
