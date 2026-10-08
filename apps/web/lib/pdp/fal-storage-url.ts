/**
 * **우리가 fal 저장소에 올린 주소만 그림 모델에 넘긴다**(설계 2026-10-08 §4.5).
 *
 * 서버는 이 주소를 내려받지 않는다 — fal 만 가져간다. 그래도 아무 주소나 받으면
 * 남의 그림이나 엉뚱한 곳을 모델 입력으로 끼울 수 있다.
 *
 * 0단계 실측(2026-10-08, 설계 §9.1)에서 업로드 주소는 `https://v3b.fal.media/files/…` 였다.
 * fal 은 `v3.`·`v3b.` 처럼 앞자리를 바꿔 쓰므로 `fal.media` 와 그 하위 호스트를 받는다.
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
