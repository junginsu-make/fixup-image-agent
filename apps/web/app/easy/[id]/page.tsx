import { notFound } from "next/navigation";
import { EasyClient } from "../easy-client";
import { EASY_RATIO, defaultEasyImageModel, easyImageModels, loadEasyConversation } from "../_components/load";

export const dynamic = "force-dynamic";

/**
 * 대화 하나.
 *
 * **남의 대화는 못 본다.** 저장소가 `userId` 로 걸러 `undefined` 를 주고, 여기서
 * 404 로 끝낸다. 표에도 RLS 가 걸려 있어 두 겹이다 — 어느 한쪽이 뚫려도 다른
 * 쪽이 막는다.
 */
export default async function EasyConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const loaded = await loadEasyConversation(id);
  if (!loaded) notFound();

  return (
    <EasyClient
      conversationId={id}
      initialMessages={loaded.messages}
      initialUrls={loaded.urls}
      imageModels={easyImageModels()}
      defaultImageModel={defaultEasyImageModel()}
      ratioId={EASY_RATIO}
    />
  );
}
