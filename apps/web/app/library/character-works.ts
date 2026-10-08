import type { LibraryWork } from "./library-works";

/**
 * **캐릭터도 생성 결과다**(2026-10-08 사용자 — 「이 시스템에서 생성한 모든 것은 생성 결과」).
 *
 * 캐릭터는 작업물과 다른 표(`characters`)에 있어 「전체」에 안 나왔다. 정면 한 장을 표지로 세운 카드로
 * 바꿔 작업물 목록에 섞는다. 누르면 각도를 넘겨 보고(`images` 를 미리 싣는다 — 목록이 이미 서명해 준다),
 * 「과정 보기」는 캐릭터 상세로 간다. 지우기는 캐릭터 만들기 화면이 한다 — 캐릭터 표와 참고 이미지에
 * 함께 있어 여기서 지우면 한쪽만 사라진다(`works-tab.tsx` 의 `canDelete`).
 *
 * 도구 칸은 예전 캐릭터 결과와 같이 `create` + `origin: "character"` 로 둔다 — 거르기·이름표가
 * 그 짝으로 캐릭터를 알아본다(`work-filter.ts`).
 */

interface CharacterView {
  angle: string;
  url: string | null;
  thumbUrl?: string | null;
}

export interface CharacterEntry {
  id: string;
  name: string;
  kind: string;
  look: string;
  createdAt: string;
  views: CharacterView[];
  mine?: boolean;
  ownerEmail?: string | null;
}

/** 서명 주소의 경로 쪽 확장자. 캐릭터 그림은 png·jpg·webp 가 섞여 있다(캐릭터 화면과 같은 규칙). */
function extensionOf(url: string): string {
  return url.split("?")[0]!.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "png";
}

export function characterWorks(characters: readonly CharacterEntry[], labels: Readonly<Record<string, string>>): LibraryWork[] {
  return characters.map((character) => {
    const shown = character.views.filter((view): view is CharacterView & { url: string } => Boolean(view.url));
    // 정면이 없는 옛 캐릭터는 처음 장으로 대신한다.
    const cover = shown.find((view) => view.angle === "front") ?? shown[0];
    return {
      id: character.id,
      tool: "create" as const,
      origin: "character" as const,
      title: character.name,
      status: "done",
      createdAt: character.createdAt,
      updatedAt: character.createdAt,
      // 큰 창의 「만든 사람」. 목록은 남의 것에만 이메일을 준다 — 내 것은 「나」.
      ownerEmail: character.mine === false ? character.ownerEmail ?? null : "나",
      mine: character.mine !== false,
      cover: cover ? cover.thumbUrl ?? cover.url : null,
      imageCount: shown.length,
      images: shown.map((view, index) => ({
        url: view.url, label: labels[view.angle] ?? view.angle, index, ext: extensionOf(view.url),
      })),
      intent: "",
      settings: [["장수", `${shown.length}장`]],
      href: `/characters/${character.id}`,
      characterId: character.id,
    };
  });
}

/** 캐릭터를 못 읽었을 때 화면이 보이는 말. */
export const CHARACTERS_UNREAD = "캐릭터를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.";

/**
 * 캐릭터 목록을 읽어 카드로 바꾼다. **못 읽어도 목록을 비우지 않는다** — 다른 생성 결과는 이미 와 있다.
 * 그 대신 까닭을 `onError` 로 알린다. 관리자가 전체 회원을 볼 때는 `scope=all`(서버가 관리자에게만
 * 넓힌다), 아니면 내 것만.
 */
export async function readCharacterWorks(allMembers: boolean, onError?: (message: string) => void): Promise<LibraryWork[]> {
  try {
    const response = await fetch(allMembers ? "/api/characters?scope=all" : "/api/characters", { cache: "no-store" });
    const body = await response.json() as {
      ok?: boolean;
      characters?: CharacterEntry[];
      angles?: Array<{ id: string; label: string }>;
      sheet?: { id: string; label: string };
    };
    if (!body?.ok) {
      onError?.(CHARACTERS_UNREAD);
      return [];
    }
    const labels = Object.fromEntries(
      [...(body.angles ?? []), ...(body.sheet ? [body.sheet] : [])].map((angle) => [angle.id, angle.label]),
    );
    // 회원 목록은 같은 팀 사람 것이 섞여 올 수 있다. 작업물과 같이 내 것만 둔다.
    return characterWorks((body.characters ?? []).filter((character) => allMembers || character.mine !== false), labels);
  } catch {
    onError?.(CHARACTERS_UNREAD);
    return [];
  }
}
