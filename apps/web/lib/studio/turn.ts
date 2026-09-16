import {
  characterSuggestion,
  isReady,
  missingSlots,
  type Intake,
  type MissingSlot,
  type StudioSuggestion,
} from "./intake";
import type { StructuredProvider, StructuredSpec } from "../llm/structured";

/**
 * 대화 한 턴.
 *
 * LLM 은 **알아낸 것과 할 말**만 돌려준다. 준비가 됐는지는 코드가 판단한다 —
 * 모델에게 맡기면 절반만 듣고 "이제 만들 수 있습니다" 라고 한다.
 *
 * 그리고 **모델이 준 값을 그대로 믿지 않는다.** 장수에 "여섯"이 오거나 도구에
 * "영상"이 오면 대화가 통째로 어그러진다. 아는 모양만 받아들이고 나머지는
 * 흘려보낸 뒤 다음 턴에 다시 묻는다.
 */

/**
 * 첫 인사.
 *
 * 도구를 먼저 고르게 하지 않는다. 사용자는 "카드뉴스인가 포스터인가"가 아니라
 * "이걸 알리고 싶다"를 들고 온다. 무엇을 알리고 싶은지 먼저 듣고, 여러 장이
 * 나을지 한 장이 나을지는 안내자가 판단해 제안한다.
 */
export const OPENING_MESSAGE =
  "안녕하세요. 어떤 내용으로 만들어 드릴까요?\n\n" +
  "유튜브 주소나 기사 주소를 주시면 내용을 가져와 정리해 드리고, 직접 적어 주셔도 됩니다.\n" +
  "여러 장으로 이야기를 잇는 **카드뉴스**와 한 장으로 붙잡는 **포스터·광고 소재** 중에서, " +
  "내용을 보고 어울리는 쪽을 제안해 드릴게요.";

export const TURN_SCHEMA: StructuredSpec = {
  name: "studio_turn",
  description: "사용자에게 할 말과, 이번 대화에서 새로 알아낸 것",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "learned"],
    properties: {
      reply: { type: "string", description: "사용자에게 할 말. 한국어. 두세 문장." },
      learned: {
        type: "object",
        additionalProperties: false,
        description: "이번 대화에서 새로 알아낸 것만. 모르는 것은 넣지 않는다.",
        properties: {
          tool: { type: "string", enum: ["sns", "poster"] },
          topic: { type: "string" },
          sourceKind: { type: "string", enum: ["text", "youtube", "url", "none"] },
          sourceRef: { type: "string" },
          audience: { type: "string" },
          cardCount: { type: "integer", minimum: 2, maximum: 20 },
          attachmentsDecided: { type: "boolean" },
          needsPerson: { type: "boolean" },
          hasPersonImage: { type: "boolean" },
          notes: {
            type: "array",
            description:
              "위 칸에 안 들어가지만 만들 때 알아야 할 것. 톤, 금지 사항, 특별한 요청, "
              + "사용자가 강조한 것 등 무엇이든. 나중에 이미지 프롬프트를 쓸 때 그대로 쓴다.",
            items: { type: "string" },
          },
        },
      },
      chips: {
        type: "array",
        description: "누르면 바로 답이 되는 짧은 보기. 없으면 빈 배열.",
        items: { type: "string" },
        maxItems: 4,
      },
    },
  },
};

export interface TurnMessage {
  role: "user" | "assistant";
  text: string;
}

export interface TurnInput {
  intake: Intake;
  messages: TurnMessage[];
}

export interface TurnResult {
  reply: string;
  chips: string[];
  intake: Intake;
  missing: MissingSlot[];
  ready: boolean;
  suggestion: StudioSuggestion | null;
}

function known(intake: Intake): string {
  const lines = Object.entries(intake)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `  ${key}: ${String(value).slice(0, 300)}`);
  return lines.length ? lines.join("\n") : "  (아직 없음)";
}

/**
 * 이 안내자가 아는 세상.
 *
 * 범용 상담원이 아니라 **우리 스튜디오를 아는 사람**이어야 한다. 무엇이
 * 가능한지 알아야 사용자가 막연할 때 먼저 제안할 수 있다.
 */
const CAPABILITIES = [
  "## 우리가 만들 수 있는 것",
  "- **카드뉴스** — 여러 장으로 이야기를 잇습니다. 보통 4~10장이고 6장이 무난합니다.",
  "- **포스터·광고 소재** — 한 장으로 붙잡습니다. 따라 만들 그림이 한 장은 있어야 합니다.",
  "",
  "## 그림을 쓰는 방법",
  "- **따라 만들기** — 배치·서체·색·질감만 가져옵니다. 그 안의 아이콘·제품은 안 가져오고, 내용에 맞게 새로 그립니다.",
  "- **제품 그대로 지키기** — 형태·색·재질·라벨을 유지합니다. 각도와 조명만 장면에 맞춥니다.",
  "- **인물 그대로 지키기** — 얼굴과 체형을 유지합니다. 인물은 한 명만 쓸 수 있습니다.",
  "- 라이브러리에 올려 둔 그림과 지금까지 만든 결과물을 다시 쓸 수 있습니다.",
  "- 쓸 만한 인물 사진이 없으면 **캐릭터를 만들어** 쓸 수 있습니다(/characters). 정면·좌측·우측·뒷모습이 함께 나와 여러 장에 같은 사람이 나옵니다.",
  "",
  "## 내용을 가져오는 방법",
  "- **유튜브 주소**를 주면 자막을 가져옵니다.",
  "- **기사·블로그 주소**를 주면 본문을 가져옵니다.",
  "- 직접 쓰셔도 되고, 수집함에 모아 둔 글을 쓸 수도 있습니다.",
].join("\n");

export function buildTurnInstruction(intake: Intake): string {
  const missing = missingSlots(intake);
  const parts = [
    "당신은 Fixup 이미지 스튜디오의 제작 안내자입니다.",
    "사용자와 자유롭게 대화하면서 무엇을 만들지 함께 정합니다.",
    "",
    CAPABILITIES,
    "",
    "## 이미 아는 것 — 다시 묻지 마세요",
    known(intake),
  ];

  if (missing.length === 0) {
    parts.push(
      "",
      "## 다 모였습니다",
      "더 묻지 말고, 정리한 내용을 알려 준 뒤 오른쪽 작업판을 확인하라고 안내하세요.",
      "사용자가 더 다듬고 싶어하면 얼마든지 함께 다듬으세요.",
    );
  } else {
    parts.push(
      "",
      "## 아직 비어 있는 것 — 만들기를 시작하려면 필요합니다",
      ...missing.map((slot) => `- ${slot.label}: ${slot.why}`),
    );
  }

  parts.push(
    "",
    "## 어떻게 대화할지",
    "- 사용자가 묻거나 상의하고 싶어하면 **그 이야기를 먼저 하세요.** 빈 칸 채우기가 목적이 아닙니다.",
    "- 비어 있는 칸은 대화 흐름 속에서 자연스럽게 채우세요. **순서는 당신이 정합니다.**",
    "- 한꺼번에 여러 개를 쏟아붓지는 마세요. 사용자는 하나만 답하고 나머지를 흘립니다.",
    "- 사용자가 막연해하면 먼저 제안하세요. 좋은 제안이 좋은 질문보다 낫습니다.",
    "- 사용자가 고를 만한 짧은 보기가 있으면 chips 에 담으세요.",
    "",
    "## 그림이 붙으면",
    "- 사용자가 그림을 올리면 **무엇으로 쓸지 반드시 물으세요.** 따라 만들기인지, 제품을 지키는 것인지, 인물을 지키는 것인지에 따라 결과가 정반대가 됩니다.",
    "- 안 물으면 따라 만들기로 처리됩니다. 제품 사진이 그렇게 되면 제품이 지켜지는 대신 다시 그려집니다.",
    "- 그림을 보고 짐작이 가면 먼저 제안하세요. 「제품 사진 같은데, 이 제품을 그대로 지킬까요?」처럼요.",
    "",
    "## 알아낸 것을 적을 때",
    "- 사용자가 준 유튜브·웹 주소는 sourceRef 에 그대로 담으세요.",
    "- 인물이 등장해야 하는 내용이면 needsPerson 을 true 로 두세요.",
    "- **새로 알아낸 것만** learned 에 담으세요. 모르는 것은 넣지 마세요.",
  );
  return parts.join("\n");
}

/** 아는 모양만 받는다. 나머지는 흘려보내고 다음 턴에 다시 묻는다. */
function sanitize(raw: unknown): Partial<Intake> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const next: Partial<Intake> = {};
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

  if (source.tool === "sns" || source.tool === "poster") next.tool = source.tool;
  if (text(source.topic)) next.topic = text(source.topic);
  if (["text", "youtube", "url", "none"].includes(String(source.sourceKind))) {
    next.sourceKind = source.sourceKind as Intake["sourceKind"];
  }
  if (text(source.sourceRef)) next.sourceRef = text(source.sourceRef);
  if (text(source.audience)) next.audience = text(source.audience);
  if (typeof source.cardCount === "number" && Number.isInteger(source.cardCount)) {
    next.cardCount = source.cardCount;
  }
  if (typeof source.attachmentsDecided === "boolean") next.attachmentsDecided = source.attachmentsDecided;
  if (typeof source.needsPerson === "boolean") next.needsPerson = source.needsPerson;
  if (typeof source.hasPersonImage === "boolean") next.hasPersonImage = source.hasPersonImage;
  if (Array.isArray(source.notes)) {
    const notes = source.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0);
    if (notes.length) next.notes = notes;
  }
  return next;
}

export async function runTurn(input: TurnInput, provider: StructuredProvider): Promise<TurnResult> {
  const transcript = input.messages
    .map((message) => `${message.role === "user" ? "사용자" : "안내자"}: ${message.text}`)
    .join("\n");

  const raw = (await provider.generate(
    `${buildTurnInstruction(input.intake)}\n\n## 지금까지의 대화\n${transcript || "(없음)"}`,
  )) as Record<string, unknown> | null;

  const learned = sanitize(raw?.learned);
  // 메모는 덮어쓰지 않고 쌓는다. 새 메모가 올 때마다 앞의 것을 지우면
  // 첫 요청이 사라진다.
  const notes = [...(input.intake.notes ?? []), ...(learned.notes ?? [])];
  const intake: Intake = {
    ...input.intake,
    ...learned,
    ...(notes.length ? { notes: [...new Set(notes)] } : {}),
  };
  const missing = missingSlots(intake);
  const chips = Array.isArray(raw?.chips)
    ? raw.chips.filter((chip): chip is string => typeof chip === "string").slice(0, 4)
    : [];

  // 모델이 아무 말도 안 하면 대화가 끊긴다. 모자란 칸으로 되묻는다.
  const fallback = missing[0]
    ? `${missing[0].label}를 알려 주세요. ${missing[0].why}`
    : "정리했습니다. 오른쪽 작업판을 확인해 주세요.";

  return {
    reply: typeof raw?.reply === "string" && raw.reply.trim() ? raw.reply.trim() : fallback,
    chips,
    intake,
    missing,
    ready: isReady(intake),
    suggestion: characterSuggestion(intake),
  };
}
