"use client";

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
import { EASY_DEFAULT_RATIO } from "./ask";
import { EasyAttachChoice } from "./_components/attach-choice";
import { EasyAskChoice } from "./_components/ask-choice";
import { TOGGLE_EVENT } from "./_components/conversation-list";
import { EasyResultPanel } from "./_components/result-panel";
import { EasySplitHandle, useSplitWidth } from "./_components/split-handle";
import { openImageGallery } from "../_components/image-viewer";

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
}: EasyClientProps) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<EasyMessage[]>(initialMessages);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [startedWithout, setStartedWithout] = React.useState(initialMessages.length > 0);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; retryable: boolean } | null>(null);
  const [textModel, setTextModel] = React.useState(DEFAULT_TEXT_MODEL);
  const [imageModel, setImageModel] = React.useState(defaultImageModel);
  const [urls, setUrls] = React.useState<Record<string, string>>(initialUrls ?? {});
  /*
   * **물어본 뒤 답을 기다리는 중인가** (2026-09-21 사용자).
   *
   * 서버가 「물어봐야 한다」고 하면 그림을 안 만들고 이 자리에 친 말을 담아
   * 둔다. 고르고 만들기를 누르면 그 말 그대로 다시 보낸다.
   *
   * **화면에만 있고 표에는 안 남는다.** 답 없이 떠나면 아무 일도 안 일어난
   * 것이 맞다 — 남겨 두면 답 없는 물음만 쌓인다.
   */
  const [asking, setAsking] = React.useState<string | null>(null);
  const [askRatio, setAskRatio] = React.useState("");
  const [askLook, setAskLook] = React.useState("");
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
  React.useEffect(() => () => { alive.current = false; }, []);

  const turn = easyTurn({ messages, attachments: attachments.map((one) => one.id), sending, startedWithout });
  const shown = messages.length ? messages : [인사];

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
    () => shown.flatMap((message) =>
      message.role === "image" && urls[message.id]
        ? [{ id: message.id, url: urls[message.id]!, options: options[message.id] }]
        : []),
    [shown, urls, options],
  );

  const cost = React.useMemo(
    () => easyCost({ modelId: imageModel, ratioId, attachmentCount: attachments.length }),
    [imageModel, ratioId, attachments.length],
  );

  // 새 줄이 붙으면 아래로 따라간다. 대화가 위에 멈춰 있으면 답이 온 줄 모른다.
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [shown.length]);

  /** 그림을 올린다. 기존 경로를 그대로 쓴다(설계 §8). */
  async function upload(files: FileList) {
    setError(null);
    for (const one of Array.from(files)) {
      const form = new FormData();
      // `crypto.randomUUID` 는 HTTPS·localhost 에서만 있다(`browser-safe.ts`).
      form.append("id", randomId());
      form.append("title", one.name);
      // 역할은 여기서 묻지 않는다. 기획이 판단한다 — 붙인 것을 전부 읽는다.
      form.append("purpose", "style");
      form.append("file", one);
      try {
        const body = await (await fetch("/api/reference-images", { method: "POST", body: form })).json();
        if (!body.ok) throw new Error(body.message ?? "그림을 올리지 못했습니다.");
        setAttachments((current) => [
          ...current,
          { id: body.image.id, url: body.image.url, title: body.image.title ?? one.name },
        ]);
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
    /** 물어본 뒤 다시 보낼 때 쓴다. 비우면 입력창의 말을 보낸다. */
     다시?: { prompt: string; ratio: string; look: string },
  ) {
    const prompt = 다시?.prompt ?? draft.trim();
    if (!prompt || (!다시 && !turn.canSend)) return;

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

    setSending(true);
    setError(null);

    if (다시) {
      // 물음 줄을 거둔다. 내 말은 이미 그려져 있다.
      setAsking(null);
    } else {
      setDraft("");
      /*
        **묻던 것을 거둔다.** 답하지 않고 새 말을 치면 그 물음은 버린 것이다.
        남겨 두면 지난 말에 딸린 토글이 새 말 밑에 붙어 무엇을 묻는지 흐려진다.
      */
      setAsking(null);
      setAskRatio("");
      setAskLook("");
      // 내 말을 먼저 그린다. 답이 말일지 그림일지는 아직 모른다 — 서버가 가른다.
      setMessages((current) => [...current, { id: `user-${자리}`, role: "user", body: prompt }]);
    }

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
          // 고른 것이 있으면 함께 보낸다. 없으면 서버가 물어볼지 정한다.
          ...(다시?.ratio ? { ratio: 다시.ratio } : {}),
          ...(다시?.look ? { look: 다시.look } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (body.ok && body.asked) {
        /*
         * **물어만 보고 끝낸다.** 그림을 안 만들었으므로 값도 안 든다.
         * 친 말을 들고 있다가 고른 뒤 그대로 다시 보낸다.
         */
        setAsking(prompt);
        return;
      }
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

      // 그림 자리를 잡아 둔다. 자리가 없으면 도착하는 순간 대화가 아래로 튄다.
      setMessages((current) => [...current, { id: 자리, role: "image", body: "" }]);

      // 결과는 기존 status 라우트에 물어 받는다. 포스터 화면과 같은 길이다.
      const image = await collect(body.projectId, body.submission);
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
          },
        }));
        setMessages((current) => current.map((one) =>
          one.id === 자리 ? { ...one, workId: image.id } : one));
      }
      // 제목이 이 말로 지어졌을 수 있다. 레일이 그것을 보여야 한다.
      router.refresh();
    } catch (cause) {
      if (!alive.current) return;
      // 실패한 그림 자리는 뺀다. 빈 판이 영원히 도는 것보다 낫다.
      setMessages((current) => current.filter((one) => one.id !== 자리));
      setError({
        message: cause instanceof Error ? cause.message : "만들지 못했습니다.",
        retryable: (cause as { retryable?: boolean }).retryable !== false,
      });
      // 다시 칠 수 있게 되돌린다. 친 말을 잃으면 처음부터 써야 한다.
      setDraft(prompt);
    } finally {
      if (alive.current) setSending(false);
    }
  }

  /** 기존 `status` 라우트에 물어 결과를 받는다. */
  async function collect(
    projectId: string,
    submission: { requestRowId: string; falRequestId: string; endpoint: string; estimatedUsd?: number },
  ): Promise<{ id: string; url: string } | undefined> {
    const body = {
      requestRowId: submission.requestRowId,
      falRequestId: submission.falRequestId,
      endpoint: submission.endpoint,
      unitCostUsd: submission.estimatedUsd ?? 0,
    };
    for (;;) {
      if (!alive.current) return undefined;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      if (!alive.current) return undefined;
      /*
        결과를 묻는 자리다. 예약이 아니라 **정산**이라 열쇠를 요구하지 않지만,
        포스터 화면과 같은 길(`billableFetch`)로 보내 둔다 — 한 화면에서 두
        길을 쓰면 어느 쪽이 무엇이었는지 다음 사람이 다시 알아봐야 한다.
      */
      const poll = await (await billableFetch(`/api/poster/projects/${projectId}/status`, {
        body: JSON.stringify(body),
      })).json();
      if (!poll.ok) throw new Error(poll.message ?? "상태를 확인하지 못했습니다.");
      if (poll.done) {
        const first = poll.images?.[0];
        return first ? { id: first.id, url: first.url } : undefined;
      }
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
            />
          ))}

          {/*
            **생각하는 중.**

            답이 말일지 그림일지 서버가 가르는 동안은 화면에 아무 일도 안
            일어난다. 그 사이가 비어 있으면 보낸 것이 먹혔는지 알 수 없다 —
            그림 자리는 가른 **뒤에** 생긴다.

            그림이 이미 자리를 잡았으면 안 낸다. 기다리는 표시가 둘이 된다.
          */}
          {/*
            **비율·그림체를 한 번 묻는다**(2026-09-21 사용자). 막지 않는다 —
            「이대로 만들기」가 늘 열려 있고, 누르면 지금까지대로 간다.
          */}
          {asking ? (
            <EasyAskChoice
              ratio={askRatio}
              look={askLook}
              onRatio={setAskRatio}
              onLook={setAskLook}
              disabled={turn.busy}
              onSubmit={() => {
                const 보낼말 = asking;
                setAskRatio("");
                setAskLook("");
                void send({ prompt: 보낼말, ratio: askRatio, look: askLook });
              }}
            />
          ) : null}

          {turn.busy && !asking && shown[shown.length - 1]?.role === "user" ? <EasyThinkingRow /> : null}

          {/*
            붙일지 묻는 단추. **첫 화면에서 한 번만**이다 — 되묻지 않는다(§6).
          */}
          {turn.showsAttachChoice ? (
            <EasyAttachChoice
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
                onClick={() => setAttachments((c) => c.filter((x) => x.id !== one.id))}
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
                  : turn.canSend ? "무엇이든 물어보거나, 만들 것을 적어 주세요"
                    : "위에서 먼저 골라 주세요"
              }
              disabled={!turn.canSend}
              rows={1}
              className="max-h-32 min-h-10 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
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
                이미지를 만들면 <strong>약 {cost.units}장</strong>이 듭니다.{" "}
              </>
            ) : (
              <>{cost.rejected} </>
            )}
            만든 이미지는 라이브러리에 저장됩니다. 세밀하게 만들려면 왼쪽
            「이미지 만들기」를 누르세요.
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
            working={shown.some((one) => one.role === "image" && !urls[one.id])}
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
