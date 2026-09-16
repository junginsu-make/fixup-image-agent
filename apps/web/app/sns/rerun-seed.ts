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

/** 표에 저장된 원본 글. 종류마다 채워지는 칸이 다르다. */
interface StoredSource {
  kind?: string;
  text?: string;
  url?: string;
  question?: string;
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
    source?: StoredSource | null;
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
 * ── `mine` 을 무엇으로 정하나 ─────────────────────────────────────
 *
 * 부르는 쪽이 **「회원용 길로 읽었나」**로 정한다. 팀원의 작업도 회원용 길이
 * 성공하므로 `mine` 이 참인데, **그래도 맞다.**
 *
 *   작업이 회원용 길로 읽혔다  ⟹ 내 것이거나 같은 팀이다
 *   첨부 목록(`/api/reference-images`)은 **공용 창고**다 —
 *   `referenceVisibility`(`lib/teams/reference-scope.ts`)가 팀이 안 붙은 것은
 *   누구나 보게 하고, 팀 것은 팀원 전원이 본다
 *   ⟹ 팀원이 붙인 그림은 **내가 02 에서 직접 고를 수도 있는 것**이다
 *
 * 그래서 팀원의 첨부를 빼면 오히려 손해다 — 같은 창고를 쓰라고 만든 팀 기능을
 * 되돌리는 셈이 된다.
 *
 * **이미지 만들기 쪽과 규칙이 같지는 않다.** 그쪽 목록(`/api/poster/references`)
 * 은 `scopedRead` 라 팀이 없으면 내 것만이고, 팀이 없는 남의 것은 절대 안
 * 들어온다. 판단의 **뜻**은 같지만 범위는 다르다 — 그래서 그쪽은 「볼 수 있는
 * 목록」과 맞대 보고, 이쪽은 「어떤 길로 읽었나」로 가른다.
 *
 * **파일이 사라지는 걱정도 이쪽에는 없다.** 서명 주소를 admin 클라이언트가
 * 발급해서 Storage 정책의 `{user_id}/…` 규칙을 타지 않는다
 * (`lib/reference-images.ts` 에 적혀 있다).
 *
 * 관리자 통로로 온 것만 다르다. 그건 팀 밖이라 목록에도 없다.
 *
 * 글과 설정은 값이라 그대로 들고 온다 — 남의 파일을 가리키지 않는다.
 */
/**
 * 원본 글을 되살린다. **종류를 지킨다.**
 *
 * 글·유튜브·웹·질문 넷이다(`_components/source-input.tsx` 의 `SourceDraft`).
 * 전부 「글」로 만들면 유튜브로 시작한 작업이 **빈 칸**으로 돌아온다 —
 * 고치려던 「다 초기화된다」와 똑같은 일이 다른 자리에서 일어난다.
 *
 * 저장 모양이 화면 모양과 같아서 칸 이름만 맞춰 주면 된다
 * (`api/sns/projects/schema.ts` 의 `SourceSchema`).
 *
 * **모르는 종류는 빈 글로 떨어진다.** 새 종류가 생겼는데 여기를 안 고쳤거나
 * 값이 망가진 경우다 — 넘어지는 대신 사용자가 직접 채울 수 있게 연다.
 */
function sourceOf(source: StoredSource | null | undefined): SourceDraft {
  const empty: SourceDraft = { kind: "text", text: "" };
  if (!source || typeof source !== "object") return empty;

  const text = typeof source.text === "string" ? source.text : "";
  const url = typeof source.url === "string" ? source.url : "";
  const question = typeof source.question === "string" ? source.question : "";

  if (source.kind === "youtube" && url) return { kind: "youtube", url };
  if (source.kind === "web" && url) return { kind: "web", url };
  if (source.kind === "question" && question) return { kind: "question", question };
  return { kind: "text", text };
}

/** 관리자 라이브러리로 복사해 온 첨부 하나. */
export interface AdoptedAttachment {
  from: string;
  id: string;
  storagePath: string;
  url: string | null;
}

export function snsSeed(
  project: SourceProject,
  mine: boolean,
  /**
   * **남의 작업일 때만** 쓴다. 관리자는 모든 회원의 작업을 다시 만들 수 있어야
   * 하므로(2026-09-16 사용자 결정) 첨부를 관리자 라이브러리로 복사해 오고, 그
   * 복사본으로 바꿔 싣는다. 복사 못 한 것만 빠진 수로 센다.
   */
  adopted: readonly AdoptedAttachment[] = [],
): SnsSeed {
  const data = project.data ?? {};
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  const intents = data.attachmentIntents ?? {};
  /*
    남의 첨부는 **복사본으로 바꿔서만** 싣는다. 원래 경로의 첫 칸이 그 회원
    id 라, 그대로 실으면 남의 파일을 가리키는 내 작업이 된다. 역할·자리 같은
    나머지 칸은 원래 것을 지킨다.
  */
  const copies = new Map(adopted.map((entry) => [entry.from, entry]));
  const usable = mine
    ? attachments
    : attachments.flatMap((attachment) => {
        const copy = copies.get(attachment.id);
        return copy
          ? [{ ...attachment, id: copy.id, assetPath: copy.storagePath, url: copy.url ?? "" }]
          : [];
      });

  return {
    title: project.title ?? "",
    toneNote: project.toneNote ?? "",
    source: sourceOf(data.source),
    attachments: usable,
    droppedAttachments: attachments.length - usable.length,
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
