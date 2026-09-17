import { withIssueFallback } from "@fixup/shared";
import { EMPTY_SLOTS, PosterSlotsSchema, TYPE_INTERACTIONS, type PosterSlots } from "./schemas";
import { attachmentNumber } from "@fixup/shared";

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
    /**
     * 이 그림에 있는 사람들 — **한 명당 한 줄**.
     *
     * 없으면 기획이 인물을 한 줄로 뭉뚱그린다. 실제로 「1번 사진에 등장하는
     * 사람들(흰색 티셔츠 착용)」로 끝나서, 세 번째 사람의 안경이 몇 번을 돌려도
     * 안 나왔다(2026-09-08 실측).
     */
    people?: string[];
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
  /**
   * 기획이 **근거 없이 채웠다고 밝힌** 칸 이름들.
   *
   * 화면이 여기에 표를 붙여 사람이 지우거나 고치게 한다. 자기 신고라 완벽하지
   * 않지만, 코드로는 가릴 수 없다 — 같은 뜻을 다른 말로 쓰면 못 잡는다.
   */
  invented: string[];
  issues: string[];
}

export function buildPlanPrompt(input: PosterPlanInput): string {
  const references = input.references.map((reference, index) => {
    const grammar = reference.grammar?.trim();
    // 번호는 화면·프롬프트와 같은 것을 쓴다. 셋이 각자 세면 어긋난다.
    const number = reference.number ?? attachmentNumber(index);
    const role = reference.roleLabel ? ` [${reference.roleLabel}]` : "";
    const head = `  ${number}. ${reference.title}${role}${grammar ? ` — ${grammar}` : ""}`;
    // 사람은 **한 명당 한 줄**로 이어 붙인다. 한 줄로 뭉치면 기획이 다시 요약한다.
    const people = (reference.people ?? []).map((person) => `       · ${person}`);
    return [head, ...people].join("\n");
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
    "돌려줄 모양: { \"slots\": { …아래 칸… }, \"invented\": [\"근거 없이 채운 칸 이름\"] }",
    "",
    "채울 칸:",
    "  kind             포스터 유형 (영화·장소 홍보·공익·제품 광고 등)",
    "  headline         가장 크게 들어갈 말",
    "  subline          헤드라인을 받치는 문구",
    "  sideTexts        상단바·하단바·스펙 라벨 같은 곁텍스트 (배열)",
    "  scene            장소·사물·상황",
        /**
     * **사람이 여럿이면 한 명씩 적게 한다.**
     *
     * 전에는 「나이·관계·외형까지」였는데, 기획이 여럿을 한 줄로 뭉갰다 —
     * 「1번 사진에 등장하는 사람들(흰색 티셔츠 착용)」. 그 한 줄이 최종
     * 프롬프트의 유일한 인물 묘사라, 요약에 없는 안경이 안 그려졌다
     * (2026-09-08 실측).
     *
     * 위 목록에서 읽어 준 사람 줄이 그대로 근거다 — **지어내지 말라**고 함께
     * 못 박는다. 읽은 것이 없으면 짧게 두는 편이 낫다.
     */
    "  subject          사람/제품/둘 다.",
    "                   **사람이 여럿이면 위에 적힌 사람 줄을 한 명씩 그대로 옮깁니다** —",
    "                   안경·모자·옷·자세까지. 한 줄로 뭉뚱그리지 마세요.",
    "                   위에 없는 것은 지어내지 말고, 읽은 것이 없으면 짧게 둡니다.",
    "  action           지금 이 순간 무슨 일이 일어나나",
    `  typeInteraction  글자와 피사체의 관계 — ${TYPE_INTERACTIONS.join(" / ")} 중 하나`,
    "  dominantColor    지배색",
    "  accentColor      강조색",
    "  forbidden        넣지 말 것",
    "",
    "규칙:",
    "  글자 길이를 스스로 제한하지 마세요. 내용에 맞는 길이로 쓰고,",
    "  길어지면 그림 단계에서 작게 넣어 소화합니다.",
    /*
     * **빈 칸을 남기지 않는다. 대신 지어낸 것을 밝힌다.**
     *
     * 전에는 「알 수 없는 칸은 지어내지 말고 비워 두세요」였다(2026-09-01).
     * 뜻은 분명했다 — AI 가 지어낸 설정이 그림에 섞이면 사용자는 왜 그게
     * 나왔는지 모른다.
     *
     * **그런데 너무 잘 들었다.** 「벚꽃 아래에서 손을 흔드는 교복 입은 학생」에
     * 칸을 0개 채웠다(2026-09-16 실측). 벚꽃에서 분홍을 읽는 것은 날조가 아니라
     * 당연한 읽기인데, 「지어내지 말라」를 성실히 따르면 그것까지 비운다.
     * 추론과 날조를 구분하지 못하고 둘 다 피하는 것으로 보인다.
     *
     * **초보일수록 빈 칸을 못 채운다.** 그 사람이 도움을 받으러 왔다.
     *
     * 그래서 채우게 하고 지어낸 칸을 밝히게 한다(2026-09-17 사용자 결정).
     * 사람은 04 에서 그 표를 보고 지우거나 고친다 — 판단은 사람이 하되
     * 판단할 거리는 AI 가 만들어 준다.
     */
    "  칸을 비워 두지 말고 채우세요. 사용자가 안 적은 것은 어울리는 것으로 고릅니다.",
    "  **다만 사용자 지시·레퍼런스에 근거가 없는 칸은** `invented` 에 그 칸 이름을",
    "  적으세요. 화면이 그것을 표시해 사람이 지우거나 고칩니다. 밝히면 되니",
    "  숨기지 말고, 근거가 있는 칸은 넣지 마세요.",
    "  첨부한 그림을 어떻게 쓸지 적힌 말이 있으면 그것을 먼저 따르세요.",
  ].join("\n");
}

function parseSlots(raw: unknown): PosterSlots {
  const slots = (raw as { slots?: unknown } | null)?.slots ?? raw;
  return PosterSlotsSchema.parse(slots);
}

/** 화면이 표를 붙일 수 있는 칸 이름들. */
const SLOT_NAMES = new Set(Object.keys(EMPTY_SLOTS));

/**
 * 기획이 「근거 없이 채웠다」고 밝힌 칸들.
 *
 * **모르는 이름은 버린다.** 화면은 이름으로 칸을 찾으므로, 없는 이름이 섞이면
 * 조용히 아무 데도 표가 안 붙는다. 들어올 때 걸러야 그 조용한 실패가 없다.
 *
 * **안 돌려줘도 실패가 아니다.** 옛 기획 결과에는 이 칸이 없고, 없으면
 * 「지어낸 것이 없다」로 읽는다.
 */
function parseInvented(raw: unknown): string[] {
  const list = (raw as { invented?: unknown } | null)?.invented;
  if (!Array.isArray(list)) return [];
  return list.filter((name): name is string => typeof name === "string" && SLOT_NAMES.has(name));
}

/** 칸과 「지어낸 칸」을 함께 읽는다. 둘 중 하나만 읽으면 부름이 두 번 된다. */
function readPlan(raw: unknown): { slots: PosterSlots; invented: string[] } {
  return { slots: parseSlots(raw), invented: parseInvented(raw) };
}

export async function planPoster(
  input: PosterPlanInput,
  primary: PosterPlanProvider,
  backup?: PosterPlanProvider,
): Promise<PosterPlanResult> {
  const prompt = buildPlanPrompt(input);
  const { value, issues } = await withIssueFallback(
    async () => readPlan(await primary.plan(prompt)),
    backup ? async () => readPlan(await backup.plan(prompt)) : undefined,
    {
      primaryFailure: "주 모델 기획 실패",
      backupMissing: `${BACKUP_POSTER_PROVIDER} 예비 제공자가 설정되지 않았습니다.`,
      backupFailure: `${BACKUP_POSTER_PROVIDER} 예비 기획도 실패했습니다`,
      backupSuccess: `주 모델이 실패해 ${BACKUP_POSTER_PROVIDER} 예비로 기획했습니다`,
    },
  );
  return { slots: value?.slots ?? EMPTY_SLOTS, invented: value?.invented ?? [], issues };
}
