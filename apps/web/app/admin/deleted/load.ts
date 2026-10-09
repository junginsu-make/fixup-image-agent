import "server-only";

import { listCharacters } from "../../../lib/characters";
import { listDeletedReferenceImages } from "../../../lib/reference-images";
import { listDeletedConversations } from "../../../lib/easy/deleted-conversations";
import type { UserRole } from "../../../lib/membership/types";
import type { DeletedCharacterItem, DeletedConversationItem, DeletedReferenceItem } from "./deleted-panel";

/**
 * 삭제 보관 탭이 읽는 것 — **회원이 지운 것만**(2026-10-08 계획 2단계). 관리자 확인은 `admin/layout.tsx` 의
 * `requireAdmin()` 이 한다. 화면에는 고를 그림 한 장(목록용 사본 먼저)만 넘긴다.
 */
export async function loadDeletedMaterials(viewer: { userId: string; role: UserRole }): Promise<{
  characters: DeletedCharacterItem[];
  references: DeletedReferenceItem[];
  conversations: DeletedConversationItem[];
}> {
  const [characters, references, conversations] = await Promise.all([
    listCharacters(viewer.userId, null, { allMembers: true, deleted: true }),
    listDeletedReferenceImages(viewer),
    listDeletedConversations(),
  ]);
  return {
    characters: characters.map((character) => {
      const front = character.views.find((view) => view.angle === "front") ?? character.views[0];
      return {
        id: character.id,
        name: character.name,
        ownerEmail: character.ownerEmail ?? null,
        deletedAt: character.deletedAt ?? "",
        imageUrl: front ? front.thumbUrl ?? front.url : null,
      };
    }),
    references: references.map((image) => ({
      id: image.id,
      title: image.title || "(제목 없음)",
      ownerEmail: image.ownerEmail,
      deletedAt: image.deletedAt ?? "",
      imageUrl: image.thumbUrl ?? image.signedUrl,
    })),
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      ownerEmail: conversation.ownerEmail,
      deletedAt: conversation.deletedAt,
    })),
  };
}
