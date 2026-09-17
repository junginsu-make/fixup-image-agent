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
  /**
   * 붙인 그림에 **글자가 있나**(`grammar.ts` 의 `hasText`).
   *
   * 있으면 지어난 글자도 최종 프롬프트에 남는다(`prompt.ts` 의
   * `copyLines`). 그러니 「장면에서 글자 얘기를 하지 말라」는 지시를
   * 안 붙인다 — 그 지시의 까닭이 「어차피 지워질 글자」인데, 이때는
   * 안 지워진다. 붙이면 글자는 나가는데 어디에 놓을지를 아무도 안 적는다.
   */
  referenceHasText?: boolean;
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
     * **장면 칸을 자세히 쓰게 한다.**
     *
     * 최종 프롬프트의 ④ 구역이 이 칸들에서 나온다(`prompt.ts` 의 `sceneLines`).
     * 칸이 「해 질 녘 바닷가」면 그림 모델이 받는 것도 딱 그만큼이고 나머지는
     * 모델이 알아서 정한다 — 사용자가 바란 것이 아닌 쪽으로 갈 수 있다.
     *
     * 실측에서 포스터 슬롯은 다 합쳐 260자였다. 같은 일을 하는 카드뉴스의 장면
     * 문장은 1,850자다(2026-09-17). **긴 프롬프트도 잘 반영되는 것을 확인했다**
     * (사용자) — 자세할수록 그림에 더 들어간다.
     *
     * **무엇을 적을지 짚어 준다.** 「자세히」만으로는 무엇을 더 쓸지 모른다.
     *
     * **글자 칸에는 안 건다.** 거기는 사람이 시킨 글자만 쓴다 — 길게 쓰라고
     * 하면 없는 문구를 지어낸다.
     */
    "  scene·subject·action 은 **자세히** 씁니다. 빛의 방향과 성질, 재질과 질감,",
    "  카메라 각도와 거리, 앞뒤 배치, 색의 관계까지 적으세요. **길어도 됩니다** —",
    "  분량을 아끼려고 줄이지 마세요. 다만 지어내는 것이 될 만한 것은 빼세요.",
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
    /*
     * **글자 칸만 예외다.**
     *
     * 이 저장소에서 빈 글자 칸은 「아직 안 채움」이 아니라 **입력값**이다.
     * headline·subline·sideTexts 가 전부 비었을 때만 최종 프롬프트가 「글자를
     * 넣지 말라」를 붙인다(`prompt.ts` 의 `copyLines`). 그 여섯 줄은
     * 2026-09-08 사고의 대응이다 — 첨부에 글자가 없고 사용자도 안 시켰는데
     * 「BEST DAY EVER!」가 박혀 나왔다.
     *
     * 다 채우게 하면 **그 분기에 도달할 길이 사라진다.** 글자 없는 포스터를
     * 만들려면 사람이 04 에서 세 칸을 손수 지워야 하고, 그러면 기본값이
     * 뒤집힌다(2026-09-17 리뷰에서 걸렸다).
     */
    /*
     * **글자 칸을 규칙으로 가르려다 실패했다.** 「사용자가 적은 글자만 쓰세요」를
     * 문구를 셋으로 바꿔 가며 다섯 번씩 돌렸는데, 대놓고 「헤드라인은 「가을,
     * 셔터를 누르다」」라고 적은 지시에서도 **헤드라인을 안 썼다**
     * (2026-09-17 실측). 앞의 「다 채우세요」와 뒤의 「사용자 것만」이 한
     * 프롬프트에서 부딪혀 안전한 쪽(안 쓰기)으로 쏠린다.
     *
     * 그래서 **말이 아니라 코드로 가른다** — `copyLines` 가 글자 칸 셋이 다
     * 비었을 때만 금지문을 붙이는데, 그 판단을 여기서 흔들지 않는다.
     * 기획은 글자도 채우고, 글자 없는 그림을 원하면 사람이 04 에서 지운다.
     * 표가 붙어 있으니 무엇을 지울지는 보인다.
     *
     * 남은 구멍은 §11-6 에 적었다 — 「글자 없는 포스터」의 기본값이 뒤집혔다.
     */
    "  **다만 사용자 지시·레퍼런스에 근거가 없는 칸은** `invented` 에 그 칸 이름을",
    "  적으세요. 화면이 그것을 표시해 사람이 지우거나 고칩니다. 밝히면 되니",
    "  숨기지 말고, 근거가 있는 칸은 넣지 마세요.",
    /*
     * **글자를 지어냈으면 장면에서도 글자 얘기를 하지 않는다.**
     *
     * 2026-09-17 실물에서 한 프롬프트가 스스로 모순이었다 — 동작에 「거대한
     * 헤드라인 글자가 인물 위로 겹치며」라고 적혀 있는데 바로 아래에 「글자를
     * 넣지 마라」가 일곱 줄 붙어 있었다.
     *
     * 글자 칸을 `invented` 에 넣으면 최종 프롬프트가 그 글자를 **지운다**
     * (`prompt.ts` 의 `copyLines`). 그런데 장면·동작에 적은 글자 얘기는 안
     * 지워진다. 그 금지문은 2026-09-08 「BEST DAY EVER!」 사고의 대응이라
     * 뺄 수 없다 — 그때도 POSTER REFERENCE 가 붙어 있었고 막는 말이 없어
     * 모델이 글자를 만들었다.
     *
     * **붙인 그림에 글자가 있으면 이 지시를 안 붙인다.** 그때는 지어난
     * 글자도 안 지워지므로(`copyLines` 의 `글자를원한다`) 모순이 없고,
     * 오히려 글자를 어디에 놓을지를 적어 줘야 한다(2026-09-17 리뷰).
     *
     * 그러니 **애초에 두 말을 같이 하지 않게** 한다. 글로 지우려 들면 어느
     * 문장을 지울지 코드가 판단해야 하고, 그 판단은 틀린다.
     */
    ...(input.referenceHasText ? [] : [
      "  글자 칸을 `invented` 에 넣었다면 **scene·action 에서도 글자 얘기를 하지",
      "  마세요** — 타이포그래피·헤드라인·글자가 어디에 놓이는지 적지 않습니다.",
      "  지어낸 글자는 최종 프롬프트에서 지워지므로, 적어 두면 앞뒤가 안 맞습니다.",
    ]),
    "  첨부한 그림을 어떻게 쓸지 적힌 말이 있으면 그것을 먼저 따르세요.",
  ].join("\n");
}

function parseSlots(raw: unknown): PosterSlots {
  const wrapped = (raw as { slots?: unknown } | null)?.slots;
  if (wrapped !== undefined) return PosterSlotsSchema.parse(wrapped);
  /*
   * **평평하게 올려도 읽는다.** `{ slots: … }` 로 안 감싸고 칸을 바로 올리는
   * 응답이 있다. 그때 `invented` 가 같이 실려 오는데, 스키마가 `.strict()` 라
   * 낯선 칸 하나에 통째로 던진다 — 예비 제공자까지 부르고(돈·시간) 결국 빈
   * 슬롯이 된다(2026-09-17 리뷰). 우리가 아는 칸이니 여기서 떼어 낸다.
   */
  const { invented: _버림, ...flat } = (raw ?? {}) as Record<string, unknown>;
  return PosterSlotsSchema.parse(flat);
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
function parseInvented(raw: unknown): { names: string[]; dropped: number; 안줬다: boolean } {
  const list = (raw as { invented?: unknown } | null)?.invented;
  /*
   * **키 자체가 없으면 그것도 말한다.**
   *
   * 빈 목록과 「안 줬다」는 다르다. 안 줬는데 빈 목록으로 읽으면 글자 칸이
   * 전부 사람 것으로 보여, 2026-09-08 사고를 막던 금지문이 영원히 안 붙는다
   * (`prompt.ts` 의 `copyLines`, 2026-09-17 리뷰).
   *
   * 옛 신호(빈 칸)는 결정적이었는데 새 신호는 LLM 자기신고라, 못 받았을 때
   * 기본값이 「글자 있음」 쪽으로 떨어진다. 그 사실을 사람이 봐야 한다.
   */
  if (!Array.isArray(list)) return { names: [], dropped: 0, 안줬다: true };

  const names = [...new Set(
    list.filter((name): name is string => typeof name === "string" && SLOT_NAMES.has(name)),
  )];
  return { names, dropped: list.length - names.length, 안줬다: false };
}

/** 칸과 「지어낸 칸」을 함께 읽는다. 둘 중 하나만 읽으면 부름이 두 번 된다. */
function readPlan(raw: unknown): { slots: PosterSlots; invented: string[]; issues: string[] } {
  const { names, dropped, 안줬다 } = parseInvented(raw);
  /*
   * **버렸으면 말한다.** 모르는 이름을 조용히 버리면 세 경우가 똑같은 빈
   * 목록으로 수렴한다 — 정말 지어낸 것이 없다 / 다른 표기로 적었다 / 아예
   * 무시했다. 가장 위험한 마지막 경우가 가장 조용하다(2026-09-17 리뷰).
   */
  return {
    slots: parseSlots(raw),
    invented: names,
    issues: [
      ...(안줬다 ? ["기획이 「지어낸 칸」을 안 알려 줬습니다. 칸을 직접 확인해 주세요."] : []),
      ...(dropped ? [`기획이 알려준 칸 이름 ${dropped}개를 못 알아들었습니다.`] : []),
    ],
  };
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
  return {
    slots: value?.slots ?? EMPTY_SLOTS,
    invented: value?.invented ?? [],
    issues: [...issues, ...(value?.issues ?? [])],
  };
}
