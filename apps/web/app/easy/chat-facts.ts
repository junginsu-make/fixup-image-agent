/**
 * 판단 모델에게 주는 **사실 줄**(2026-10-06 설계 A1-2 · A4).
 *
 * `chat.ts` 의 `easyChatPrompt` 가 이미 길어 새 덩어리는 여기 둔다.
 *
 * **이 글에는 쓸 수 없을지 모르는 갈래 이름(영문)을 적지 않는다.** 지금 쓸 수 없는 갈래
 * 이름이 프롬프트에 보이면 모델이 그것을 고른다 — A1 이 막으려는 바로 그 일이다(실측 6/6).
 * 갈래 이름을 적어야 하는 줄은 **받은 목록에 있을 때만** 싣는다.
 */
import type { EasyWant } from "./chat";
import { AD_ANSWER_NOTE, AD_QUESTION } from "./ad-ask";
import type { EasyAskKind } from "./row-marks";
import type { EasyImageState, EasyResultEntry } from "./image-numbers";

/**
 * 「쉽게」가 하는 일 · 안 하는 일(A4). 안 되는 것을 물으면 모델이 사실을 몰라 엉뚱하게
 * 답했다. 그 사실과 갈 곳을 말로 답하게 한다.
 *
 * **만들어 달라는 말과 묻기만 하는 말을 가른다**(최종 리뷰 2026-10-06). 「안 되는 것을
 * 물으면 talk」 한 줄만 두면 「상세페이지 만들어줘」도 talk 로 읽혀 안내 단추가 안 붙는다.
 * 만들어 달라면 그 갈래(안내 단추가 붙는다), 되는지 묻기만 하면 talk 로 답한다.
 */
export function easyCapabilityLines(wants: readonly EasyWant[]): string[] {
  return [
    "── 쉽게가 하는 일 · 안 하는 일 (사실입니다. 이것과 다르게 말하지 마세요) ──",
    "",
    "하는 일: 이미지 한 장 만들기 · 카드뉴스(여러 장) 만들기 · 이 대화에서 만든 이미지를 이어서 고치기 ·",
    "  만든 카드뉴스 손보기(한 장 다시 그리기 · 한 장 글 고치기 · 올릴 게시글 쓰기 · 내려받기).",
    "안 하는 일 (아래 두 문장은 사실입니다. **되는지 묻는 말에는 이 문장을 그대로(두 부분 모두) 답하세요.** 한 부분만 말하거나 바꿔 말하지 마세요):",
    "  - 쉽게(이 대화)에서는 상세페이지를 만들지 않습니다. 「상세페이지 만들기」 화면에서 만들 수 있습니다.",
    "  - 쉽게(이 대화)에서는 광고 규격별로 여러 장 뽑지 않습니다. 「광고소재」 화면에서는 됩니다.",
    "    (네이버 · 구글 · 카카오 같은 포털 광고 규격으로 여러 장 뽑기, 리사이징 · 베리에이션)",
    ...(wants.includes("detail_page") ? ["상세페이지를 **만들어 달라는** 말은 detail_page 입니다."] : []),
    // 「광고 소재 말고」면 목록에서 빠진다 — 그때는 이름도 안 적는다(A1).
    ...(wants.includes("ad_specs")
      ? ["광고 규격별로 여러 장(리사이징 · 베리에이션)을 **만들어 달라는** 말은 ad_specs 입니다."]
      : []),
    "**되는지 묻기만 하는** 말(「여기서 상세페이지도 돼?」 · 「광고 사이즈별로도 돼?」)은 talk 입니다.",
    "  안 되는 것이면 **된다고 하지 말고** 그 사실과 갈 곳을 reply 로 답하세요.",
    "",
  ];
}

/**
 * A1-2: 아직 만든 것이 없는 대화에 사진이 붙어 있을 때. 「두번째 사진에 있는 사람을
 * 화장품으로 바꿔줘」를 모델은 고치기로 읽고 「고칠 것이 없습니다」로 끝났다(운영
 * 2026-10-06 `38b11604` · `e5a96f94`).
 */
export function easyFirstPhotoLines(): string[] {
  return [
    "**이 대화에서 아직 만든 것이 없습니다.** 「붙인 사진 속 ○○을 바꿔줘」 ·",
    "「두번째 사진에 있는 사람을 화장품으로 바꿔줘」는 고칠 것이 없다는 말이 아니라",
    "**붙인 사진으로 새 이미지를 만들라는 것**입니다. image 로 고르세요.",
    "",
  ];
}

/** 광고 규격 갈래 안내(A5). 갈래 목록에 `ad_specs` 가 있을 때만 싣는다. */
export function easyAdWantLines(): string[] {
  return [
    "  ad_specs  이미 만든 이미지를 **네이버 · 구글 · 카카오 같은 광고 규격별로 여러 장** 뽑아 달라는 것입니다.",
    "            「규격별로」 · 「사이즈별로」 · 「리사이징」 · 「베리에이션」 · 「구글 배너 사이즈별로 다」.",
    "            광고 이미지를 **새로 만들어** 달라는 말은 image 입니다.",
  ];
}

/**
 * 바로 앞 도우미 줄이 광고 물음일 때(A5). 단추 대신 말로 답해도(「사이즈별로요」) 앞의
 * 물음을 알고 가르게 한다. 답이 아니면 그 말대로 — 대화를 붙잡지 않는다.
 */
export function easyAdAnswerLines(): string[] {
  return [
    `**도우미가 바로 앞에서 「${AD_QUESTION}」라고 물었습니다.** 사용자의 마지막 말은 그 답일 수 있습니다.`,
    "광고 이미지를 바라면 image, 규격별 · 사이즈별 · 리사이징 · 베리에이션을 바라면 ad_specs 입니다.",
    // 답일 때만 서버가 물음 앞의 처음 말을 잇는다(최종 리뷰 2026-10-06). 이미지 길은 note 를 안 쓴다.
    `마지막 말이 그 물음의 답이면 \`note\` 에 \`${AD_ANSWER_NOTE}\` 라고 적으세요. 답이 아니면 \`note\` 는 빈 글로 두세요.`,
    "물음에 답하지 않고 다른 것을 말했으면(「그건 됐고 고양이 포스터 만들어줘」) 그 말대로 가르세요.",
    "",
  ];
}

/**
 * 물음 갈래마다 답하는 법(2차 최종 리뷰 6). 같은 물음이 되풀이되지 않게 — 서버도 `settleTypedAnswer` 로
 * 한 번 더 본다(모양 물음 뒤에는 모양을 안 묻고, 갈래 물음 뒤 either 는 한 장으로).
 */
const 물음갈래답: Record<EasyAskKind, string> = {
  kind: "이 물음은 한 장(image)인지 카드뉴스(cardnews)인지입니다. 정하지 못한 답(「아무거나」)이면 image 입니다. either 로 다시 묻지 마세요.",
  ratio: "이 물음은 모양(비율 · 그림체)입니다. 답에 모양이 있으면 ratio · look 에 적고, 모양을 말하지 않은 답이면 ratio · look 을 비워 두세요. 같은 물음을 다시 하지 않습니다. 정사각형으로 만듭니다.",
  photo: "이 물음은 붙인 사진을 어떻게 쓸지입니다. 답이면 앞의 주문과 같은 갈래(image · cardnews)로 고르세요.",
  reference: "이 물음은 따라 만들 카드뉴스입니다. 답이면 cardnews 로 고르세요.",
  target: "이 물음은 고칠 이미지 번호입니다. 답이면 image_edit 로 고르고 target 에 그 번호(#N)를 적으세요.",
  card: "이 물음은 카드 장 번호입니다. 답이면 물을 때의 갈래(card_text · card_redo)로 고르고 card 에 그 번호를 적으세요.",
};

/**
 * 바로 앞 줄이 물음일 때(2026-10-07 2차 D1 — 1차 광고 물음 안내의 일반화). 단추 대신 말로 답해도
 * 앞 물음을 알고 가르게 한다. 답이면 서버가 물음을 부른 처음 말을 잇는다 — 대화를 붙잡지 않는다.
 */
export function easyAskAnswerLines(ask: { kind: EasyAskKind; text: string }, wants: readonly EasyWant[]): string[] {
  const 장갈래 = (["card_text", "card_redo"] as const).filter((one) => wants.includes(one));
  return [
    `**도우미가 바로 앞에서 「${ask.text}」라고 물었습니다.** 사용자의 마지막 말은 그 답일 수 있습니다.`,
    "답이면 그 물음을 부른 앞의 주문을 이어서 하는 것입니다. 앞의 주문과 같은 갈래로 고르세요.",
    물음갈래답[ask.kind],
    `마지막 말이 그 물음의 답이면 \`note\` 에 \`${AD_ANSWER_NOTE}\` 라고 적으세요. 답이 아니면 \`note\` 는 빈 글로 두세요.`,
    ...(장갈래.length ? [`단, ${장갈래.join(" · ")} 로 고르면 note 에는 answer 대신 고칠 내용을 적습니다.`] : []),
    "물음에 답하지 않고 다른 것을 말했으면(「그건 됐고 고양이 포스터 만들어줘」) 그 말대로 가르세요.",
    "",
  ];
}

/**
 * 쓴 사진은 입력창에서 내려간다(2026-10-07 2차 D3). 「같은 사진으로 하나 더」처럼 앞에서 쓴 사진을
 * 다시 쓰자는데 지금 붙은 사진이 없으면, 만들지 말고 다시 붙여 달라고 답하게 한다. 사진 없이 만들면
 * 값만 나가고 바라는 것이 안 나온다.
 */
export function easyPhotoGoneLines(): string[] {
  return [
    "**붙인 사진은 이미지를 만들거나 고치는 데 쓴 뒤 입력창에서 내려갑니다.** 지금은 붙은 사진이 없습니다.",
    "사용자가 앞에서 쓴 사진을 다시 쓰자고 하면(「같은 사진으로 하나 더」 · 「아까 그 로고로」) 만들지 말고 talk 로 고르고,",
    "reply 에 「그 사진을 다시 붙여 주세요. 라이브러리에 있습니다.」라고 알려 주세요.",
    "",
  ];
}

const 상태말: Record<EasyImageState, string> = {
  done: "완료", making: "만드는 중", failed: "만들지 못함", deleted: "지움", unknown: "확인 못 함",
};

function 결과물줄(one: EasyResultEntry): string {
  const 말 = one.words ? `「${one.words}」` : "";
  if (one.kind === "deleted") return [`#${one.n} (지운 결과)`, 말].filter(Boolean).join(" · ");
  // 저장소를 못 읽은 것은 지운 것으로 말하지 않는다(리뷰 1차 수정 2).
  if (one.kind === "unknown") return [`#${one.n} (확인 못 함)`, 말].filter(Boolean).join(" · ");
  if (one.kind === "cardnews") return [`#${one.n} 카드뉴스`, 말].filter(Boolean).join(" · ");
  return [`#${one.n} 이미지`, 말, 상태말[one.state], one.fromN ? `#${one.fromN} 을 고친 것` : ""].filter(Boolean).join(" · ");
}

/**
 * **이 대화의 결과물 목록**(2026-10-07 2차 D2, 최종 리뷰 5). 지난 대화 창 밖의 결과물도 번호로 고를 수 있게
 * 따로 싣는다. 번호는 화면의 「이미지 N」 · 「카드뉴스 N」과 같고, 이미지 · 카드뉴스 · 지운 것을 함께 센다.
 */
export function easyResultListLines(entries: readonly EasyResultEntry[]): string[] {
  if (!entries.length) return [];
  return [
    "── 이 대화의 결과물 (번호는 화면의 「이미지 N」 · 「카드뉴스 N」과 같습니다) ──",
    ...entries.map(결과물줄),
    "번호는 이미지 · 카드뉴스 · 지운 결과를 함께 셉니다. 이미지로 고칠 수 있는 것은 「이미지」라고 적힌 번호뿐입니다.",
    "",
  ];
}

/** 지난 대화의 결과물 줄을 판단 모델에 보일 글(2차 D2). 번호를 모르면 예전 글 그대로다. */
export function easyResultRowText(entry: EasyResultEntry | undefined): string {
  if (!entry) return "(이미지 한 장을 만들어 보여 줬습니다)";
  if (entry.kind === "cardnews") return `(#${entry.n} 카드뉴스를 만들어 보여 줬습니다)`;
  if (entry.kind === "deleted") return `(#${entry.n} 결과물을 만들어 보여 줬습니다. 지금은 지웠습니다)`;
  if (entry.kind === "unknown") return `(#${entry.n} 결과물을 만들어 보여 줬습니다)`;
  return `(#${entry.n} 이미지를 만들어 보여 줬습니다)`;
}
