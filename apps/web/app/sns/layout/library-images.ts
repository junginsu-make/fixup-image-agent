export interface LibraryImage {
  id: string;
  title: string | null;
  signedUrl: string | null;
}

/**
 * 라이브러리 목록을 받아 온다. **같이 부르면 한 번만 간다.**
 *
 * 한 화면에 그림 고르는 자리가 둘이다 — 로고 칸과 「이 레퍼런스처럼 칸을
 * 잡아 줘」. 각자 부르면 같은 목록을 두 번 받아 온다.
 *
 * 다만 **한 번 받고 굳히지는 않는다.** 방금 라이브러리에 올린 그림이 안
 * 보이면 안 된다. 지금 가는 중인 요청만 나눠 쓰고, 끝나면 다음 사람은 새로
 * 받아 온다.
 */

let inFlight: Promise<LibraryImage[]> | undefined;

interface LibraryResponse {
  ok: boolean;
  images?: LibraryImage[];
  message?: string;
}

async function load(fetcher: typeof fetch): Promise<LibraryImage[]> {
  const response = await fetcher("/api/reference-images", { cache: "no-store" });
  const payload = await response.json() as LibraryResponse;
  if (!payload.ok) throw new Error(payload.message ?? "참고 이미지를 불러오지 못했습니다.");
  return payload.images ?? [];
}

export function fetchLibraryImages(fetcher: typeof fetch = fetch): Promise<LibraryImage[]> {
  if (inFlight) return inFlight;
  // 성공이든 실패든 붙잡고 있지 않는다. 실패한 뒤에도 다시 시도할 수 있어야 한다.
  // 나눠 쓰는 것과 비우는 것이 같은 약속이어야 부르는 쪽이 둘로 갈리지 않는다.
  inFlight = load(fetcher).finally(() => { inFlight = undefined; });
  return inFlight;
}

/**
 * 레퍼런스를 여기서 바로 올린다.
 *
 * 「라이브러리에 먼저 올리고 오세요」는 하던 일을 끊는다. 칸을 읽어내려고
 * 온 사람에게 다른 화면을 다녀오라고 할 이유가 없다.
 */
export async function uploadLibraryImage(file: File): Promise<LibraryImage> {
  const form = new FormData();
  form.append("id", crypto.randomUUID());
  form.append("title", file.name.replace(/\.[^.]+$/, "").slice(0, 200));
  // 카드뉴스에서 쓸 그림이다. 라이브러리의 갈래와 같은 말을 쓴다.
  form.append("purpose", "cardnews");
  form.append("file", file);

  const response = await fetch("/api/reference-images", { method: "POST", body: form });
  const payload = await response.json() as { ok: boolean; image?: LibraryImage; message?: string };
  if (!payload.ok || !payload.image) throw new Error(payload.message ?? "그림을 올리지 못했습니다.");
  return payload.image;
}

/** 시험에서 앞선 요청이 남지 않게 비운다. */
export function resetLibraryImagesCache(): void {
  inFlight = undefined;
}
