import { billableFetch } from "../../lib/billable-fetch";

/**
 * **「쉽게」 카드뉴스 주소로 보낸다**(2 · 3단계). 크레딧이 깎일 수 있는 요청이라 식별자를
 * 붙여 보낸다(`billableFetch`). 실패는 서버가 준 말 그대로 던진다(다시 눌러도 막히는 것은
 * `retryable: false`).
 */
export async function cardnewsRequest(body: Record<string, unknown>) {
  const response = await billableFetch("/api/easy/cardnews", { body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!json.ok) {
    throw Object.assign(new Error(json.message ?? "하지 못했습니다."), { retryable: json.retryable !== false });
  }
  return json;
}
