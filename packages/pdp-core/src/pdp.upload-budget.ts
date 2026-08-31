/**
 * 업로드 요청 크기 예산.
 *
 * 라이브러리에 여러 장을 한 번에 올리면 요청 하나가 아주 커진다. 섹션 이미지
 * 한 장이 4~5MB고 base64 로 담으면 1.33배가 된다. 20장이면 130MB다.
 *
 * 운영 서버는 RAM 911MB 에 여유가 445MB다. 그만한 JSON 을 파싱하다 프로세스가
 * 죽으면 사용자는 원인을 알 수 없다 — 그냥 "저장이 안 된다"로 보인다.
 * Caddy 에도 본문 제한이 없어 막아주는 것이 없다.
 *
 * 그래서 클라이언트가 예산에 맞춰 나눠 보낸다.
 */

/** 한 요청에 담을 수 있는 이미지 총량. 서버 여유 메모리의 1/20 수준으로 잡는다. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** base64 문자 수에서 실제 바이트를 추정한다. 4글자가 3바이트다. */
export function base64Bytes(base64: string) {
  return Math.floor((base64.length * 3) / 4);
}

/**
 * 예산에 맞게 묶는다.
 *
 * 한 장이 예산보다 커도 버리지 않는다 — 혼자 한 묶음으로 보낸다. 사용자가
 * 올린 것을 소리 없이 빠뜨리는 것이 더 나쁘다.
 */
export function planUploadBatches<T extends { base64: string }>(items: readonly T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const size = base64Bytes(item.base64);

    if (current.length > 0 && currentBytes + size > MAX_UPLOAD_BYTES) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(item);
    currentBytes += size;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}
