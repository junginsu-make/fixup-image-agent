"use client";
import { observeAccountResponse } from "../../lib/membership/account-events";
import { useCreditPolicy } from "../_components/credit-policy-provider";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, PanelLeft, Send } from "lucide-react";
import { Button, Textarea, cn } from "@fixup/ui";
import { DEFAULT_TEXT_MODEL } from "@fixup/shared";
import { randomId } from "../../lib/browser-safe";
import { billableFetch } from "../../lib/billable-fetch";
import { EasyMessageRow, EasyThinkingRow } from "./_components/message";
import { EasyModelBar, type ImageModelChoice } from "./_components/model-bar";
import { easyTurn, type EasyMessage } from "./turn";
import { easyCost } from "./cost";
import { easyOptionMeta, type EasyImageOptions } from "./options";
import { STILL_MAKING, collectEasyImage } from "./collect";
import { useEasyResume } from "./use-resume-images";
import { useEasyAsks } from "./use-easy-asks";
import { usedAttachments } from "./attachments-after";
import { photoTypedReply, type EasyButtonReply } from "./ask-answers";
import { answerableAskId } from "./ask-chain";
import { withPick } from "./row-marks";
import { EasyAskControls } from "./_components/ask-row";
import { keptAfterFailure, lostAfterFailure } from "./send-failure";
import { EASY_DEFAULT_RATIO } from "./ask";
import { EasyAttachChoice } from "./_components/attach-choice";
import { EasyLibraryPicker, useEasyLibrary } from "./_components/library-attach";
import { previousRolesFor, rememberRoles } from "./photo-ask-state";
import type { CardPhotoRole } from "./photo-roles";
import { cardResults } from "./cardnews-state";
import type { CardnewsProjectLike } from "./cardnews-view";
import { useEasyCardnews } from "./use-cardnews";
import { TOGGLE_EVENT } from "./_components/conversation-list";
import { EasyResultPanel } from "./_components/result-panel";
import { EasySplitHandle, useSplitWidth } from "./_components/split-handle";
import { openImageGallery } from "../_components/image-viewer";
import { attachmentFromUpload, easyUploadForm } from "./upload";
import { UPLOAD_RIGHTS_NOTE } from "../../lib/rights/upload-notice";

/**
 * Easy 모드의 대화 (설계 §1·§3).
 *
 * ── 되묻지 않는다 ────────────────────────────────────────────
 *
 * 붙일지 **한 번** 묻고, 그 다음은 사용자가 친 말 그대로 만든다(설계 §6).
 * 2026-09-02 설계의 핵심이 되묻기였는데 그것을 버렸다 — 뺄수록 쉬워지고,
 * 뺄수록 어긋날 수 있다. 그 맞바꿈을 눈 뜨고 했다.
 *
 * ── 판단은 여기 없다 ─────────────────────────────────────────
 *
 * 「지금 입력창을 열어도 되나」는 `turn.ts` 가 값으로 정한다. 화면 안에 두면
 * 값으로 못 잰다 — 이 저장소가 계속 지켜 온 방식이다.
 */

interface EasyClientProps {
  conversationId: string;
  initialMessages: EasyMessage[];
  /** 다시 열었을 때 그림이 보이게. 줄 id → 주소(`load.ts` 가 찾아 준다). */
  initialUrls?: Record<string, string>;
  /**
   * 줄 id → **그 이미지를 만든 조건**.
   *
   * 지어내지 않는다 — 만든 작업에서 읽어 온 값이다(`options.ts`).
   */
  initialOptions?: Record<string, EasyImageOptions>;
  imageModels: ImageModelChoice[];
  defaultImageModel: string;
  /** 값 셈에 쓴다. 화면이 바꿀 수 없다(설계 §9). */
  ratioId: string;
  /** 줄 id → 카드뉴스 작업(2단계 §8). 다시 열 때 `load.ts` 가 찾아 준다. */
  initialCardnews?: Record<string, CardnewsProjectLike & { title?: string }>;
  /** 아직 결과를 안 받은 그림 줄 id(2026-10-06 설계 B3). 다시 열 때 이 줄만 이어 받는다(`load.ts`). */
  initialPending?: string[];
  /** 끝났는데 그림이 없는 그림 줄 id(설계 B5). 다시 열면 「만들고 있습니다」 대신 실패로 보인다. */
  initialFailed?: string[];
  /** 줄 id → 「이미지 N」 · 「카드뉴스 N」(2차 D2). 다시 열 때 `load.ts` 가 서버와 같은 함수로 센다. */
  initialResultLabels?: Record<string, string>;
}

/** 첨부 한 장. 올린 뒤의 모습이다. */
interface Attachment {
  id: string;
  url: string;
  title: string;
}

const 인사: EasyMessage = {
  id: "greeting",
  role: "system",
  body: "이미지를 붙이시겠어요? 없어도 만들 수 있습니다.",
};

export function EasyClient({
  conversationId,
  initialMessages,
  initialUrls,
  initialOptions,
  imageModels,
  defaultImageModel,
  ratioId,
  initialCardnews,
  initialPending,
  initialFailed,
  initialResultLabels,
}: EasyClientProps) {
  const creditPolicy = useCreditPolicy();
  const router = useRouter();
  const [messages, setMessages] = React.useState<EasyMessage[]>(initialMessages);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [startedWithout, setStartedWithout] = React.useState(initialMessages.length > 0);
  /*
    라이브러리 목록. **화면이 한 번 읽어 두 곳이 나눠 쓴다** — 시작 화면의
    「라이브러리에서」와 입력창의 폴더 단추다.
  */
  const library = useEasyLibrary();
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; retryable: boolean } | null>(null);
  const [textModel, setTextModel] = React.useState(DEFAULT_TEXT_MODEL);
  const [imageModel, setImageModel] = React.useState(defaultImageModel);
  const [urls, setUrls] = React.useState<Record<string, string>>(initialUrls ?? {});
  const [labels, setLabels] = React.useState<Record<string, string>>(initialResultLabels ?? {});
  /*
   * **물음 줄에서 고르는 중인 것**(2026-10-07 2차 D1). 물음은 이제 대화 줄로 남는다 — 화면은 비율
   * 토글 · 사진 고르기 · 레퍼런스 고르기처럼 그 자리에서 고르는 것만 든다(`use-easy-asks.ts`).
   */
  const asks = useEasyAsks();
  /*
   * **지난 역할**(설계 §2-4 차례 3). 이 사진으로 만들 때 정해진 역할을 사진 id 별로
   * 들고 있다가 다음 그림 턴에 보낸다. 안 그러면 「좀 더 밝게」에도 같은 물음이 뜬다.
   */
  const [lastRoles, setLastRoles] = React.useState<Record<string, CardPhotoRole>>({});
  /*
   * **만든 조건.** 다시 열 때는 서버가 읽어 주고, 지금 만든 것은 만들면서 적는다.
   * 새로고침을 기다렸다 보여 주면 방금 만든 것만 조건이 비어 보인다.
   */
  const [options, setOptions] = React.useState<Record<string, EasyImageOptions>>(initialOptions ?? {});

  /*
   * **구분선을 끌면 이 너비가 바뀐다**(2026-09-18 사용자 요청). 가두는 판단은
   * `split.ts` 가 값으로 한다.
   */
  const split = React.useRef<HTMLDivElement>(null);
  const { width: resultWidth, apply: setResultWidth } = useSplitWidth(split, "result");

  const file = React.useRef<HTMLInputElement>(null);
  const bottom = React.useRef<HTMLDivElement>(null);
  const alive = React.useRef(true);
  // StrictMode 가 효과를 껐다 켜도 다시 켠다 — 안 그러면 개발 화면에서 결과 받기가 멈춘다.
  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  // 다시 열면 아직 결과를 안 받은 줄을 이어 받는다(2026-10-06 설계 B3). 만든 직후와 같은 받기 함수다.
  const resumed = useEasyResume({
    messages: initialMessages, urls: initialUrls ?? {}, cardnewsIds: new Set(Object.keys(initialCardnews ?? {})),
    pendingIds: new Set(initialPending ?? []), failedIds: new Set(initialFailed ?? []),
    isAlive: () => alive.current,
    onImage: (rowId, image) => setUrls((current) => ({ ...current, [rowId]: image.url })),
  });
  // 서버가 받은 뒤 받기만 실패한 그림 자리(`send-failure.ts`). 다시 열 때의 실패 표시와 같이 보인다.
  const [lost, setLost] = React.useState<Record<string, string>>({});
  const failed = { ...resumed, ...lost };

  const turn = easyTurn({ messages, attachments: attachments.map((one) => one.id), sending, startedWithout });
  const shown = messages.length ? messages : [인사];
  // 단추를 달 물음 줄 — 서버가 받아 줄 줄과 같다(마지막 물음, 또는 단추 답이 실패한 짝 바로 앞, 2차 최종 리뷰 2).
  const 답할물음 = answerableAskId(shown);
  const cardHandlers = React.useMemo(() => ({
    onMessage: (message: EasyMessage) => setMessages((current) => [...current, message]),
    onError: (next: { message: string; retryable: boolean }) => setError(next),
    onDrafted: (photoRoles: unknown) => { setLastRoles((current) => rememberRoles(current, photoRoles)); router.refresh(); },
  }), [router]);
  const cardnews = useEasyCardnews({ conversationId, messages: shown, initial: initialCardnews, policy: creditPolicy, handlers: cardHandlers });

  /*
   * **이번 한 장에 얼마 드나**(설계 §5-2).
   *
   * 채팅은 돌이킬 수 없다 — 엔터가 곧 생성이고 04 같은 확인 단계가 없다.
   * 누르기 전에 아는 것이 누른 뒤에 아는 것보다 낫다.
   *
   * 셈은 `cost.ts` 가 한다. 화면 안에 두면 값으로 못 잰다.
   */
  /**
   * **이 대화에서 만든 것 전부** (2026-09-21 사용자 — 「결과 섹션은 딱 결과물만
   * 모아서 보이는거죠」).
   *
   * 오른쪽 칸은 **마지막 한 장**만 걸고 있었다. 그러면 대화에 이미 있는 그
   * 그림이 옆에 한 번 더 뜰 뿐이라 자리를 두 배로 쓰고 아무것도 더 알려 주지
   * 않는다 — 사용자가 짚은 그대로다(「그냥 오른쪽과 중복이 되니까」).
   *
   * 칸을 가른다. **왼쪽은 오가는 말, 오른쪽은 만든 것.** 오른쪽에 모아 두면
   * 대화가 길어져도 결과만 훑을 수 있고, 여러 장을 나란히 견줄 수 있다.
   *
   * 대화 차례대로 담는다. 화면이 새것을 위에 둘지는 그쪽이 정한다.
   */
  const results = React.useMemo(
    () => shown.flatMap((message): Array<{ id: string; url: string; options?: EasyImageOptions; group?: string }> =>
      message.role === "image" && urls[message.id]
        ? [{ id: message.id, url: urls[message.id]!, options: options[message.id] }]
        // 카드뉴스 줄은 다 만든 카드를 한 장씩 건다(2단계 §8).
        : cardResults([message], cardnews.views)),
    [shown, urls, options, cardnews.views],
  );

  const cost = React.useMemo(
    () => easyCost({ policy: creditPolicy, modelId: imageModel, ratioId, attachmentCount: attachments.length }),
    [creditPolicy, imageModel, ratioId, attachments.length],
  );

  // 새 줄이 붙으면 아래로 따라간다. 대화가 위에 멈춰 있으면 답이 온 줄 모른다.
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [shown.length]);

  /** 그림을 올린다. 기존 경로를 그대로 쓴다(설계 §8). */
  async function upload(files: FileList) {
    setError(null);
    for (const one of Array.from(files)) {
      // `crypto.randomUUID` 는 HTTPS·localhost 에서만 있다(`browser-safe.ts`).
      const form = easyUploadForm(one, randomId());
      try {
        const body = await (await fetch("/api/reference-images", { method: "POST", body: form })).json();
        observeAccountResponse(body, true);
        if (!body.ok) throw new Error(body.message ?? "그림을 올리지 못했습니다.");
        setAttachments((current) => [...current, attachmentFromUpload(body.image, one)]);
        // 사진이 바뀌면 사진 물음의 고르기는 뜻을 잃는다(1차 Review Focus 1). 물음 글은 남는다.
        asks.dropPhoto();
      } catch (cause) {
        setError({
          message: cause instanceof Error ? cause.message : "그림을 올리지 못했습니다.",
          retryable: true,
        });
      }
    }
  }

  /**
   * 라이브러리에서 고른다 (설계 §3 의 「라이브러리에서」).
   *
   * **올리지 않는다.** 이미 우리 저장소에 있는 그림이라 id 만 받으면 된다 —
   * 다시 올리면 같은 그림이 두 벌이 되고 라이브러리가 지저분해진다.
   */
  function pickFromLibrary(picked: { id: string; url: string; title: string }[]) {
    setAttachments((current) => {
      const 있는것 = new Set(current.map((one) => one.id));
      return [...current, ...picked.filter((one) => !있는것.has(one.id))];
    });
    asks.dropPhoto();
  }

  /**
   * 크게 본다. **한 벌을 통째로 연다** (2026-09-21 사용자 — 「클릭시 슬라이드로
   * 나오게」).
   *
   * 한 장씩 열면 열 때마다 닫고 다시 눌러야 다음 장을 본다. 이 대화의 결과를
   * 다 넘겨 주면 창 안에서 ‹ › 로 넘긴다 — 뷰어가 이미 할 줄 아는 일이다.
   *
   * **다른 화면과 같은 뷰어다**(2026-09-21 사용자 — 「라이브러리에서 클릭할
   * 때처럼」). 뿌리 레이아웃의 `ImageViewerHost` 가 받는다 — 원본 크기 보기·
   * 내려받기·「이렇게 만들었습니다」가 다 거기 있다.
   */
  function openViewer(at: number) {
    if (!results.length) return;
    openImageGallery({
      index: Math.max(0, Math.min(at, results.length - 1)),
      images: results.map((one, 번째) => ({
        src: one.url,
        alt: "만든 이미지",
        // 여러 장이 한 벌이라 이름이 같으면 내려받을 때 덮어쓴다.
        name: `easy-${번째 + 1}.png`,
        /*
          **그 장을 만든 조건**이다. 전에는 입력창 위 드롭다운의 **지금 값**을
          적어서, 어제 만든 그림을 열면 오늘 골라 둔 모델 이름이 붙었다
          (2026-09-21). 틀린 값을 자신 있게 적고 있었다.
        */
        meta: easyOptionMeta(one.options),
      })),
    });
  }

  /**
   * 만든다.
   *
   * **보내는 중에는 입력창을 잠근다**(설계 §11-②). 엔터가 곧 생성이라 두 번
   * 치면 두 번 값이 나가고 되돌릴 수 없다 — `turn.canSend` 가 그것을 정한다.
   */
  async function send(
    /** 단추로 한 답(물음 줄 단추 · 광고 단추). 비우면 입력창의 말을 보낸다(2차 D1). */
    보낼것?: EasyButtonReply | { text: string },
  ) {
    const prompt = 보낼것?.text ?? draft.trim();
    if (!prompt || !turn.canSend) return;
    /*
     * 물음 줄 단추면 그 줄 id 와 고른 값을 싣는다. 처음 말은 서버가 대화 줄에서 잇는다(2차 D1). 사진 고르기가
     * 열린 채 말로 치면 그 말 + 손댄 쓰임을 그 물음의 답으로 보낸다 — 입력창 안내 그대로(2차 최종 리뷰 8).
     */
    const 단추 = 보낼것 && "answersRowId" in 보낼것
      ? 보낼것
      : !보낼것 && asks.photo ? photoTypedReply(asks.photo.rowId, asks.photo.state, prompt) : undefined;
    const 고른역할 = (단추?.pick.photoRoles ?? []) as Array<{ id: string; role: CardPhotoRole }>;

    /*
     * **잠그기 전에 id 부터 만든다**(2026-09-21 사용자 보고).
     *
     * 전에는 `setSending(true)` 뒤, `try` 앞에서 `crypto.randomUUID()` 를
     * 불렀다. 그것은 **HTTPS·localhost 에서만 있는 함수**라 IP 로 연 화면
     * (`http://54.180.68.212`)에서 그 자리에서 터졌다.
     *
     *   Uncaught (in promise) TypeError: crypto.randomUUID is not a function
     *
     * 터진 자리가 `try` 밖이라 `finally` 가 안 돌았고, **입력창이 「만드는
     * 중입니다」인 채로 영영 잠겼다.** 한 번 실패하면 새로고침 전까지 아무것도
     * 못 했다. 터지는 것도 문제지만 **잠긴 채로 남는 것**이 더 문제였다.
     *
     * 이제 `randomId()`(`browser-safe.ts`)를 쓰고, 잠그기 전에 만든다.
     */
    const 자리 = `pending-${randomId()}`;
    let 받음 = false; // 서버가 이 턴을 받아 그림 줄을 남겼나(값이 잡혔다)

    setSending(true);
    setError(null);
    // 물음은 대화 줄에 남아 있다. 보내면 그 자리의 단추 · 고르기만 거둔다(2차 D1).
    asks.close();
    if (!보낼것) setDraft("");
    /*
     * 내 말을 먼저 그린다. 답이 말일지 그림일지는 아직 모른다 — 서버가 가른다. 단추 답이면 서버 줄과 같게
     * 고른 값 표시를 붙여 든다(보일 때는 뗀다) — 그 자리에서 실패해도 그 물음 줄에 단추를 다시 단다(2차 최종 리뷰 2).
     */
    setMessages((current) => [...current, { id: `user-${자리}`, role: "user", body: 단추 ? withPick(prompt, 단추.pick) : prompt }]);

    try {
      /*
        **`billableFetch` 로 보낸다**(2026-09-21 사용자 — 「이미지 생성이
        안되는데?」 400).

        크레딧이 깎이는 요청에는 서버가 `x-idempotency-key` 를 요구한다. 이
        주소는 **직접 예약하지 않지만**, 안에서 포스터 생성 라우트를 부르며
        원래 요청의 헤더를 그대로 넘긴다. 그래서 여기서 안 붙이면 그 안쪽이
        400 「요청 식별자가 올바르지 않습니다」로 막는다.

        **로컬에서는 안 드러난다.** 인증 우회가 헤더 검사보다 먼저 지나간다 —
        `billable-fetch.ts` 주석이 적어 둔 그 함정에 2026-09-04(캐릭터) ·
        09-17(카드뉴스)에 이어 **세 번째로 빠졌다.** 이번에는 대신 부르는
        자리라 검사도 비켜 갔다. 그 구멍도 같이 막았다.
      */
      const response = await billableFetch("/api/easy/generate", {
        body: JSON.stringify({
          conversationId,
          prompt,
          textModel,
          imageModel,
          referenceIds: attachments.map((one) => one.id),
          // 지난 역할. 이번에 단추로 고른 사진은 빼고 보낸다 — 서버도 다시 확인한다.
          previousRoles: previousRolesFor(lastRoles, attachments.map((one) => one.id), 고른역할),
          // 물음 줄 단추면 그 줄 id 와 고른 값(갈래 · 비율 · 사진 쓰임 · 번호)만 싣는다(2차 D1).
          ...(단추 ? { answersRowId: 단추.answersRowId, pick: 단추.pick } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      observeAccountResponse(body, true);
      // 만들기에 쓴 턴이면 붙인 사진을 내린다(2차 D3). 물음 · 대화 · 실패에는 그대로 둔다.
      if (usedAttachments(body)) setAttachments([]);
      if (body.ok && body.ask && body.message) {
        /*
         * **물음도 대화의 한 줄이다**(2차 D1). 물음 줄을 붙이고, 사진 · 레퍼런스처럼 그 자리에서
         * 고르는 물음이면 그 고르기를 이 줄에 연다. 값은 안 들었다.
         */
        setMessages((current) => [...current, { id: body.message.id, role: "assistant", body: body.message.body ?? "" }]);
        asks.open(body.message.id, body);
        router.refresh();
        return;
      }
      // 화면의 「카드뉴스 N」(2차 D2). 서버가 같은 함수로 센 결과물 번호다.
      if (body.ok && body.cardnews?.rowId && typeof body.resultLabel === "string") {
        setLabels((current) => ({ ...current, [body.cardnews.rowId]: body.resultLabel }));
      }
      // 일하는 턴의 AI 말(2차 D4). 그림 · 원고 자리 앞에 붙인다 — 0장 실패 안내도 그 뒤에 온다.
      if (body.ok && body.say?.id) setMessages((current) => [...current, { id: body.say.id, role: "assistant", body: body.say.body ?? "" }]);
      // 카드뉴스 원고 · 손보기(2단계 · 3단계). 값은 원고까지 안 든다.
      if (body.ok && cardnews.take(body)) return;
      if (body.ok && body.talked) {
        /*
         * **말로 답한 턴.** 그림을 안 만들었으므로 기다릴 것도 없다.
         * 2026-09-21 사용자 — 「그냥 ChatGPT · Gemini · Claude 처럼」.
         */
        setMessages((current) => [
          ...current,
          { id: body.message?.id ?? `talk-${자리}`, role: "assistant", body: body.message?.body ?? "" },
        ]);
        router.refresh();
        return;
      }
      if (!body.ok) {
        /*
         * **오류를 뭉개지 않는다**(설계 §5-3). 서버가 준 말을 그대로 보이고,
         * 다시 눌러도 막히는 실패(크레딧·권한)면 단추를 안 낸다.
         */
        throw Object.assign(new Error(body.message ?? "만들지 못했습니다."), {
          retryable: body.retryable !== false,
        });
      }

      // 이번에 정해진 역할을 기억한다. 다음에 이어 만들 때 다시 묻지 않는다.
      setLastRoles((current) => rememberRoles(current, body.photoRoles));

      // 그림 자리를 잡아 둔다. 자리가 없으면 도착하는 순간 대화가 아래로 튄다.
      setMessages((current) => [...current, { id: 자리, role: "image", body: "" }]);
      // 화면의 「이미지 N」(2차 D2). 서버가 같은 함수로 센 결과물 번호다.
      if (typeof body.resultLabel === "string") setLabels((current) => ({ ...current, [자리]: body.resultLabel }));
      받음 = true;

      // 결과는 기존 status 라우트에 물어 받는다. 포스터 화면과 같은 길이다.
      const image = await collectEasyImage(body.projectId, body.submission, () => alive.current);
      if (!alive.current) return;
      if (image) {
        setUrls((current) => ({ ...current, [자리]: image.url }));
        /*
          **만들면서 적는다.** 서버에서 다시 읽어 오길 기다리면 방금 만든 것만
          조건이 빈 채로 뜬다. 여기서 아는 값은 고른 모델과 비율, 붙인 장수다 —
          실제 픽셀 크기는 서버가 안다(다시 열 때 채워진다).
        */
        setOptions((current) => ({
          ...current,
          // 서버가 실제로 쓴 값을 그대로 적는다. 여기서 다시 셈하면 갈린다.
          [자리]: {
            model: imageModel,
            ratio: typeof body.ratio === "string" ? body.ratio : ratioId,
            references: attachments.length,
            ...(typeof body.roles === "string" && body.roles ? { roles: body.roles } : {}),
          },
        }));
        setMessages((current) => current.map((one) =>
          one.id === 자리 ? { ...one, workId: image.id } : one));
      }
      // 제목이 이 말로 지어졌을 수 있다. 레일이 그것을 보여야 한다.
      router.refresh();
    } catch (cause) {
      if (!alive.current) return;
      const 까닭 = cause instanceof Error ? cause.message : "만들지 못했습니다.";
      // 받기 전 실패면 그림 자리를 뺀다. 받은 뒤면 실패로 남긴다 — 빼면 물음 단추가 다시 뜬다(`send-failure.ts`).
      setMessages((current) => keptAfterFailure(current, 자리, 받음));
      setLost((current) => lostAfterFailure(current, 자리, 받음, 까닭));
      setError({
        message: 까닭,
        retryable: (cause as { retryable?: boolean }).retryable !== false,
      });
      // 다시 칠 수 있게 되돌린다. 친 말을 잃으면 처음부터 써야 한다.
      if (!보낼것 && (cause as Error)?.message !== STILL_MAKING) setDraft(prompt);
    } finally {
      if (alive.current) setSending(false);
    }
  }

  return (
    <div ref={split} className="flex min-h-0 min-w-0 flex-1">
      {/* ── 가운데: 대화와 입력 ── */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* ── 대화 ── 자기 안에서만 스크롤한다. 입력창이 아래에 붙어 있어야 한다. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/*
          **언제나 위에서부터 쌓인다**(2026-09-21 사용자 — 「대화가 가운데
          중간부터 시작하는데 채팅은 상단에서부터 내려오게 하고… 그냥 ChatGPT ·
          Gemini · Claude 처럼 쓸 수 있어야 된다고 보면 됩니다」).

          한동안 첫 화면만 가운데로 모았다(2026-09-18). 「아래가 통째로 빈
          공간이라 고장처럼 보인다」는 까닭이었는데, 써 보니 **말을 걸 때마다
          글이 위로 튀어 올라가** 그쪽이 더 이상했다. 채팅은 처음부터 위에서
          시작하는 것이 관례다.
        */}
        {/*
          **칸이 주는 너비를 다 쓴다**(2026-09-21 사용자 — 「텍스트가 표시되는
          영역이 작아보이는데 굳이 이렇게 할 필요가 있을까? 양쪽 여백을 조금만
          남기고」).

          `max-w-2xl`(672px)로 가운데에 묶어 뒀다. 대화 칸을 넓혀 놔도 글은 그
          너비에 갇혀서, **양옆이 통째로 빈 채로** 좁은 단에 글이 흘렀다.
          넓힐지 말지는 구분선을 끄는 사람이 정한다 — 여기서 미리 정하지 않는다.
        */}
        <div className="grid w-full gap-4 px-6 py-6">
          {shown.map((message) => (
            <EasyMessageRow
              key={message.id}
              message={message}
              imageUrl={urls[message.id]}
              /* 대화에서 눌러도 같은 벌이 열린다. 그 자리에서 시작할 뿐이다. */
              onOpenImage={() => openViewer(results.findIndex((one) => one.id === message.id))}
              cardnews={cardnews.rowProps(message.id, turn.busy)}
              failed={failed[message.id]}
              resultLabel={labels[message.id]}
              onAdChoice={message.id === 답할물음 && !turn.busy ? (answer) => void send({ text: answer }) : undefined}
              // 물음 줄 밑의 단추 · 고르기. 지금 답할 수 있는 물음 줄이고 보내는 중이 아닐 때만(Review Focus 1, 2차 D1).
              askControls={message.id === 답할물음 && !turn.busy ? (
                <EasyAskControls
                  message={message} asks={asks} attachments={attachments} library={library}
                  onAttach={pickFromLibrary} onAnswer={(reply) => void send(reply)}
                />
              ) : undefined}
            />
          ))}

          {/*
            **생각하는 중.**

            답이 말일지 그림일지 서버가 가르는 동안은 화면에 아무 일도 안
            일어난다. 그 사이가 비어 있으면 보낸 것이 먹혔는지 알 수 없다 —
            그림 자리는 가른 **뒤에** 생긴다.

            그림이 이미 자리를 잡았으면 안 낸다. 기다리는 표시가 둘이 된다.
          */}
          {turn.busy && shown[shown.length - 1]?.role === "user" ? <EasyThinkingRow /> : null}

          {/*
            붙일지 묻는 단추. **첫 화면에서 한 번만**이다 — 되묻지 않는다(§6).
          */}
          {turn.showsAttachChoice ? (
            <EasyAttachChoice
              library={library}
              selectedIds={attachments.map((one) => one.id)}
              onUpload={() => file.current?.click()}
              onPick={pickFromLibrary}
              onSkip={() => setStartedWithout(true)}
            />
          ) : null}

          {error ? (
            <div className="mx-auto grid max-w-prose gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{error.message}</p>
              {/*
                **다시 눌러도 막히는 실패면 단추를 안 낸다**(설계 §5-3 의 표).
                크레딧·권한이 그렇다 — 눌러도 헛수고고 값 이야기만 흐려진다.
              */}
              {error.retryable ? (
                <p className="text-meta text-subtle-foreground">
                  다시 보내시면 한 번 더 만듭니다. <strong>값이 또 듭니다.</strong>
                </p>
              ) : null}
            </div>
          ) : null}

          <div ref={bottom} />
        </div>
      </div>

      {/* ── 붙인 그림 ── */}
      {attachments.length ? (
        <div className="flex w-full flex-wrap gap-2 px-6 pb-2 pt-1">
          {attachments.map((one) => (
            <div key={one.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={one.url}
                alt={one.title}
                className="h-16 w-16 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                aria-label="빼기"
                onClick={() => { setAttachments((c) => c.filter((x) => x.id !== one.id)); asks.dropPhoto(); }}
                className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background px-1.5 text-meta"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── 입력 ── */}
      <div className="border-t border-border bg-background">
        {/* 글과 **같은 폭**이라야 한 단으로 읽힌다. 위는 넓고 아래만 좁으면 어긋난다. */}
        <div className="w-full px-6 py-3">
          <EasyModelBar
            textModel={textModel}
            imageModel={imageModel}
            imageModels={imageModels}
            onTextModel={setTextModel}
            onImageModel={setImageModel}
            disabled={turn.busy}
          />
          {/*
            **한 덩이로 감싼다**(2026-09-18 사용자 — 「채팅창처럼 안 느껴진다」).

            전에는 단추와 입력칸이 각자 테두리를 갖고 흩어져 있어 **입력 도구
            모음**처럼 보였다. 채팅의 입력창은 하나의 판이고, 그 안에 붙이기와
            보내기가 들어 있다.
          */}
          <div className="flex items-end gap-1 rounded-2xl border border-border bg-background p-1.5 focus-within:border-primary">
            {/*
              **대화 목록 손잡이가 여기 있다**(2026-09-18 사용자).

              전에는 화면 왼쪽 위에 떠 있었는데, 상단바가 생기면서 그 자리에
              둘이 겹쳤다. 누르는 것들이 한 줄에 모이는 편이 찾기도 쉽다.
              넓은 화면에서는 목록 칸이 늘 보이므로 이 단추가 없다.
            */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="대화 목록"
              className="md:hidden"
              onClick={() => window.dispatchEvent(new Event(TOGGLE_EVENT))}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="이미지 붙이기"
              disabled={turn.busy}
              onClick={() => file.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            {/*
              **라이브러리도 입력창에서 연다** (2026-09-23 사용자).

              전에는 라이브러리로 가는 길이 첫 화면의 단추뿐이었다. 한 장 붙이면
              그 화면이 사라져서, 두 장째부터는 고를 방법이 없었다.
            */}
            <EasyLibraryPicker
              library={library}
              selectedIds={attachments.map((one) => one.id)}
              onPick={pickFromLibrary}
              label=""
              triggerVariant="ghost"
              triggerAriaLabel="라이브러리에서 붙이기"
            />
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // 엔터로 보낸다. 줄바꿈은 Shift+Enter — 채팅의 관례다.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              /*
                **못 쓰는 까닭을 그대로 적는다.** 보내는 중인데 「위에서 먼저
                골라 주세요」라고 하면 고른 것이 안 먹힌 줄 안다
                (2026-09-18 확인).
              */
              placeholder={
                turn.busy ? "답을 기다리는 중입니다"
                  // 사진 물음이 떠 있으면 친 말은 처음 말에 이어진다(설계 §2-5).
                  : asks.photo ? "위 사진 물음에 대한 답으로 보냅니다. 예: 1번은 우리 원두 봉투야"
                  : turn.canSend ? "무엇이든 물어보거나, 만들 것을 적어 주세요"
                    : "위에서 먼저 골라 주세요"
              }
              disabled={!turn.canSend}
              rows={1}
              className="max-h-32 min-h-10 resize-none border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 md:text-base"
            />
            <Button
              size="icon"
              aria-label="보내기"
              className="size-9 shrink-0 rounded-full"
              disabled={!turn.canSend || !draft.trim()}
              onClick={() => void send()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {/*
            **대화는 남고 그림은 라이브러리에 저장된다.** 설계 §11-③ 이 「그
            사실을 화면에 적어야 한다」고 적었다 — 안 적으면 잃어버렸다고 느낀다.
          */}
          {/*
            **값을 누르기 전에 적는다**(설계 §5-2). 이 모드에서 사용자가 보는
            유일한 값 정보다. 못 셀 때는 지어내지 않고 그 까닭을 적는다.
          */}
          <p className="pt-2 text-meta text-subtle-foreground">
            {/*
              **보낸다고 늘 값이 드는 것이 아니다**(2026-09-21). 말로 묻는 턴은
              그림을 안 만든다. 「보내면 듭니다」라고 적어 두면 인사 한 마디도
              값이 나가는 줄 알고 못 친다.
            */}
            {cost.units !== undefined ? (
              <>
                이미지를 만들면 <strong>약 {cost.units}{creditPolicy === "image-v2" ? "크레딧" : "장"}</strong>이 듭니다.{" "}
              </>
            ) : (
              <>{cost.rejected} </>
            )}
            만든 이미지는 라이브러리에 저장됩니다. 세밀하게 만들려면 왼쪽
            「이미지 만들기」를 누르세요. {UPLOAD_RIGHTS_NOTE}
          </p>
        </div>
      </div>

      </div>

      {/*
        **오른쪽 결과 칸.** 첫 기획(2026-09-02)의 4분할 중 「결과」를 되살린
        것이다. 뺐던 것은 **작업판**(칸 여럿)이고, 이건 보여 주기만 한다.

        **너비를 끌어서 바꾼다.** `resultWidth` 가 0 이면 넣을 자리가 없다는
        뜻이라 구분선과 함께 통째로 빠진다(`split.ts`).

        `null` 은 아직 안 쟀다는 뜻이다. 그때는 서버가 그린 것과 같은 기본
        너비로 두어 화면이 튀지 않게 한다.
      */}
      {resultWidth === null || resultWidth > 0 ? (
        <>
          {resultWidth === null ? null : (
            <EasySplitHandle
              width={resultWidth}
              onChange={setResultWidth}
              containerRef={split}
              side="right"
              label="대화와 결과 칸 너비"
              /*
                **결과 칸과 같이 나타나고 같이 사라진다**(2026-09-18 확인).
                결과 칸은 `lg` 미만에서 `hidden` 인데 구분선이 그대로 남아
                있었다 — 끌 것이 없는 손잡이가 화면 가운데에 선으로 섰다.
              */
              className="hidden lg:block"
            />
          )}
          <EasyResultPanel
            images={results}
            width={resultWidth}
            /* 자리는 잡혔는데 주소가 아직 없으면 만드는 중이다. */
            working={cardnews.working || shown.some((one) => one.role === "image" && !urls[one.id] && !cardnews.views[one.id] && !failed[one.id])}
            onOpen={openViewer}
          />
        </>
      ) : null}

      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) void upload(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
