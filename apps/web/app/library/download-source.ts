/**
 * 내려받을 주소와 파일 이름.
 *
 * 계정 보관분은 무손실 WebP 로 저장된다. 요즘 프로그램은 다 열지만 오래된
 * 편집기는 못 열어서, **받을 때는 예전처럼 PNG 로 되돌려 준다.** 무손실로
 * 넣었으므로 되돌린 그림은 원본과 픽셀이 완전히 같다.
 *
 * 브라우저 저장분은 손대지 않는다 — 그쪽은 저장 형식을 바꾸지 않았고,
 * 서버를 거치지도 않는다.
 */
export interface DownloadSourceInput {
  /** 계정 보관분일 때만 있다. 없으면 브라우저 저장분이다. */
  accountItemId?: string;
  index: number;
  image: string;
  title: string;
}

/** data URL 이나 서명 URL 에서 확장자를 유추한다(기본 png). */
function extensionOf(source: string): string {
  const dataMatch = source.match(/^data:image\/([a-z0-9.+-]+)/i);
  if (dataMatch) {
    // "svg+xml" 처럼 뒤에 붙는 건 잘라 파일 이름에 안전한 것만 남긴다.
    const raw = dataMatch[1]!.toLowerCase().split("+")[0]!;
    return raw === "jpeg" ? "jpg" : raw;
  }
  // 서명 URL 에는 쿼리스트링이 붙는다. 경로 쪽 확장자만 본다.
  const pathMatch = source.split("?")[0]!.match(/\.([a-z0-9]+)$/i);
  const raw = (pathMatch?.[1] ?? "png").toLowerCase();
  return raw === "jpeg" ? "jpg" : raw;
}

export function downloadSource(input: DownloadSourceInput): { url: string; filename: string } {
  const order = String(input.index + 1).padStart(2, "0");

  if (input.accountItemId) {
    return {
      url: `/api/library/${encodeURIComponent(input.accountItemId)}/images/${input.index}/file?format=png`,
      filename: `${input.title}-${order}.png`,
    };
  }

  return { url: input.image, filename: `${input.title}-${order}.${extensionOf(input.image)}` };
}
