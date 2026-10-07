import { observeAccountResponse } from "../../lib/membership/account-events";
import { billableFetch } from "../../lib/billable-fetch";
import type { CardnewsProjectLike } from "./cardnews-view";
import { CARDNEWS_OFFLINE, orSay } from "./net-say";

/**
 * **「쉽게」 카드뉴스 주소로 보낸다**(2 · 3단계). 크레딧이 깎일 수 있는 요청이라 식별자를
 * 붙여 보낸다(`billableFetch`). 실패는 서버가 준 말 그대로 던진다(다시 눌러도 막히는 것은
 * `retryable: false`).
 */
export async function cardnewsRequest(body: Record<string, unknown>) {
  const response = await orSay(billableFetch("/api/easy/cardnews", { body: JSON.stringify(body) }), CARDNEWS_OFFLINE);
  const json = await response.json().catch(() => ({}));
  observeAccountResponse(json, true);
  if (!json.ok) {
    throw Object.assign(new Error(json.message ?? "하지 못했습니다."), { retryable: json.retryable !== false });
  }
  return json;
}

/**
 * **작업을 다시 읽는다**(카드뉴스 화면과 같은 읽기 주소, 그림 주소를 새로 서명해 준다).
 * 답을 못 받았을 때 서버가 이미 시작했는지 본다(2단계 「이대로 만들기」 · 3단계 다시 만들기).
 * 못 읽으면 `undefined`.
 */
export async function readCardnewsProject(projectId: string): Promise<(CardnewsProjectLike & { title?: string }) | undefined> {
  try {
    const body = await (await fetch(`/api/sns/projects/${projectId}/plan`, { cache: "no-store" })).json();
    observeAccountResponse(body);
    return body.ok ? body.project : undefined;
  } catch {
    return undefined;
  }
}
