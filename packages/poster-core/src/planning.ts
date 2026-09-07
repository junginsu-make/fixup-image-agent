import { withIssueFallback } from "@fixup/shared";
import { EMPTY_SLOTS, PosterSlotsSchema, TYPE_INTERACTIONS, type PosterSlots } from "./schemas";
import { attachmentNumber } from "./attachment-order";

/**
 * 슬롯을 채우는 기획.
 *
 * 사람에게 빈 칸 열두 개를 내밀지 않는다. AI 가 초안을 채우고 사람은 틀린 칸만 고친다.
 *
 * **실패해도 예외를 던지지 않는다.** 빈 슬롯과 이유를 돌려주고 사람이 직접 채운다.
 * 기획 하나 실패했다고 포스터를 못 만들면 안 된다.
 */

export const PRIMARY_POSTER_MODEL = "claude-sonnet-5";
export const BACKUP_POSTER_PROVIDER = "openai";

export interface PosterPlanInput {
  instruction: string;
  ratio: string;
  /**
   * 첨부한 그림 — **고른 차례 그대로.**
   *
   * 전에는 「따라 만들기」로 고른 것만, 제목만 넘겼다. 그래서 기획이 채운 칸이
   * 첨부한 그림과 겉돌았다 — 지켜야 할 인물이 있는지도 몰랐다.
   */
  references: Array<{
    title: string;
    grammar?: string;
    /** 화면 ①②③ 과 프롬프트 `Image N` 이 쓰는 그 번호. */
    number?: number;
    /** 이 그림을 어떻게 쓰기로 했는지. 사람이 화면에서 고른 것. */
    roleLabel?: string;
  }>;
  /**
   * 첨부한 그림들을 어떻게 쓸지 사용자가 적은 말.
   *
   * 기획이 채우는 칸보다 세다 — 사람이 친 말이기 때문이다.
   */
  attachmentIntent?: string;
}

export interface PosterPlanProvider {
  plan(prompt: string): Promise<unknown>;
}

export interface PosterPlanResult {
  slots: PosterSlots;
  issues: string[];
}

export function buildPlanPrompt(input: PosterPlanInput): string {
  const references = input.references.map((reference, index) => {
    const grammar = reference.grammar?.trim();
    // 번호는 화면·프롬프트와 같은 것을 쓴다. 셋이 각자 세면 어긋난다.
    const number = reference.number ?? attachmentNumber(index);
    const role = reference.roleLabel ? ` [${reference.roleLabel}]` : "";
    return `  ${number}. ${reference.title}${role}${grammar ? ` — ${grammar}` : ""}`;
  });

  return [
    "포스터 한 장의 기획 칸을 채웁니다. 자유 문장이 아니라 정해진 칸에 값을 넣습니다.",
    "",
    `사용자 지시: ${input.instruction}`,
    `비율: ${input.ratio}`,
    "",
    "첨부한 그림 (번호는 화면에 보이는 것과 같습니다):",
    ...(references.length ? references : ["  (없음)"]),
    ...(input.attachmentIntent?.trim()
      ? ["", `첨부한 그림을 어떻게 쓸지 — 사용자가 적은 말: ${input.attachmentIntent.trim()}`]
      : []),
    "",
    "채울 칸:",
    "  kind             포스터 유형 (영화·장소 홍보·공익·제품 광고 등)",
    "  headline         가장 크게 들어갈 말",
    "  subline          헤드라인을 받치는 문구",
    "  sideTexts        상단바·하단바·스펙 라벨 같은 곁텍스트 (배열)",
    "  scene            장소·사물·상황",
    "  subject          사람/제품/둘 다. 나이·관계·외형까지",
    "  action           지금 이 순간 무슨 일이 일어나나",
    `  typeInteraction  글자와 피사체의 관계 — ${TYPE_INTERACTIONS.join(" / ")} 중 하나`,
    "  dominantColor    지배색",
    "  accentColor      강조색",
    "  forbidden        넣지 말 것",
    "",
    "규칙:",
    "  글자 길이를 스스로 제한하지 마세요. 내용에 맞는 길이로 쓰고,",
    "  길어지면 그림 단계에서 작게 넣어 소화합니다.",
    "  사용자 지시와 레퍼런스에서 알 수 없는 칸은 지어내지 말고 비워 두세요.",
    "  사람이 보고 마저 채웁니다.",
    "  첨부한 그림을 어떻게 쓸지 적힌 말이 있으면 그것을 먼저 따르세요.",
  ].join("\n");
}

function parseSlots(raw: unknown): PosterSlots {
  const slots = (raw as { slots?: unknown } | null)?.slots ?? raw;
  return PosterSlotsSchema.parse(slots);
}

export async function planPoster(
  input: PosterPlanInput,
  primary: PosterPlanProvider,
  backup?: PosterPlanProvider,
): Promise<PosterPlanResult> {
  const prompt = buildPlanPrompt(input);
  const { value, issues } = await withIssueFallback(
    async () => parseSlots(await primary.plan(prompt)),
    backup ? async () => parseSlots(await backup.plan(prompt)) : undefined,
    {
      primaryFailure: "주 모델 기획 실패",
      backupMissing: `${BACKUP_POSTER_PROVIDER} 예비 제공자가 설정되지 않았습니다.`,
      backupFailure: `${BACKUP_POSTER_PROVIDER} 예비 기획도 실패했습니다`,
      backupSuccess: `주 모델이 실패해 ${BACKUP_POSTER_PROVIDER} 예비로 기획했습니다`,
    },
  );
  return { slots: value ?? EMPTY_SLOTS, issues };
}
