import { fitButtonDecision, type EasyDecision } from "../../app/easy/chat";
import type { EasyAdStep } from "../../app/easy/ad-ask";
import { isGenerating } from "../../app/easy/cardnews-after";
import { SEE_FAILED } from "../../app/easy/see-prompt";
import type { posterReferencesByIds } from "../poster/references";
import { writeAdGuide } from "./ad-turn";
import type { lastCardnewsProject } from "./cardnews-steps";
import type { createEasyChatProvider } from "./chat-provider";
import { countEasyImages } from "./image-edit-turn";
import type { EasyImageFacts } from "./image-list";
import { judgeEasyTurn } from "./judge";
import { rewriteReplyBySeeing } from "./see-turn";
import type { EasyStore } from "./store";

/**
 * **한 턴의 판단**(2026-10-07 후속 Task 10 — `app/api/easy/generate/route.ts` 에서 동작 그대로 옮겼다).
 *
 * 단추 답이면 물음 줄의 판단, 아니면 판단 모델 · 규격 안내 글 · 이미지 보고 답하기다. 라우트가 판정 예약을 연
 * `try` 안에서 부른다 — 여기서 던진 오류는 라우트가 판정 예약을 실패로 닫고 다시 던진다(예약 · 정산은 라우트에 그대로).
 */
export async function decideTurn(ctx: {
  auth: { member: { userId: string } };
  단추판단: EasyDecision | undefined;
  고칠원고: Awaited<ReturnType<typeof lastCardnewsProject>>;
  만들었나: boolean;
  이미지들: EasyImageFacts;
  provider: ReturnType<typeof createEasyChatProvider>;
  지난줄: Awaited<ReturnType<EasyStore["listMessages"]>>;
  prompt: string;
  처음사진: { ids: string[]; photos: Awaited<ReturnType<typeof posterReferencesByIds>> };
  이을사진: string[];
  옛골랐나: boolean;
  광고: EasyAdStep | undefined;
}): Promise<{ decision: EasyDecision; 광고안내: string }> {
  const { auth, 단추판단, 고칠원고, 만들었나, 이미지들, provider, 지난줄, prompt, 처음사진, 이을사진, 옛골랐나, 광고 } = ctx;
  let decision: EasyDecision;
  let 광고안내 = "";
  if (단추판단) {
    /*
     * 단추 답은 물음 줄의 판단으로 바로 간다 — 글 모델을 안 부른다(2차 D1, 값 한 번 절약). 물은 뒤 고칠
     * 것이 사라졌으면 판단 읽기와 같은 사실로 다시 보고 사실만 말한다 — 다른 일로 새지 않는다
     * (`fitButtonDecision`, 2차 최종 리뷰 1).
     */
    decision = fitButtonDecision(단추판단, { canRevise: Boolean(고칠원고), made: 만들었나, editableImage: 이미지들.madeImage });
  } else {
    // 한 턴의 판단 — 선택지(A1) · 빈 답 재질문(A3)은 `lib/easy/judge.ts` 가 한다.
    decision = await judgeEasyTurn({
      decide: (text, wants) => provider.decide(text, wants),
      history: 지난줄.map((row) => ({ id: row.id, role: row.role, body: row.body })),
      prompt,
      /*
       * 붙인 것이 있는지 알려 준다. 안 알려 주면 「이걸로 하나 그려줘」를 되묻는다(2026-09-21 실측).
       * 새로고침 뒤 물음에 말로 답하면 화면에 첨부가 없다 물음 줄에 적어 둔 사진을 센다. 안 세면
       * 「그 사진을 다시 붙여 주세요」(D3 줄)가 나가는데, 그 사진은 답으로 읽히면 아래에서 그대로 쓴다.
       */
      attachmentCount: 처음사진.ids.length || 이을사진.length,
      // 고칠 수 있는 이미지가 이 대화에 있나(2차 D2 — 마지막 결과만이 아니라 지우지 않은 이미지 하나라도. 최종 리뷰 a).
      choices: { hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: 이미지들.madeImage },
      lastIsImage: 이미지들.lastIsImage,
      // 카드뉴스 장수 · 만드는 중(2차 D4). 「몇 번 장?」 · 「다 만든 뒤에」를 AI 가 제 말로 답하게.
      cards: 고칠원고 ? { count: 고칠원고.data.flow?.cards.length ?? 0, generating: isGenerating(고칠원고) } : undefined,
      // 골랐으면 판단의 갈래는 버려진다 — 빈 talk 재질문을 안 한다(A3 · 최종 리뷰).
      kindPicked: 옛골랐나,
      adStep: 광고,
      images: 이미지들.entries,
    });
    /*
     * **규격 안내는 글 모델이 우리 기능의 사실로 쓴다**(A5). 판정과 같은 예약 안에서 부른다.
     * 갈래를 단추로 골랐으면 쓰지 않는다 — 아래에서 고른 갈래가 이겨 이 글은 버려진다. 이미지 수는
     * 서로 다른 포스터 작업만 센다(`countEasyImages`). 글 모델이 실패해도 코드가 쓴 안내로 대신한다.
     */
    if (decision.wants === "ad_specs" && !옛골랐나) {
      광고안내 = await writeAdGuide((text) => provider.writeAdGuide(text), {
        prompt,
        imageCount: await countEasyImages(auth.member.userId, 지난줄),
      });
    }
    /*
     * **이미지를 보고 답한다. 묻거나 볼 때만**(2026-10-07 2차 D5). 판단 모델이 볼 것(`see`)을 적은 talk 턴에만
     * 그 이미지 · 붙인 사진(⓪ 확인을 지난 것)을 넣어 reply 를 다시 쓴다. 판정 예약 안이라 회원 크레딧은 0 이고
     * 값은 회사 원가로 계량기에 적힌다. 고른 갈래가 talk 를 이길 턴은 부르지 않는다(버려질 답에 값을 안 쓴다).
     * 볼 것이 없었으면 판단의 답 그대로, 보기가 실패했으면 못 봤다고 사실대로 말한다(`SEE_FAILED`, 최종 리뷰 10).
     */
    if (decision.wants === "talk" && decision.see?.length && !옛골랐나) {
      const 본것 = await rewriteReplyBySeeing({
        userId: auth.member.userId, rows: 지난줄, prompt, see: decision.see, facts: 이미지들,
        photos: 처음사진.photos, write: (text, images) => provider.writeSeenReply(text, images),
      });
      if (본것.kind === "seen" || 본것.kind === "old") decision = { ...decision, reply: 본것.reply };
      if (본것.kind === "failed") decision = { ...decision, reply: SEE_FAILED };
    }
  }
  return { decision, 광고안내 };
}
