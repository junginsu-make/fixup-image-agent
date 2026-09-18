import { redirect } from "next/navigation";
import { requireActiveMember } from "../../lib/membership/server";
import { easyStoreForUser } from "../../lib/easy/store";

export const dynamic = "force-dynamic";

/**
 * 새 대화.
 *
 * **대화를 만들고 그 주소로 옮긴다.** 여기서 화면을 그리고 첫 말을 보낼 때
 * 대화를 만드는 쪽도 생각했는데, 그러면 「보내기」한 번에 두 가지가 일어나고
 * 하나가 실패할 때 어느 쪽인지 가리기 어렵다.
 *
 * 만들고 옮기면 주소가 곧 대화 id 다 — 새로고침해도 그 대화가 열리고, 레일의
 * 「지금 보고 있는 것」 표시도 저절로 맞는다.
 *
 * **제목은 비워 둔다.** 첫 프롬프트로 짓는다(설계 §4-1) — `generate` 가 그때
 * 채운다. LLM 을 한 번 더 부르지 않는다.
 */
export default async function EasyNewPage() {
  const membership = await requireActiveMember();
  const store = easyStoreForUser(membership.user.id);

  /*
   * **빈 대화가 이미 있으면 그것으로 간다.**
   *
   * 누를 때마다 새로 만들었더니 「제목 없는 대화」가 넷 쌓였다(2026-09-18
   * 확인). 아무 말도 안 하고 나갔다 다시 들어오기만 해도 하나씩 는다.
   *
   * 제목은 첫 프롬프트가 붙이므로, **제목이 비었다 = 아직 아무 말도 안 했다**
   * 이다. 그런 대화가 둘일 이유가 없다.
   *
   * 목록은 최근 것부터 오므로 맨 앞의 빈 것을 쓴다.
   */
  const 비어있던것 = (await store.listConversations()).find((one) => !one.title);
  if (비어있던것) redirect(`/easy/${비어있던것.id}`);

  const conversation = await store.createConversation("");
  redirect(`/easy/${conversation.id}`);
}
