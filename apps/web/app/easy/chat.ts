import { EASY_LOOKS, EASY_RATIOS } from "./ask";
import { NOT_MADE_YET } from "./cardnews-after";
import type { EasyMessage } from "./turn";
import { adQuestionOrigin } from "./ad-ask";
import { plainAiText, visibleBody } from "./row-marks";
import {
  easyAdAnswerLines, easyAdWantLines, easyAskAnswerLines, easyCapabilityLines, easyFirstPhotoLines, easyPhotoGoneLines,
} from "./chat-facts";
import { askChain } from "./ask-chain";

/**
 * **말인가, 만들어 달라는 것인가.**
 *
 * ── 왜 필요해졌나 ────────────────────────────────────────────
 *
 * 2026-09-21 사용자 — 「이지 모드 채팅창은 기본 LLM 이 탑재되어 꼭 이미지만이
 * 아니라 사용자와 AI 가 대화 할 수 있어야 합니다. 그냥 ChatGPT · Gemini ·
 * Claude 처럼 쓸 수 있어야 된다고 보면 됩니다.」
 *
 * 그전에는 **친 말이 전부 그림 주문**이었다. 「안녕하세요」도 그림을 만들었다 —
 * 값이 나가고, 엉뚱한 그림이 나오고, 물어본 것에는 아무도 답하지 않았다.
 *
 * ── 왜 화면 밖에 있나 ────────────────────────────────────────
 *
 * 「이 말이 주문인가」는 판단이다. `.tsx` 나 라우트 안에 두면 값으로 못 잰다 —
 * 이 저장소가 계속 지켜 온 방식이다(`turn.ts` · `title.ts` · `cost.ts`).
 *
 * ── 왜 LLM 이 가르나 ─────────────────────────────────────────
 *
 * 낱말로 가르는 길도 있다(「그려」·「만들어」가 있으면 주문). **안 된다.**
 * 「방금 그린 거 왜 그렇게 나왔어?」에도 「그린」이 있고, 「포스터 만들 때 뭘
 * 적어야 해?」에도 「만들」이 있다. 둘 다 묻는 말인데 그림이 나간다.
 *
 * 그래서 **여기서는 묻는 말만 짓고**, 가르는 일은 모델이 한다. 이 파일이 재는
 * 것은 「무엇을 물었나」와 「돌아온 답을 어떻게 읽나」다.
 */

/** 모델이 돌려주는 것. */
export interface EasyDecision {
  /**
   * `image` 면 한 장, `cardnews` 면 카드뉴스 원고, `either` 면 둘 중 무엇인지 묻고,
   * `revise` 면 이 대화의 마지막 원고를 말대로 다시 쓴다(2단계 설계 §4 · §7).
   * `talk` 면 `reply` 를 적고, `detail_page` 면 안내 한 줄로 끝낸다.
   */
  wants: "image" | "cardnews" | "either" | "revise" | "talk" | "detail_page"
    // 3단계: 만든 카드뉴스 손보기(한 장 다시 그리기 · 한 장 글 고치기 · 게시글 · 받기).
    | "card_redo" | "card_text" | "caption" | "download"
    // 이 대화에서 마지막으로 만든 이미지 한 장을 고친다(2026-10-06).
    | "image_edit"
    // 포털 광고 규격별로 여러 장 — 여기서 안 만들고 「광고소재」로 안내한다(2026-10-06 설계 A5).
    | "ad_specs";
  /** 3단계: 말한 장 번호. 없으면 비어 있다. */
  card?: number;
  /** 3단계: 그 장에 바라는 점 · 고칠 내용. */
  note?: string;
  /** 2차 D2: 고칠 결과물 번호(이 대화의 「이미지 N」). 없으면 마지막 이미지다. */
  target?: number;
  /** 말로 답할 때 그 답. 주문일 때는 안 쓴다. */
  reply: string;
  /**
   * 말 속에 **이미 있던** 비율·결. 없으면 비어 있다.
   *
   * **읽어 두면 안 물어도 된다**(2026-09-21). 「세로로 만들어줘」라고 했는데
   * 비율을 또 물으면 안 들은 것이 된다. 그리고 지금까지는 그렇게 말해도
   * **무조건 정사각형**이 나왔다 — 읽을 자리가 없었다.
   */
  ratio?: string;
  look?: string;
}

/** 이번 판단에만 쓰는 것. */
export interface EasyPromptOptions {
  /** A3: 앞서 talk 인데 reply 가 비었다. 이번에는 꼭 쓰라고 한다. */
  retry?: boolean;
  /** A5: 「광고 소재 말고 ○○」라고 했다. 규격 안내를 선택지에서 뺀다. */
  adNegated?: boolean;
}

/** 판단 모델이 고를 수 있는 갈래 하나. */
export type EasyWant = EasyDecision["wants"];

/** 지금 쓸 수 있는 갈래를 정하는 재료. 모두 이 대화에서 읽은 사실이다. */
export interface EasyChoices {
  /** 이 대화에 카드뉴스 원고가 있나. */
  hasDraft: boolean;
  /** 그 원고로 카드를 만들었나(그림이 있다). */
  made: boolean;
  /** 이 대화의 마지막 결과가 고칠 수 있는 이미지 한 장인가. */
  madeImage: boolean;
  /** A5: 「광고 소재 말고 ○○」라고 했나. 그러면 규격 안내를 고를 수 없다. */
  adNegated?: boolean;
}

/**
 * **지금 쓸 수 있는 갈래**(2026-10-06 설계 A1).
 *
 * 프롬프트의 갈래 안내(`easyChatPrompt`)와 판단 틀의 선택지(`easyChatSpec`)가 **둘 다
 * 이 함수에서 나온다.** 전에는 프롬프트만 조건부였고 틀은 늘 열려 있어서, 고칠 것이 없는
 * 대화에서도 모델이 `image_edit` 을 골라 고정 문장으로 끝났다(실측 6/6).
 */
export function easyAvailableWants(choices: EasyChoices): EasyWant[] {
  return [
    "image", "cardnews", "either",
    ...(choices.hasDraft ? (["revise", "card_text"] as const) : []),
    ...(choices.hasDraft && choices.made ? (["card_redo", "caption", "download"] as const) : []),
    ...(choices.madeImage ? (["image_edit"] as const) : []),
    "talk", "detail_page",
    ...(choices.adNegated ? [] : (["ad_specs"] as const)),
  ];
}

/**
 * 고쳐 달라는데 고칠 것이 없을 때의 답.
 *
 * **빈 답으로 두지 않는다**(2026-10-06). 빈 답은 「무엇을 만들어 드릴까요?」로
 * 떨어지고, 사용자가 같은 말을 다시 보내도 같은 답만 되풀이됐다.
 */
export const NOTHING_TO_EDIT =
  "이 대화에는 아직 고칠 이미지나 카드뉴스가 없습니다. 먼저 무엇을 만들지 알려 주세요. 예: 「카페 신메뉴 포스터 만들어줘」";

/** 지난 대화를 몇 줄까지 보여 줄까. */
const 되돌아볼줄 = 12;

/** 한 줄이 길면 잘라 넣는다. 지난 말은 흐름만 알면 된다. */
const 한줄최대 = 400;

function 말한이(role: EasyMessage["role"]): string {
  if (role === "user") return "사용자";
  if (role === "image") return "도우미(이미지를 만들어 보여 줌)";
  return "도우미";
}

/**
 * 모델에게 보낼 글.
 *
 * **지난 대화를 같이 준다.** 「그거 말고 다른 걸로」 같은 말은 앞을 봐야 뜻이
 * 선다. 없으면 모델이 매번 처음 만난 사람처럼 군다.
 */
export function easyChatPrompt(
  history: readonly EasyMessage[],
  prompt: string,
  /**
   * 지금 붙어 있는 이미지 장수.
   *
   * **실측이 시킨 칸이다**(2026-09-21). 「이걸로 하나 그려줘」를 `talk` 로 읽고
   * 「어떤 그림을 원하시나요?」라고 되물었다 — 모델이 틀린 것이 아니다.
   * 「이걸로」가 무엇인지 **알려 주지 않았으니** 물을 수밖에 없다.
   *
   * 붙인 것이 있으면 그 사실을 적어 준다. 그러면 가리키는 말이 뜻을 갖는다.
   */
  attachmentCount = 0,
  /** 이 대화에 카드뉴스 원고가 있나. 있을 때만 「고치기」 갈래를 알려 준다(2단계 §7). */
  hasDraft = false,
  /** 그 카드뉴스를 만들었나(그림이 있다). 있을 때만 다시 그리기 · 게시글 · 받기를 알려 준다(3단계 §5). */
  made = false,
  /** 이 대화의 마지막 결과가 이미지 한 장인가. 그때만 「이미지 고치기」를 알려 준다(2026-10-06). */
  madeImage = false,
  /** 한 번 더 묻는 때처럼 이번 판단에만 쓰는 것(2026-10-06 설계 A3). */
  options: EasyPromptOptions = {},
): string {
  // 프롬프트의 갈래 안내와 판단 틀의 선택지가 **같은 함수**에서 나온다(2026-10-06 설계 A1).
  const 갈래 = easyAvailableWants({ hasDraft, made, madeImage, adNegated: options.adNegated });
  const 지난말 = history
    // 인사는 뺀다. 우리가 넣은 줄이라 대화의 내용이 아니다.
    .filter((message) => message.id !== "greeting")
    .slice(-되돌아볼줄)
    .map((message) => {
      const body = message.role === "image"
        ? "(이미지 한 장을 만들어 보여 줬습니다)"
        : visibleBody(message).slice(0, 한줄최대);
      return `${말한이(message.role)}: ${body}`;
    });

  return [
    // **화면이 쓰는 말과 같아야 한다.** 화면은 「이미지」인데 모델이 「그림」으로
    // 답하면 한 화면에서 두 이름이 오간다(2026-09-21 실측에서 실제로 그랬다).
    "당신은 이미지를 만들어 주는 도우미입니다. 한국어로 답합니다.",
    "",
    "사용자의 **마지막 말**이 무엇인지 가르세요.",
    "",
    "  image     지금 이미지 **한 장**을 만들어 달라는 것입니다. 포스터 · 배너 · 썸네일 ·",
    "            그림 · 사진 · 로고 · 프로필처럼 원래 한 장인 것이거나, 「한 장」 · 「하나」를",
    "            말했을 때입니다. 「카드뉴스 표지 한 장만」도 image 입니다.",
    "            **「이미지」라고 말해도 한 장입니다.** 「○○ 이미지 만들어줘」 · 「이미지 하나」 → image.",
    "  cardnews  **카드뉴스**(여러 장으로 된 카드 · 슬라이드 · 캐러셀)를 만들어 달라는 것입니다.",
    "  either    만들어 달라는 것은 분명한데 **한 장인지 여러 장인지 알 수 없습니다.**",
    "            「신메뉴 홍보물 만들어줘」 · 「이걸로 만들어줘」 · 「인스타에 올릴 거 만들어줘」.",
    "            짐작하지 말고 either 로 두세요. 사용자에게 물어봅니다.",
    "            단, 「포스터」 · 「배너」 · 「썸네일」처럼 **원래 한 장인 것**을 말했으면 묻지 말고 image 입니다.",
    "            「이미지」는 애매하지 않습니다. 「이미지 만들어줘」는 either 가 아니라 image 입니다.",
    ...(갈래.includes("revise")
      ? [
        "  revise    이 대화의 **카드뉴스 원고나 만든 카드를 고쳐 달라는 것**입니다. 「더 짧게」 ·",
        "            「20대 말투로」 · 「더 밝게」 · 「배경 파랗게」. 새 주제를 말하면 cardnews 입니다.",
        "  card_text  이 대화 카드뉴스의 **한 장 글**을 고쳐 달라는 것입니다. 「3번 제목을 ○○로」 · 「2번 더 짧게」.",
        "             장 번호를 card 에, 고칠 내용을 note 에 적습니다. **번호 없이** 전체를 고치면 revise 입니다.",
      ]
      : []),
    ...(갈래.includes("card_redo")
      ? [
        "  card_redo  만든 카드 중 **한 장을 다시 그려** 달라는 것입니다. 「3번 다시 그려줘」 · 「5번 글자 크게 다시」.",
        "             장 번호를 card 에, 바라는 점을 note 에 적습니다.",
        "  caption    인스타에 올릴 **게시글**을 써 달라는 것입니다. 「올릴 글 써줘」 · 「해시태그 붙여줘」.",
        "  download   만든 카드를 **내려받겠다**는 것입니다. 「다 받을게」 · 「저장할래」.",
      ]
      : []),
    ...(갈래.includes("image_edit")
      ? [
        "  image_edit  이 대화에서 **마지막으로 만든 이미지를 고쳐** 달라는 것입니다. 「로고를 이걸로 바꿔줘」 ·",
        "              「글자를 크게」 · 「배경만 파랗게」 · 「방금 거에서 ○○만 바꿔줘」. 붙인 이미지가 있으면 그것을",
        "              넣어 고쳐 달라는 뜻입니다. 전혀 다른 새 이미지를 말하면 image 입니다.",
      ]
      : []),
    /*
      **원고와 이미지가 함께 있으면 마지막 것을 알려 준다**(2026-10-06 독립 리뷰).
      안 알려 주면 모델은 고쳐 달라는 말에 `revise` 를 골라 앞의 카드뉴스 원고를
      고친다 — 사용자는 방금 만든 이미지를 보고 말한 것이다.
    */
    ...(갈래.includes("revise") && 갈래.includes("image_edit")
      ? [
        "  **이 대화에서 마지막으로 만든 것은 이미지 한 장입니다.** 무엇을 고칠지 콕 집지 않은 고쳐 달라는 말은",
        "  image_edit 입니다. 카드뉴스 원고나 카드를 **콕 집어** 말할 때만 revise · card_text 입니다.",
      ]
      : []),
    "  talk   그 밖의 모든 것입니다. 인사 · 질문 · 방금 만든 것에 대한 이야기 ·",
    "         무엇을 적어야 할지 묻는 것 · 잡담.",
    "  detail_page  **상세페이지**(쇼핑몰 제품을 길게 소개하는 세로 페이지)를 지금",
    "               만들어 달라는 것입니다. 사진을 붙였어도 같습니다.",
    "               상세페이지에 대해 **묻는 말**(「상세페이지 문구 좀 봐줘」)은 talk 입니다.",
    ...(갈래.includes("ad_specs") ? easyAdWantLines() : []),
    "",
    ...(갈래.includes("revise")
      ? [
        "**이 대화에는 카드뉴스 원고가 있습니다.** 「더 짧게」 · 「20대 말투로」 · 「더 밝게」처럼",
        "그 원고의 말투 · 길이 · 내용이나 카드의 모습을 바꿔 달라는 말은 talk 도 image 도 아니라 **revise** 입니다.",
        "원고에 대해 **묻기만** 하는 말(「원고 몇 장이야?」)은 talk 입니다.",
        "",
      ]
      : []),
    "**낱말로 가르지 마세요.** 「방금 그린 거 왜 그렇게 나왔어?」에는 「그린」이",
    "있지만 묻는 말입니다. 「포스터 만들 때 뭘 적어야 해?」도 묻는 말입니다.",
    "**지금 한 장 만들어 내놓기를 바라는지**만 보세요.",
    "",
    "`talk` 이면 `reply` 에 답을 쓰세요. 두세 문장이면 충분합니다.",
    "상대는 이미지를 만들러 온 사람입니다. 도움이 될 말을 하고, 필요하면",
    "**무엇을 적으면 되는지 예를 들어** 주세요.",
    "",
    `${빈답갈래(갈래)} 면 \`reply\` 는 빈 글로 두세요.`,
    ...(갈래.includes("card_text") ? ["`card` 는 말에 장 번호가 있을 때만 적고 없으면 0, `note` 는 없으면 빈 글로 두세요."] : []),
    "`detail_page` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다.",
    ...(갈래.includes("ad_specs") ? ["`ad_specs` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다."] : []),
    "",
    // 갈래 이름은 쓸 수 있는 것만 적는다(A1) — 같은 목록을 넘긴다.
    ...easyCapabilityLines(갈래),
    "── 말 속에 비율이나 그림체가 있나 ──",
    "",
    "**있을 때만 적습니다.** 없으면 그 칸을 비워 두세요. 지어내면 사용자가 말한",
    "적 없는 모양으로 나오고, 왜 그렇게 나왔는지 알 길이 없습니다.",
    "",
    `  ratio  ${EASY_RATIOS.map((one) => `${one.id}(${one.label})`).join(" · ")}`,
    `  look   ${EASY_LOOKS.map((one) => `${one.id}(${one.label})`).join(" · ")}`,
    "",
    "**모양이나 올릴 자리를 직접 말했을 때만** 고릅니다. 「세로로」·「가로로」·",
    "「인스타 피드에」·「스토리에」·「16:9 로」처럼요. 그림체도 「실사로」·",
    "「애니풍으로」처럼 **직접 말했을 때만** 고릅니다.",
    "",
    "**쓰임을 가리키는 말만으로는 고르지 마세요.** 「포스터」·「배너」·「썸네일」은",
    "무엇에 쓸지를 말할 뿐 모양을 말한 것이 아닙니다. 그런 말만 있으면 **비웁니다.**",
    "모양은 사용자에게 따로 물어봅니다. 여기서 앞질러 고르면 **말한 적 없는",
    "모양**으로 나가고, 사용자는 왜 그렇게 나왔는지 알 길이 없습니다.",
    "",
    /*
      **화면이 쓰는 말로 답하게 한다.** 위에서 「이미지」라고 불러 줘도 모델은
      제 말투로 「그림」이라고 답했다(2026-09-21 실측). 화면은 「이미지 만들기」·
      「이미지 모델」인데 답만 「그림」이면 한 화면에 두 이름이 오간다.
    */
    "답할 때 **「그림」이라 하지 말고 「이미지」**라고 쓰세요.",
    "",
    ...(attachmentCount > 0
      ? [
        `사용자가 지금 **이미지 ${attachmentCount}장을 붙여 두었습니다.**`,
        "붙여 둔 채로 「이걸로」·「이거」·「이 사진으로」라고 하면 **그것을 재료로",
        "만들어 달라는 주문**입니다. 무엇을 가리키는지 되묻지 마세요.",
        "",
        // A1-2: 만든 것이 없는 대화에서 「사진 속 ○○을 바꿔줘」는 새 이미지다.
        ...(갈래.includes("image_edit") || 갈래.includes("revise") ? [] : easyFirstPhotoLines()),
      ]
      : []),
    // 2차 D3: 쓴 사진은 내려간다. 만든 것이 있는데 붙은 사진이 없으면 다시 붙여 달라고 하게 한다.
    ...(attachmentCount === 0 && history.some((message) => message.role === "image") ? easyPhotoGoneLines() : []),
    ...(options.retry
      ? ["**앞서 talk 를 고르고 reply 를 비웠습니다.** talk 이면 이번에는 reply 에 꼭 답을 쓰세요.", ""]
      : []),
    ...(갈래.includes("ad_specs") && adQuestionOrigin(history) !== undefined ? easyAdAnswerLines() : []),
    // 2차 D1: 광고 물음이 아닌 물음 뒤면 그 답일 수 있다고 알린다. 광고 물음은 바로 위 1차 안내가 맡는다.
    ...물음뒤줄(history, 갈래),
    지난말.length ? "── 지난 대화 ──" : "── 첫 말입니다 ──",
    ...지난말,
    "",
    "── 사용자의 마지막 말 ──",
    prompt,
  ].join("\n");
}

/** 「지금 쓸 수 있는 것」 사실. 판단 읽기와 단추 답(`fitButtonDecision`)이 같은 것을 본다. */
export interface EasyAvailability {
  canRevise?: boolean;
  made?: boolean;
  /** 고칠 수 있는 이미지가 이 대화에 있나(2차: 지운 것만 빼고 — 만드는 중 · 못 만든 것도 넣는다). */
  editableImage?: boolean;
}

/**
 * **쓸 수 없는 갈래를 바꿔 읽는다**(2026-10-06, 2차 최종 리뷰 1 · b).
 *
 * - 이미지 고치기는 고칠 이미지가 있어야 한다. 없으면 원고 고치기로, 원고도 없으면 고칠 것이 없다고 답한다
 * - 고칠 원고가 없는데 고치라고 하면 만든 이미지를 고친다 — 모델은 이미지를 고쳐 달라는 말에도 `revise` 를
 *   골랐다(2026-10-06 실측 6/6). 둘 다 없으면 빈 답이 아니라 안내 — 빈 답은 같은 말을 되풀이했다
 * - 다시 그리기 · 게시글 · 받기는 만든 카드가 있어야 한다(3단계 §5). 원고만 있으면 먼저 만들라고 답한다
 *
 * **다른 일하는 갈래로 바꿔 읽으면 `reply` 를 비운다**(2차 최종 리뷰 b). 2차부터는 모든 갈래에서 reply 를
 * 쓰는데, 그 글은 모델이 처음 고른 일로 쓴 말이라(「원고를 고치겠습니다」) 바뀐 일의 머리말로 나가면 틀린다.
 * 비우면 코드 문장이 나간다.
 */
export function availableWant(said: EasyWant, reply: string, options: EasyAvailability): { wants: EasyWant; reply: string } {
  if (said === "image_edit" && !options.editableImage) {
    return options.canRevise ? { wants: "revise", reply: "" } : { wants: "talk", reply: NOTHING_TO_EDIT };
  }
  if ((said === "revise" || said === "card_text") && !options.canRevise) {
    return options.editableImage ? { wants: "image_edit", reply: "" } : { wants: "talk", reply: NOTHING_TO_EDIT };
  }
  if (만든뒤갈래.has(said) && !options.canRevise) return { wants: "talk", reply };
  if (만든뒤갈래.has(said) && !options.made) return { wants: "talk", reply: NOT_MADE_YET };
  return { wants: said, reply };
}

/** 단추 답이 다른 일로 바뀌어 읽힐 자리일 때의 답(2차 최종 리뷰 1). 프로젝트 만들기 앞의 막이도 쓴다. */
export const CANNOT_DO_NOW =
  "고칠 이미지나 카드뉴스가 그 사이 바뀌어 말씀대로 할 수 없습니다. 무엇을 할지 다시 알려 주세요.";

/**
 * **단추 답의 갈래도 지금 사실로 다시 본다**(2차 최종 리뷰 1 · Review Focus 7). 단추 답은 판단 모델을 안
 * 부르고 물음 줄에 적어 둔 판단으로 간다 — 물은 뒤에 이미지를 지웠거나 원고가 사라졌으면 그 판단은 낡았다.
 * 판단 읽기와 같은 `availableWant` 를 지나고, **바뀌면 다른 일로 새지 않는다**: 판단 읽기라면 바꿔 읽을
 * 다른 일하는 갈래(원고 고치기 ↔ 이미지 고치기)여도 그 일을 안 하고 사실 문장으로 끝낸다. 누른 단추와 다른
 * 일에 값이 나가면 안 된다.
 */
export function fitButtonDecision(decision: EasyDecision, options: EasyAvailability): EasyDecision {
  const fitted = availableWant(decision.wants, decision.reply, options);
  if (fitted.wants === decision.wants) return decision;
  return { wants: "talk", reply: fitted.wants === "talk" && fitted.reply ? fitted.reply : CANNOT_DO_NOW };
}

/** 마지막 줄(단추 답 실패 짝은 건너뛴다)이 물음이면 그 물음 · 답 표시 안내(2차 D1). */
function 물음뒤줄(history: readonly EasyMessage[], 갈래: readonly EasyWant[]): string[] {
  const ask = askChain(history)?.ask;
  return ask && ask.kind !== "ad" ? easyAskAnswerLines({ kind: ask.kind, text: ask.text }, 갈래) : [];
}

/**
 * 돌아온 것을 읽는다.
 *
 * **모르는 것이 오면 시끄럽게 실패한다.** 「모르겠으면 그림」으로 떨어뜨리면
 * 인사 한 마디에 값이 나가고, 「모르겠으면 말」로 떨어뜨리면 주문이 조용히
 * 씹힌다. 둘 다 사용자가 원인을 알 수 없는 자리다.
 */
export function readEasyDecision(
  raw: unknown,
  /** `editableImage`: 이 대화의 마지막 결과가 고칠 수 있는 이미지 한 장인가(2026-10-06). */
  options: EasyAvailability = {},
): EasyDecision {
  const value = raw as { wants?: unknown; reply?: unknown; ratio?: unknown; look?: unknown; card?: unknown; note?: unknown } | null;
  const said = value?.wants;

  if (typeof said !== "string" || !아는갈래.has(said)) {
    throw new Error(`무슨 뜻인지 가리지 못했습니다: ${JSON.stringify(said)}`);
  }
  // AI 가 쓴 글이 표시 머리로 시작하면 풀어 둔다 — 저장한 말 줄이 물음 · 머리말로 읽히지 않게(2차 최종 리뷰 c).
  const { wants, reply } = availableWant(
    said as EasyWant, plainAiText(typeof value?.reply === "string" ? value.reply.trim() : ""), options,
  );
  const card = typeof value?.card === "number" && Number.isInteger(value.card) && value.card > 0 ? value.card : undefined;
  const note = typeof value?.note === "string" && value.note.trim() ? value.note.trim().slice(0, 500) : undefined;

  return {
    wants,
    reply,
    ...(card ? { card } : {}),
    ...(note ? { note } : {}),
    /*
      **모르는 값은 버린다.** 목록에 없는 비율·결이 오면 그것은 지어낸 것이고,
      그대로 넘기면 만들기가 거절당한다(`PosterProjectInputSchema`). 비워 두면
      물어보거나 기본값으로 간다 — 둘 다 사용자가 이해할 수 있는 결과다.
    */
    ...(아는비율.has(value?.ratio as string) ? { ratio: value!.ratio as string } : {}),
    /*
      **`auto` 는 안 말한 것과 같다.** 「레퍼런스 스타일」이 기본값이라 값이
      없는 것과 뜻이 겹치는데, 값으로 오면 「말했다」로 읽혀 **묻지 않게 된다**
      (2026-09-21 실측에서 그랬다).
    */
    ...(아는결.has(value?.look as string) && value!.look !== "auto"
      ? { look: value!.look as string }
      : {}),
  };
}

/** 말 · 안내로 끝나는 갈래. 이것들은 `reply` 를 비우라는 줄에 넣지 않고 따로 적는다. */
const 따로적는갈래 = new Set<string>(["talk", "detail_page", "ad_specs"]);

/** `reply` 를 비워야 하는 갈래를 프롬프트에 적을 꼴로. 쓸 수 있는 것만 적는다(A1). */
function 빈답갈래(갈래: readonly EasyWant[]): string {
  return 갈래.filter((one) => !따로적는갈래.has(one)).map((one) => `\`${one}\``).join(" · ");
}

const 아는갈래 = new Set([
  "image", "cardnews", "either", "revise", "talk", "detail_page", "card_redo", "card_text", "caption", "download",
  "image_edit", "ad_specs",
]);
const 만든뒤갈래 = new Set(["card_redo", "caption", "download"]);
const 아는비율 = new Set(EASY_RATIOS.map((one) => one.id));
const 아는결 = new Set(EASY_LOOKS.map((one) => one.id as string));
