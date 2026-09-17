import {
  attachmentPlacementRule,
  characterAngleDirective,
  designerPersona,
  imageLookDirective,
  preserveDirective,
  restyledPersonDirective,
  priorityLine,
  userInstructionHead,
  userInstructionTail,
  type ImageLook,
} from "@fixup/shared";
import type { Attachment, GroupedAttachments, StyleRole } from "./attachments";
import type { CardCopy, CopyLanguage } from "./copy";
import { IMAGE_MODELS } from "./models";
import type { CardPlan } from "./planning";

const LANGUAGE_LABEL: Record<CopyLanguage, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
};

/**
 * 사용자가 화면에서 직접 고른 두 가지. 둘 다 없어도 예전과 똑같이 동작한다.
 *
 * `look` 을 안 넣으면 `auto` 로 읽는다 — 지금까지의 동작(첨부한 레퍼런스의
 * 결을 따라감)이 그대로 유지돼야 쓰던 사람이 안 깨진다.
 */
export interface PromptTuning {
  /** 이미지의 결. `auto` 면 결에 대해 아무 말도 보태지 않는다. */
  look?: ImageLook;
  /** 사용자가 직접 친 지시. 다른 모든 지시보다 세다. */
  userInstruction?: string;
  /**
   * **이 자리**의 첨부를 어떻게 쓸지 사용자가 적은 말 (표지/속지/엔딩).
   *
   * 표지와 속지는 원하는 것이 다르므로 자리마다 따로 받는다. 적혀 있으면 그
   * 자리의 역할 고정 문구를 빼고 이 말만 남긴다(설계 §4-1 A안).
   */
  attachmentIntent?: string;
}

/**
 * 첨부를 「진짜로 보라」고 먼저 못 박는 한 줄.
 *
 * 안 적으면 모델이 첨부를 대충 훑고 기억으로 비슷한 것을 그려낸다 — 로고가
 * 닮은 다른 로고가 되고 제품이 같은 범주의 다른 제품이 된다. 첨부가 하나도
 * 없을 때는 넣지 않는다. 없는 것을 보라고 하면 모델이 지어낸다.
 */
const ATTACHMENT_DECLARATION =
  "Study every attached image closely before drawing. They are the source of truth for what they " +
  "define — reproduce what you actually see in them. Do not approximate them from memory, and " +
  "never substitute a generic stand-in.";

/**
 * 결 지시문 한 덩이. `auto` 면 빈 문자열이라 부르는 쪽이 통째로 뺀다.
 *
 * 「레퍼런스를 이긴다」를 굳이 붙이는 이유가 있다. 첨부 블록이 레퍼런스의
 * `texture and rendering style` 까지 따라 하라고 시킨다. 사용자가 실사
 * 레퍼런스를 올려 두고 「애니」를 고르면 두 지시가 정면으로 부딪히는데, 이
 * 한 마디가 없으면 어느 쪽이 이길지 모델이 매번 다르게 정한다.
 */
/**
 * 이 카드를 **무엇으로 그릴지** 정하는 줄.
 *
 * `auto` 면 빈 문자열이다 — 따라갈 그림이 정해 주기 때문이다.
 *
 * **여기서 내리지 않는다.** 한 번 그렇게 했다가 되돌렸다(2026-09-17 리뷰).
 * 이 자리가 아는 것은 **이 카드 역할에 맞는 레퍼런스** 뿐인데
 * (`selectReferencesForRole`), 「따라갈 그림이 있나」는 **작업 단위** 물음이다.
 * 표지 레퍼런스만 붙인 사람에게 속지·엔딩이 실사로 나갔다 — 화면은 그때도
 * 「붙인 그림의 화풍을 따라갑니다」라고 적고 있었다.
 *
 * 내리는 일은 `apps/web/lib/sns/queued-flow.ts` 가 작업 단위로 **한 번** 한다.
 */
function lookBlock(look: ImageLook | undefined): string {
  const directive = imageLookDirective(look ?? "auto");
  if (!directive) return "";
  return "Rendering style for this card — this overrides the rendering style of the" +
    ` CARD-NEWS REFERENCE:\n${directive}`;
}

/** 표지·속지·엔딩은 자기 역할 레퍼런스만 보고, 보존 대상은 모든 역할에 함께 간다. */
export function selectReferencesForRole(
  grouped: GroupedAttachments,
  role: StyleRole,
): Attachment[] {
  return [...grouped.styleByRole[role], ...grouped.keepIdentity];
}

const ROLE_LABEL: Record<StyleRole, string> = {
  cover: "표지",
  body: "속지",
  ending: "엔딩",
};

/** 역할이 맞는 스타일 레퍼런스가 없어도 막지는 않고 화면에 보여줄 경고를 남긴다. */
export function referenceWarningsForRole(
  grouped: GroupedAttachments,
  role: StyleRole,
): string[] {
  if (grouped.styleByRole[role].length > 0) return [];
  const label = ROLE_LABEL[role];
  return [`${label} 레퍼런스가 없습니다. ${label} 카드가 다른 역할과 다른 모양으로 나올 수 있습니다.`];
}

export function buildAttachmentBlock(images: Attachment[], tuning: PromptTuning = {}): string {
  const lines: string[] = [];
  if (images.length > 0) lines.push(ATTACHMENT_DECLARATION);
  lines.push(
    "Follow the instruction for each attached image separately. Image numbers match attachment order.",
  );
  /**
   * **사용자가 이 자리에 대해 적은 말.**
   *
   * 표지와 속지는 원하는 것이 다르므로 자리마다 따로 받는다(2026-09-08 사용자
   * 결정). 이미지 만들기는 결과가 한 장이라 칸이 하나면 됐지만, 카드뉴스는
   * 자리가 셋이다.
   */
  const intent = tuning.attachmentIntent?.trim() ?? "";

  /**
   * 지시를 적었으면 **고정 문구를 남기고, 사용자의 말이 그것을 이긴다.**
   *
   * 2026-09-08 에는 통째로 뺐다(설계 §4-1 A안). 역할 문구가 여섯 문장이고
   * 전부 구체적이라 우선순위 한 줄로는 사용자가 적은 한 줄을 못 이겼기
   * 때문이다.
   *
   * **그런데 지우는 것이 과했다.** 2026-09-17 이미지 만들기에서 부딪히지도
   * 않는 905자가 함께 사라져, 모자도 포스터 느낌도 결과에 안 나왔다.
   *
   * 지우기와 우선하기는 다른 일이다. 규칙은 남기고 「사용자의 말이 이긴다」는
   * 한 줄을 **뒤에** 둔다 — 뒤에 온 말이 앞말을 덮는 것은 이 저장소가 여러 번
   * 확인한 순서다(2026-09-04 실측).
   */
  images.forEach((image, offset) => {
    const number = offset + 1;
    if (image.kind === "style_reference") {
      // 2026-07-30 실측 정책(pdp.reference-policy.ts)을 그대로 옮긴 문구다.
      //
      // 전에는 "as closely as possible, replace only the content" 라고만 했다.
      // 그러면 레퍼런스의 아이콘이 '꼴'인지 '내용'인지 모델이 알 수 없어,
      // 있던 아이콘을 그대로 베끼거나 반대로 아이콘 없는 허전한 카드가 나왔다.
      // 가져올 것과 가져오지 않을 것을 나눠 말해야 한다.
      lines.push(
        `Image ${number} is the ${image.role ?? "matching"} CARD-NEWS REFERENCE for this card. ` +
        "Imitate its design language only:",
        "  · layout and composition, typography (weight, width, character), text treatment, " +
        "texture and rendering style (photographic / illustrated / 3D)",
        "  · how each colour is used — which colours fill surfaces and bands, which are only type, " +
        "which are accents. Reproduce that usage, not just the colours themselves.",
        "Do NOT copy anything else from it — not its product, not its people, not its icons or " +
        "illustrations, not its text content. Draw new icons and imagery in the same style so they " +
        "match the text of THIS card.",
      );
    } else if (image.kind === "keep_identity") {
      const person = image.subject === "person";
      // 사람을 그대로 두고 그림 느낌만 바꾸는 경우는 다른 말을 쓴다 (설계 §4-3).
      // `preserveDirective` 는 restyle 을 금지해서, 그 말이 가면 처음부터 막힌다.
      if (person && image.restyle) {
        lines.push(`Image ${number} is a PRESERVED PERSON, REDRAWN. ${restyledPersonDirective()}`);
        return;
      }
      // 지키는 말은 공용 어휘가 정한다. 도구마다 다르게 적으면 어느 도구에서는
      // 지켜지고 어느 도구에서는 조금씩 바뀐다 — 2026-09-04 사용자 보고.
      lines.push(
        `Image ${number} is a ${person ? "PRESERVED PERSON" : "PRESERVED SUBJECT"}. ` +
        preserveDirective(person ? "preserve-person" : "preserve-object"),
      );
    }
  });

  /*
   * **적은 말이 이긴다 — 규칙을 지우지는 않는다.**
   *
   * 전에는 지시를 적으면 위 역할 문구를 통째로 뺐다. 이미지 만들기에서
   * 실측으로 정한 것을 옮겨 온 것인데, 2026-09-17 에 그것이 과하다는 것이
   * 실물로 드러났다 — 첨부 셋(포스터·인물·모자)에 「힙하고 자유로운 느낌」
   * 이라고 적었더니 부딪히지도 않는 905자가 함께 사라지고, 모자도 포스터
   * 느낌도 결과에 안 나왔다.
   *
   * **남기고, 이긴다고 말하고, 뒤에 둔다.** 뒤에 온 말이 앞말을 덮는 것은
   * 이 저장소가 여러 번 확인한 순서다. 지우기와 우선하기는 다른 일이다.
   */
  if (intent && images.length) {
    lines.push(
      "The user wrote how to use these images. Their words OVERRIDE any rule above that "
      + "contradicts them — where a rule and the user disagree, follow the user. Rules the user "
      + "did not contradict still apply in full. Read the USER INSTRUCTION and follow it.",
    );
  }
  /*
    **같은 캐릭터의 여러 각도**가 붙었으면 한 번만 말해 준다.

    장마다 「PRESERVED PERSON」 이라고만 적으면 모델은 서로 다른 사람으로 읽고
    얼굴을 절충한다. 이 문장이 넷을 한 사람으로 묶는다. 장마다 되풀이하지
    않는 이유는 같다 — 같은 말이 넷이면 규칙이 아니라 소음이 된다.
  */
  const angleCounts = new Map<string, number>();
  for (const image of images) {
    if (image.kind !== "keep_identity" || image.subject !== "person") continue;
    if (!image.characterId) continue;
    angleCounts.set(image.characterId, (angleCounts.get(image.characterId) ?? 0) + 1);
  }
  for (const count of angleCounts.values()) {
    if (count > 1) lines.push(characterAngleDirective(count));
  }

  // 우선순위 문장은 다섯 도구가 같은 것을 쓴다(@fixup/shared). 여기서 따로
  // 쓰면 도구마다 순서가 갈리고, 같은 지시에 다른 그림이 나온다.
  //
  // 사용자가 직접 친 말이 맨 위다. 전에는 그 자리가 아예 없어서, 「배경을
  // 밤으로」라고 적어도 낮인 레퍼런스가 이겼다.
  const priority = priorityLine({
    // 첨부 지시도 사람이 친 말이다. 이것만 적었을 때 우선순위 줄이 빠지면
    // 「무엇이 먼저인지」를 아무도 안 말해 준다.
    hasUserInstruction: Boolean(mergedInstruction(tuning)),
    hasPreserved: images.some((image) => image.kind === "keep_identity"),
  });
  if (priority) lines.push(priority);
  if (images.length) {
    lines.push(attachmentPlacementRule(images.some((image) => image.kind === "keep_identity")));
  }
  return lines.join("\n");
}

export function buildFrame(input: {
  copy: CardCopy;
  images: Attachment[];
  size: { width: number; height: number };
  language: CopyLanguage;
  look?: ImageLook;
  userInstruction?: string;
  /** 이 카드 자리에 적은 말. 부르는 쪽이 골라 넘긴다. */
  attachmentIntent?: string;
}): string {
  const texts = [
    ["HEADLINE", input.copy.headline],
    ["BODY", input.copy.body],
    ["ACCENT", input.copy.accent],
    ["FOOTNOTE", input.copy.footnote],
  ].filter(([, value]) => Boolean(value?.trim()));
  const look = lookBlock(input.look);

  return [
    buildAttachmentBlock(input.images, {
      look: input.look,
      userInstruction: input.userInstruction,
      attachmentIntent: input.attachmentIntent,
    }),
    ...(look ? ["", look] : []),
    "",
    `Render this ${LANGUAGE_LABEL[input.language]} text exactly as written, with correct spelling and spacing:`,
    ...texts.map(([label, value]) => `  ${label}: ${value}`),
    "Every non-empty field listed above must appear visibly in the image in full.",
    "If the copy needs more room, use additional lines or reduce the font size so the full text fits.",
    "Do not omit or summarize a field to make it fit.",
    "Do not translate, paraphrase, or shorten the text listed above.",
    "The listed fields are the only authored card copy.",
    "Do not invent additional headlines, body copy, slogans, greetings, CTAs, footer messages, copyright notices, trademark claims, dates, or brand names.",
    "Incidental environmental text on signs, signboards, props, or existing preserved labels is allowed when visually natural; keep it sparse and subordinate, and never use it as authored card copy or a factual claim.",
    "Keep incidental background text sparse. This is a card, not a page full of words.",
    "",
    `Output size ${input.size.width}x${input.size.height}. No outer border, no page frame, no UI chrome.`,
  ].join("\n");
}

/**
 * 이미지 모델에 실제로 나가는 한 덩이를 만든다.
 *
 * 사용자가 친 지시를 **맨 앞과 맨 뒤 양쪽**에 놓는다. 2026-09-04 실측에서
 * 프롬프트 뒤에 긴 문단을 덧붙였더니 앞쪽 구도 지시가 밀려 무시됐다. 긴
 * 프롬프트에서 가운데 문장은 힘을 잃는다 — 가장 중요한 것은 양끝에 둔다.
 */
/**
 * 사람이 친 말 둘을 하나로 합친다.
 *
 * **자리별 첨부 지시(`attachmentIntent`)와 결과물 지시(`userInstruction`)는 서로
 * 다른 말이다.** 우선순위 규칙(`priorityLine`)이 「USER INSTRUCTION」 하나를
 * 가리키므로, 둘을 따로 보내면 어느 쪽이 센지 모호해진다. 라벨을 붙여 합치면
 * 순서만으로 무엇이 먼저인지 말할 수 있다.
 *
 * ── 이것이 없으면 지시를 적는 쪽이 손해다 ───────────────────
 *
 * 지시를 적으면 역할 고정 문구가 사라지는데(4-1 A안), 그 자리를 채울 말이 안
 * 실리면 **보호 문구만 없어지고 대신 들어오는 말이 없다.** 실제로 그 상태로
 * 한 번 나갔다 — 「USER INSTRUCTION 을 읽고 따르라」고 써 놓고 그 블록이
 * 비어 있었다(2026-09-08 리뷰).
 *
 * 이미지 만들기가 이미 같은 모양이다(`poster-core/src/prompt.ts`).
 */
export function mergedInstruction(tuning: PromptTuning): string {
  return [
    tuning.attachmentIntent?.trim() ? `첨부한 그림에 대해: ${tuning.attachmentIntent.trim()}` : "",
    tuning.userInstruction?.trim() ? `결과물에 대해: ${tuning.userInstruction.trim()}` : "",
  ].filter(Boolean).join("\n");
}

export function composePrompt(frame: string, llmBody: string, tuning: PromptTuning = {}): string {
  // 첨부 지시와 결과물 지시를 함께 싣는다. 하나만 실으면 나머지가 사라진다.
  const instruction = mergedInstruction(tuning);
  return [
    userInstructionHead(instruction),
    // 누가 그리는가는 사용자가 친 말 다음이다. 다섯 도구가 같은 사람을 세운다.
    designerPersona(),
    llmBody.trim(),
    frame,
    userInstructionTail(instruction),
  ].filter(Boolean).join("\n\n");
}

/**
 * 자리마다 사용자가 적은 말 (표지/속지/엔딩).
 *
 * **한 칸으로 묶지 않는다.** 표지와 속지는 원하는 것이 다르다
 * (2026-09-08 사용자 결정).
 */
export type AttachmentIntents = Partial<Record<StyleRole, string>>;

/** 이 카드 자리에 해당하는 말만 꺼낸다. 없으면 빈 문자열. */
export function intentForRole(intents: AttachmentIntents | undefined, role: StyleRole): string {
  return intents?.[role]?.trim() ?? "";
}

export interface ImagePromptInput {
  role: StyleRole;
  copy: CardCopy;
  plan: CardPlan;
  grouped: GroupedAttachments;
  size: { width: number; height: number };
  language: CopyLanguage;
  look?: ImageLook;
  userInstruction?: string;
  /** 자리마다 적은 말. 이 카드의 자리에 해당하는 것만 쓴다. */
  attachmentIntents?: AttachmentIntents;
  /**
   * 이 카드를 **그릴 모델.** `modelEndpointLabel` 이 만든 이름이다.
   *
   * 여기서는 LLM 이 프롬프트 본문을 직접 쓰므로 「이 모델에 맞게」가 손댈
   * 자리가 있다. 포스터는 기획이 칸만 채우고 문장은 코드가 짜서 같은 것을
   * 해도 아무 차이가 없었다(2026-09-17 실측, 설계 §11-7).
   *
   * **우리가 모델별 요령을 지어내지 않는다.** 재 보지 않은 것을 적으면 그것이
   * 그대로 그림에 간다. 이름만 주고 판단은 LLM 이 한다.
   */
  modelId?: string;
}

export interface ScenePromptRequest {
  prompt: string;
  imageUrls: string[];
}

export interface ImagePromptProvider {
  generate(request: ScenePromptRequest): Promise<unknown>;
}

export interface ImagePromptResult {
  body: string;
  warnings: string[];
}

/**
 * LLM 이 장면·구도·강조를 판단할 자료만 조립한다.
 * 코드가 구체적인 카메라·조명·장면 형용사를 만들지 않는다.
 */
export function buildSceneRequest(input: ImagePromptInput): ScenePromptRequest {
  const references = selectReferencesForRole(input.grouped, input.role);
  // 장면을 쓰는 LLM 도 사용자 지시와 결을 알아야 한다. 모르면 「밤」이라고
  // 적은 사용자에게 낮 장면을 써 주고, 그 장면이 그대로 이미지 모델에 간다.
  return {
    prompt: [
      // 장면을 쓰는 LLM 도 첨부 지시를 알아야 한다. 모르면 「①번 사람을」이라고
      // 적은 사용자에게 그 사람이 없는 장면을 써 준다.
      userInstructionHead(mergedInstruction({
        userInstruction: input.userInstruction,
        attachmentIntent: intentForRole(input.attachmentIntents, input.role),
      })),
      "Write the visual scene prompt for one card-news image.",
      /*
       * **길이를 스스로 줄이지 말라고 못 박는다.**
       *
       * 모델 이름만 주고 「그 모델이 잘 따르는 대로」라고 했더니 LLM 이 gpt
       * 계열에 **짧게** 썼다(992자 대 1,850자, 2026-09-17 실측). 그런데 긴
       * 프롬프트도 잘 반영되는 것을 확인했다(사용자) — 자세할수록 그림에 더
       * 들어간다. 안 적은 것은 모델이 알아서 정하고, 그러면 사용자가 바란 것이
       * 아닌 쪽으로 갈 수 있다.
       *
       * **모델에 맞추는 것은 말투이지 분량이 아니다.** 둘을 갈라 말한다.
       */
      "Write with as much useful detail as the scene warrants: subject, placement,"
      + " camera angle, lens feel, lighting direction and quality, materials, textures,"
      + " colour relationships, background depth, mood. There is no length limit —"
      + " do not shorten or summarise to save space. Only leave out what would be"
      + " guessing rather than describing.",
      "Inspect the attached reference images directly. Use them as the visual source; do not replace them with a textual reconstruction.",
      buildAttachmentBlock(references, {
        look: input.look,
        userInstruction: input.userInstruction,
        // 이 카드의 자리에 적은 말만 간다 — 표지 지시가 속지에 새면 안 된다.
        attachmentIntent: intentForRole(input.attachmentIntents, input.role),
      }),
      lookBlock(input.look),
      `Card role: ${input.role}`,
      `Planner intent: ${input.plan.intent}`,
      `Planner visual brief: ${input.plan.visualBrief}`,
      `Confirmed copy: ${JSON.stringify(input.copy)}`,
      "Give every non-empty copy field (headline, body, accent, footnote) an explicit visible placement in the scene prompt.",
      "If a field is long, direct the image model to use more lines or a smaller font while keeping the full original text.",
      "Do not omit, summarize, paraphrase, or replace any copy field with shorter labels.",
      "Do not invent greetings, slogans, CTAs, footer copy, copyright notices, trademark claims, dates, or brand names that are absent from the confirmed copy.",
      "Incidental environmental words on signs, signboards, and props are allowed when natural to the scene, but they must not become new card copy or claims.",
      /*
       * **모델 얘기는 원고 규칙 뒤에 둔다.**
       *
       * 앞에 두었더니 gpt 계열에서 길이가 40% 줄었다(2026-09-17 실측). 그
       * 압축이 바로 위의 「원고 필드를 줄이지 말라」를 갉는 방향이다 — 앞에
       * 온 말이 뒤의 규칙을 덮는다(2026-09-17 리뷰). 규칙을 먼저 읽히고
       * 그 다음에 말투를 말한다.
       *
       * **이름을 답에 쓰지 말라고 못 박는다.** 여기서 쓴 본문은 그대로
       * 저장돼 04·05 화면의 「그림 지시」에 보인다. 모델이 답 첫 줄에
       * 「Optimized for fal-ai/…」 한 번만 적으면 사용자가 그것을 본다.
       * 화면에는 「표준형」 같은 우리 이름만 나가야 한다.
       */
      ...(input.modelId
        ? [`The prompt you write will be rendered by this target model: ${input.modelId}.`
          + " Phrase it the way that model reads best — wording, ordering and sentence"
          + " shape. This is about phrasing, NOT about writing less: keep the same"
          + " level of detail whichever model it is, and keep every copy rule above"
          + " exactly as stated regardless of model."
          + " Never mention the model, its vendor or its endpoint anywhere in your"
          + " answer — write only the image prompt itself."]
        : []),
      "Decide the scene, composition, visual emphasis, and how to follow the matching reference. Return only the image prompt body.",
      userInstructionTail(input.userInstruction ?? ""),
    ].filter(Boolean).join("\n\n"),
    imageUrls: references.map((image) => image.url),
  };
}

/**
 * 장면 LLM 이 쓴 본문에서 **모델·업체 이름이 든 줄을 뺀다.**
 *
 * 이 본문은 그대로 저장돼 결과 화면의 「그림 지시(프롬프트)」에 보인다
 * (`result-board.tsx`). 그런데 그 LLM 은 방금 `fal-ai/nano-banana-pro` 를
 * 읽었고, 답 첫 줄에 「Optimized for fal-ai/…」 한 번만 적으면 사용자가 그것을
 * 본다(2026-09-17 리뷰). 화면에는 「표준형」 같은 우리 이름만 나가야 한다.
 *
 * **프롬프트로도 막고 여기서도 막는다.** 「쓰지 말라」는 지킬 수도 안 지킬 수도
 * 있는 부탁이고, 안 지켰을 때 아무도 모른다.
 *
 * **줄 단위로 뺀다.** 낱말만 지우면 「Optimized for :」 같은 부스러기가 남고,
 * 그런 줄은 애초에 장면 묘사가 아니다. 거꾸로 낱말로만 찾으면 장면에 나온
 * 바나나까지 지운다 — 모델 id 와 엔드포인트라는 **온전한 꼴**로만 본다.
 */
export function stripModelMentions(body: string): string {
  if (!body) return "";
  const 찾을것 = IMAGE_MODELS.flatMap((model) => [
    model.id,
    model.t2i.endpoint,
    model.i2i.endpoint,
  ]);
  return body
    .split("\n")
    .filter((line) => !찾을것.some((name) => line.includes(name)))
    .join("\n")
    .trim();
}

/** LLM 실패가 이미지 생성 전체를 멈추지 않게 빈 본문을 돌려준다. */
export async function writeImagePrompt(
  input: ImagePromptInput,
  provider: ImagePromptProvider,
): Promise<ImagePromptResult> {
  const warnings = referenceWarningsForRole(input.grouped, input.role);
  try {
    const generated = await provider.generate(buildSceneRequest(input));
    // 모델 이름이 답에 섞여 나오면 화면까지 간다. 여기서 한 번 더 막는다.
    return { body: typeof generated === "string" ? stripModelMentions(generated) : "", warnings };
  } catch {
    return { body: "", warnings };
  }
}
