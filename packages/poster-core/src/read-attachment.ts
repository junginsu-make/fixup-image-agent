import { z } from "zod";
import { failureReason } from "@fixup/shared";
import { TYPE_INTERACTIONS } from "./schemas";
import type { GrammarReader, GrammarSource } from "./grammar";

/**
 * 붙인 그림을 **역할과 무관하게 한 번에** 읽는다 (설계 §5-1).
 *
 * ── 왜 합쳤나 ────────────────────────────────────────────────
 *
 * 읽기가 둘로 갈려 있었고, **역할이 어느 쪽을 돌릴지 정했다.**
 *
 *   「따라 만들기」로 고름   → `readReferenceGrammar` 만. 사람은 아무도 안 본다
 *   「인물 지키기」로 고름   → `readPeople` 만. 레이아웃은 아무도 안 본다
 *   「제품 지키기」로 고름   → 아무도 안 읽는다
 *
 * **그림을 보기도 전에 고른 버튼 하나가, 그 그림에서 배울 수 있는 것을 잘라
 * 버렸다.** 그다음 기획 LLM 은 없는 것을 판단할 수 없다.
 *
 * 2026-09-17 에 실물로 드러났다(설계 §2-4). 손 여섯이 핸드폰으로 인물을 둘러싸
 * 찍는 VOGUE 표지를 붙였는데 그 연출이 결과에 하나도 안 나왔다. 기획이 그것을
 * 볼 방법이 없어 「배경은 거의 무지에 가깝게」라고 쓰고 **「다른 인물 추가」를
 * 금지**했기 때문이다.
 *
 * ── 값은 안 는다 ─────────────────────────────────────────────
 *
 * 전에도 첨부 한 장당 한 번씩 읽었다. 읽는 **내용**만 달랐다. 다만 전에는
 * 역할에 따라 **안 읽는** 그림이 있었으므로(제품 지키기), 그만큼은 는다 —
 * `plan-cost.ts` 가 같은 수를 세야 화면이 거짓말을 안 한다.
 *
 * ── 안 하는 것 ───────────────────────────────────────────────
 *
 * **역할을 입력으로 받지 않는다.** 받으면 언젠가 그것으로 가르게 된다. 이 함수가
 * 아는 것은 「그림이 여기 있다」뿐이다.
 *
 * **절대 던지지 않는다.** 한 장이 실패하면 그 장만 비우고 나머지는 계속한다 —
 * 옛 `grammar.ts`·`people.ts` 와 같은 약속이다.
 */

/**
 * **`default` 를 함부로 두지 않는다.**
 *
 * 모양이 틀린 응답이 조용히 빈 값이 되면, 읽기가 깨진 것을 아무도 모르고 기획은
 * 재료 없이 계속 돈다 — 고치려던 그 고장으로 되돌아간다. 없는 것과 못 읽은 것은
 * 다르다(옛 `people.ts` 의 교훈).
 *
 * `people` 과 `staging` 은 **반드시 와야 한다.** 나머지는 옛 문법 읽기가 그랬듯
 * 비어 있어도 사람이 채울 수 있다.
 */
const AttachmentReadSchema = z.object({
  /** 사람 한 명당 한 줄. 사람이 없으면 빈 목록. */
  people: z.array(z.string().trim().min(1)),
  /**
   * **이 그림에서 무슨 일이 벌어지고 있나.**
   *
   * 이 칸이 1단계의 전부다. 옛 문법 읽기에는 이것이 없었고, 그래서 연출이
   * 통째로 사라졌다(설계 §2-1).
   */
  staging: z.string(),
  hasText: z.boolean().default(false),
  typeInteraction: z.enum(TYPE_INTERACTIONS).nullable().default(null),
  dominantColor: z.string().default(""),
  accentColor: z.string().default(""),
  note: z.string().default(""),
});

export type AttachmentRead = z.infer<typeof AttachmentReadSchema>;

export interface AttachmentReadResult {
  /** 첨부 id → 읽은 것. 못 읽은 것은 아예 없다. */
  reads: Record<string, AttachmentRead>;
  /**
   * 기획 프롬프트에 그대로 넣을 한 줄 요약.
   *
   * `planReferences` 가 이것을 받아 첨부 줄에 붙인다. **연출이 여기 없으면
   * 읽어도 기획이 못 본다.**
   */
  summaries: Record<string, string>;
  /** 첨부 id → 사람 한 명당 한 줄. `planReferences` 가 쓰는 모양 그대로다. */
  people: Record<string, string[]>;
  issues: string[];
}

export function buildAttachmentReadPrompt(): string {
  return [
    "이 그림에 **무엇이 있는지** 읽어 주세요.",
    "그림을 그리는 사람이 이 글만 보고도 같은 그림을 그릴 수 있어야 합니다.",
    "",
    "읽을 것:",
    "",
    /*
     * **한 사람이 한 덩이의 글이다. 칸으로 쪼갠 것이 아니다.**
     *
     * 2026-09-18 첫 실측에서 세 장 중 둘이 여기서 깨졌다. 아래 항목을 `people`
     * 밑에 들여써 뒀더니 모델이 그것을 **하위 칸으로 읽고** 객체를 돌려줬다 —
     * `[{"자리":"가운데","머리":"긴 갈색"}]`. 틀은 글 목록을 받으므로 통째로
     * 떨어졌다.
     *
     * 옛 `people.ts` 는 이 항목들을 **프롬프트 맨 위**에 평평하게 뒀고 그래서
     * 안 깨졌다. 합치면서 한 칸 안으로 들어가자 뜻이 바뀌었다.
     *
     * 보기를 하나 준다. 모양을 말로 설명하는 것보다 세다.
     */
    "  people           이 그림에 있는 **사람**을 왼쪽부터 한 명씩.",
    "                   한 사람이 **글 한 덩이**입니다. 칸으로 쪼개지 마세요.",
    "                   이 차례로 이어서 적습니다 — 자리 · 머리 · 얼굴에 걸친 것 ·",
    "                   머리에 쓴 것 · 옷 · 그 밖에(시계·목걸이·가방) · 자세.",
    "",
    "                   보기:",
    "                   [\"왼쪽에서 첫 번째 — 짙은 검은 단발에 앞머리, 회색 버킷햇을",
    "                     눌러 씀, 어깨가 드러난 흰 상의, 금색 후프 귀걸이, 고개를",
    "                     살짝 기울여 정면을 봄\"]",
    "",
    "                   사람이 없으면 빈 목록을 주세요.",
    "",
    /*
     * **1단계가 더하는 칸이 이것 하나다**(설계 §5-1).
     *
     * 「연출」 한 낱말로는 모호하다. 무엇을 적을지 짚어 준다 — 2026-09-17 의
     * 그 표지에서 빠진 것이 정확히 「주변에 무엇이 있고 누가 무엇을 하는가」였다.
     */
    "  staging          이 그림에서 **무슨 일이 벌어지고 있나.** 피사체 말고",
    "                   **주변에 무엇이 있고 누가 무엇을 하고 있는지**, 그것들이",
    "                   피사체를 어떻게 둘러싸고 있는지, 카메라가 얼마나 가까운지.",
    "                   예: 「여러 사람의 손이 스마트폰을 들고 인물을 사방에서",
    "                   둘러싸 촬영하고 있음」",
    "                   특별한 것이 없으면 그렇게 적습니다 — 「인물만 있고 배경은",
    "                   비어 있음」.",
    "",
    "  hasText          이 그림에 **글자가 있나** — 제목·헤드라인·타이포그래피·",
    "                   작은 글씨까지. 하나라도 있으면 true.",
    `  typeInteraction  글자와 피사체의 관계 — ${TYPE_INTERACTIONS.join(" / ")} 중 하나.`,
    "                   판단이 안 서면 null.",
    "  dominantColor    화면을 지배하는 색",
    "  accentColor      좁게 쓰이지만 눈에 띄는 색",
    "  note             타이포와 피사체가 만나는 방식을 한 줄로",
    "",
    "**작은 것을 빠뜨리지 마세요.** 안경 하나가 다른 사람을 만듭니다.",
    "**안 보이는 것은 지어내지 마세요.** 확실하지 않으면 그 항목을 빼고 적습니다.",
    "나이·직업·감정처럼 보이지 않는 것은 짐작하지 않습니다.",
    "",
    /*
     * **「없음」을 적지 말라고 못 박는다**(옛 `people.ts` 에서 옮겨 온다).
     *
     * 전에는 이 말이 「얼굴에 걸친 것」에만 붙어 있었다. 모델은 나머지 항목에
     * 성실히 「머리에 쓴 것 없음」을 적었고, 그 한 줄이 **다른 장에 붙인 모자를
     * 막았다**(2026-09-17 사용자 보고). 「이 사진에 없다」와 「그림에 없어야
     * 한다」가 그림 모델에게는 같은 말로 도착한다.
     */
    "**없는 항목은 아예 빼세요.** 「모자 없음」·「안경 없음」처럼 없다고 적지",
    "않습니다. 여기 안 보이는 것이 **다른 장에 있을 수 있고**, 「없다」고 적으면",
    "그림에서도 빠집니다.",
  ].join("\n");
}

/** 기획이 첨부 줄에서 읽을 한 줄. 빈 칸은 안 넣는다. */
function summarize(read: AttachmentRead): string {
  return [
    read.staging,
    read.typeInteraction ? `글자가 피사체를 ${read.typeInteraction}` : "",
    read.dominantColor ? `지배색 ${read.dominantColor}` : "",
    read.accentColor ? `강조색 ${read.accentColor}` : "",
    read.note,
  ].filter((part) => part.trim().length > 0).join(" · ");
}

/**
 * 첨부마다 한 장씩 읽는다.
 *
 * **한 번에 여러 장을 주지 않는다.** 모델이 사람과 연출을 뒤섞는다(옛
 * `readPeople` 이 같은 판단을 했다).
 */
export async function readAttachments(
  sources: GrammarSource[],
  reader: GrammarReader,
): Promise<AttachmentReadResult> {
  const prompt = buildAttachmentReadPrompt();
  const reads: Record<string, AttachmentRead> = {};
  const summaries: Record<string, string> = {};
  const people: Record<string, string[]> = {};
  const issues: string[] = [];

  for (const source of sources) {
    try {
      // 이미지를 그대로 보여 준다. 코드가 대신 묘사하면 원본과 멀어진다.
      const raw = await reader.read({ prompt, imageUrls: [source.url] });
      const parsed = AttachmentReadSchema.safeParse(raw);
      if (!parsed.success) {
        issues.push(`${source.title} 을 읽지 못했습니다: 응답 모양이 다릅니다.`);
        continue;
      }
      reads[source.id] = parsed.data;
      const summary = summarize(parsed.data);
      if (summary) summaries[source.id] = summary;
      if (parsed.data.people.length) people[source.id] = parsed.data.people;
    } catch (error) {
      issues.push(`${source.title} 을 읽지 못했습니다: ${failureReason(error)}`);
    }
  }

  return { reads, summaries, people, issues };
}
