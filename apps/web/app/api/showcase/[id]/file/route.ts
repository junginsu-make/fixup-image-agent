import { readShowcaseImage } from "../../store";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * 갤러리 그림 한 장. **로그인 없이 읽는다.**
 *
 * 서명 URL 을 쓰지 않는다. 서명 URL 은 반드시 만료되는데, 첫 화면은 캐시와
 * 검색엔진을 타고 오래 남는다. 만료를 길게 잡아 피하는 것은 "언제 깨질지
 * 모르는 상태"를 미루는 것일 뿐이다.
 *
 * 그렇다고 버킷을 공개로 바꿀 수도 없다. 같은 버킷에 회원들의 출시 전
 * 기획물이 들어 있어, 경로만 알면 누구나 보게 된다.
 *
 * 그래서 비공개 버킷의 바이트를 서버가 직접 흘려 준다. 나가는 길이 이 하나뿐이라
 * `visible` 을 끄면 그 순간 막힌다.
 */
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const image = await readShowcaseImage(id);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(Uint8Array.from(image.bytes), {
    headers: {
      "content-type": image.mimeType,
      // 공개 그림이라 중간 캐시에 두어도 된다. 다만 관리자가 내렸을 때
      // 하루 넘게 남아 있으면 곤란하므로 길게 잡지 않는다.
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
