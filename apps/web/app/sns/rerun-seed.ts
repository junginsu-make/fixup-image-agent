import type { Attachment } from "@fixup/sns-core";
import type { ImageLook } from "@fixup/shared";
import type { SlotIntents } from "./_components/slot-intents";
import type { SourceDraft } from "./_components/source-input";
import type { SnsSpec } from "./_components/spec-picker";

/**
 * 이미 만든 카드뉴스의 **지난 단계로 돌아갈 때** 화면에 심을 값.
 *
 * 이미지 만들기는 01~03 을 누르면 빈 화면으로 보냈고, 카드뉴스는 **아예 못
 * 누르게** 막혀 있었다. 둘 다 「지난 단계를 볼 수 없다」는 같은 불편이다
 * (2026-09-16 사용자 보고).
 *
 * **원래 작업은 안 건드린다.** 고쳐서 만들면 새 작업이 하나 더 생긴다.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 값으로 잰다.
 */

export interface SnsSeed {
  title: string;
  toneNote: string;
  source: SourceDraft;
  attachments: Attachment[];
  intents: SlotIntents;
  spec: SnsSpec;
  /**
   * 못 들고 온 첨부 수.
   *
   * **조용히 빠지면 안 된다.** 남의 작업을 다시 만들 때는 첨부를 못 들고
   * 오는데, 말해 주지 않으면 사용자는 자기가 안 붙인 줄 안다.
   */
  droppedAttachments: number;
}

/** 이 작업이 읽는 모양. 옛 작업에는 없는 칸이 많아 전부 선택이다. */
interface SourceProject {
  title?: string | null;
  ratio?: string | null;
  language?: SnsSpec["language"] | null;
  modelId?: string | null;
  cardCountMode?: "auto" | "fixed" | null;
  cardCount?: number | null;
  toneNote?: string | null;
  data?: {
    source?: { kind?: string; text?: string } | null;
    attachments?: Attachment[] | null;
    attachmentIntents?: { cover?: string; body?: string; ending?: string } | null;
    look?: ImageLook | null;
    userInstruction?: string | null;
  } | null;
}

/**
 * 이 작업의 값을 새 작업 화면의 모양으로 옮긴다.
 *
 * **`mine` 이 아니면 첨부를 뺀다.** 첨부는 `assetPath` 로 저장되는데 그 경로의
 * 첫 칸이 **원래 회원의 id** 다 — 버킷 정책이 첫 칸으로 소유자를 판정한다
 * (`docs/DEPLOY.md`). 그대로 실어 새 작업을 만들면 남의 파일을 가리키는 내
 * 작업이 되고, 그 회원이 지우면 내 것도 같이 사라진다. 복사 규칙
 * (`api/admin/works/copy-paths.ts`)이 막으려던 바로 그 깨짐이다.
 *
 * 글과 설정은 값이라 그대로 들고 온다 — 남의 파일을 가리키지 않는다.
 */
export function snsSeed(project: SourceProject, mine: boolean): SnsSeed {
  const data = project.data ?? {};
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  const intents = data.attachmentIntents ?? {};

  return {
    title: project.title ?? "",
    toneNote: project.toneNote ?? "",
    source: {
      kind: "text",
      text: typeof data.source?.text === "string" ? data.source.text : "",
    },
    attachments: mine ? attachments : [],
    droppedAttachments: mine ? 0 : attachments.length,
    intents: {
      cover: intents.cover ?? "",
      body: intents.body ?? "",
      ending: intents.ending ?? "",
    },
    spec: {
      ratio: project.ratio ?? "4:5",
      cardCountMode: project.cardCountMode ?? "auto",
      // 「AI 추천」이면 장수를 비운다. 0 을 넣으면 화면이 0장으로 읽는다.
      cardCount: project.cardCountMode === "fixed" ? project.cardCount ?? undefined : undefined,
      language: project.language ?? "ko",
      modelId: project.modelId ?? "",
      // 없는 칸은 지금까지의 동작으로 읽는다.
      look: data.look ?? "auto",
      userInstruction: data.userInstruction ?? "",
    },
  };
}
