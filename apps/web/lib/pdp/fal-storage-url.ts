/**
 * **우리가 fal 저장소에 올린 주소만 그림 모델에 넘긴다**(설계 2026-10-08 §4.5).
 *
 * 서버는 이 주소를 내려받지 않는다 — fal 만 가져간다. 그래도 아무 주소나 받으면
 * 남의 그림이나 엉뚱한 곳을 모델 입력으로 끼울 수 있다.
 *
 * 임시값 — 0단계 실측 전, 설계 §9.1. 실제 업로드가 돌려주는 호스트를 보고 이 한 칸을 맞춘다.
 */
export const FAL_STORAGE_HOSTS: readonly string[] = ["fal.media"];

export function isFalStorageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return FAL_STORAGE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}
