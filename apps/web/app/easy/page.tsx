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
  const conversation = await easyStoreForUser(membership.user.id).createConversation("");
  redirect(`/easy/${conversation.id}`);
}
