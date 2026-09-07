import { createFalClient } from "@fal-ai/client";

/**
 * 배경을 지워 오브젝트만 남긴다.
 *
 * 설계: `docs/superpowers/plans/2026-09-07-ad-assembly-engine.md` §2.3 · §3.1
 *
 * **왜 `IMAGE_MODELS` 에 안 넣는가.** 그 목록은 「사용자가 고르는 그림 모델」이다.
 * 배경 제거는 고르는 것이 아니라 **광고 파생의 한 단계**라, 넣으면 포스터·
 * 카드뉴스 만들기 화면의 모델 버튼에 「BiRefNet」이 뜬다(계약 2).
 *
 * **왜 기존 fal 큐 클라이언트를 안 쓰는가.** `lib/fal/queue.ts:33` 의
 * `jobResult` 는 `data.images` 를 보는데 birefnet 은 **`image`(단수)** 로
 * 돌려준다. 그 클라이언트는 **예외 없이 빈 배열**을 준다 — 던지지도 않아서
 * 「배경 제거가 조용히 아무것도 안 돌려주는」 고장이 된다. 그것을 고치면
 * 카드뉴스·포스터가 함께 영향받으므로 여기서 자기 몫만 읽는다.
 *
 * **실측**(2026-09-07): 2048×1072 에서 **3.7초 · $0.00296**. 마스터 생성
 * ($0.219)의 1/74 다 — 아끼는 것은 돈이 아니라 시간이다.
 */

/** 세부에 강한 쪽. `imageutils/rembg` 도 되지만 더 느리다(2.8초 대 2.2초). */
export const BACKGROUND_REMOVAL_ENDPOINT = "fal-ai/birefnet/v2";

/**
 * 배경 제거의 절대 시한.
 *
 * **없으면 회원의 슬롯이 영구히 잠긴다**(설계 §9.2). `withRenderSlot` 은 회원당
 * 1 이라 본인도 재시도를 못 한다. fal 클라이언트에는 폴링 상한이 없다.
 *
 * 60초는 「얼마나 걸리는가」가 아니라 **「이만큼 지나면 뭔가 잘못됐다」**이다 —
 * 실측이 3.7초이므로 16배 여유다.
 */
export const BACKGROUND_TIMEOUT_MS = 60_000;

/** `subscribe` 하나만 쓴다. 시험이 갈아 끼울 수 있게 좁게 받는다. */
export interface FalSubscriber {
  subscribe(endpoint: string, options: { input: Record<string, unknown> }): Promise<unknown>;
}

export function createBackgroundRemover(apiKey: string): FalSubscriber {
  return createFalClient({ credentials: apiKey, retry: { maxRetries: 0 } }) as FalSubscriber;
}

/**
 * 올려 둔 그림에서 배경을 지우고 결과 주소를 돌려준다.
 *
 * **빈 값을 조용히 주지 않는다.** 주소를 못 읽으면 던진다 — 배경 제거가
 * 실패했는데 파이프라인이 계속 가면 **전부 투명한 배너**가 나오고, 그것은
 * 픽셀·형식·용량 검사를 전부 통과한다(설계 §6.2).
 */
export async function removeBackground(
  imageUrl: string,
  fal: FalSubscriber,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const limit = options.timeoutMs ?? BACKGROUND_TIMEOUT_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`배경을 지우는 데 너무 오래 걸립니다(${Math.round(limit / 1000)}초).`)),
      limit,
    );
  });

  try {
    const result = await Promise.race([
      fal.subscribe(BACKGROUND_REMOVAL_ENDPOINT, { input: { image_url: imageUrl } }),
      expiry,
    ]);
    // **`image` 단수다.** `images` 를 보면 조용히 빈 값이 된다.
    const url = (result as { data?: { image?: { url?: string } } })?.data?.image?.url;
    if (!url) throw new Error("배경을 지운 그림을 받지 못했습니다.");
    return url;
  } finally {
    clearTimeout(timer);
  }
}
