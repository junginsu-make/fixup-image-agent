"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Send } from "lucide-react";
import { Button, ImageLightbox, Textarea } from "@fixup/ui";
import { DEFAULT_TEXT_MODEL } from "@fixup/shared";
import { EasyMessageRow } from "./_components/message";
import { EasyModelBar, type ImageModelChoice } from "./_components/model-bar";
import { easyTurn, type EasyMessage } from "./turn";

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
  imageModels: ImageModelChoice[];
  defaultImageModel: string;
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
  body: "그림을 붙이시겠어요? 없어도 만들 수 있습니다.",
};

export function EasyClient({
  conversationId,
  initialMessages,
  initialUrls,
  imageModels,
  defaultImageModel,
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
  const [lightbox, setLightbox] = React.useState<string | null>(null);

  const file = React.useRef<HTMLInputElement>(null);
  const bottom = React.useRef<HTMLDivElement>(null);
  const alive = React.useRef(true);
  React.useEffect(() => () => { alive.current = false; }, []);

  const turn = easyTurn({ messages, attachments: attachments.map((one) => one.id), sending, startedWithout });
  const shown = messages.length ? messages : [인사];

  // 새 줄이 붙으면 아래로 따라간다. 대화가 위에 멈춰 있으면 답이 온 줄 모른다.
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [shown.length]);

  /** 그림을 올린다. 기존 경로를 그대로 쓴다(설계 §8). */
  async function upload(files: FileList) {
    setError(null);
    for (const one of Array.from(files)) {
      const id = crypto.randomUUID();
      const form = new FormData();
      form.append("id", id);
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
   * 만든다.
   *
   * **보내는 중에는 입력창을 잠근다**(설계 §11-②). 엔터가 곧 생성이라 두 번
   * 치면 두 번 값이 나가고 되돌릴 수 없다 — `turn.canSend` 가 그것을 정한다.
   */
  async function send() {
    const prompt = draft.trim();
    if (!prompt || !turn.canSend) return;

    setSending(true);
    setError(null);
    setDraft("");

    // 내 말과 그림 자리를 먼저 그린다. 자리가 없으면 결과가 도착할 때 대화가
    // 아래로 튀어 읽던 자리를 잃는다.
    const 자리 = `pending-${crypto.randomUUID()}`;
    setMessages((current) => [
      ...current,
      { id: `user-${자리}`, role: "user", body: prompt },
      { id: 자리, role: "image", body: "" },
    ]);

    try {
      const response = await fetch("/api/easy/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          prompt,
          textModel,
          imageModel,
          referenceIds: attachments.map((one) => one.id),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!body.ok) {
        /*
         * **오류를 뭉개지 않는다**(설계 §5-3). 서버가 준 말을 그대로 보이고,
         * 다시 눌러도 막히는 실패(크레딧·권한)면 단추를 안 낸다.
         */
        throw Object.assign(new Error(body.message ?? "만들지 못했습니다."), {
          retryable: body.retryable !== false,
        });
      }

      // 결과는 기존 status 라우트에 물어 받는다. 포스터 화면과 같은 길이다.
      const image = await collect(body.projectId, body.submission);
      if (!alive.current) return;
      if (image) {
        setUrls((current) => ({ ...current, [자리]: image.url }));
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
      const poll = await (await fetch(`/api/poster/projects/${projectId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
    <>
      {/* ── 대화 ── 자기 안에서만 스크롤한다. 입력창이 아래에 붙어 있어야 한다. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-2xl gap-4 px-4 py-8 pt-14 md:pt-8">
          {shown.map((message) => (
            <EasyMessageRow
              key={message.id}
              message={message}
              imageUrl={urls[message.id]}
              onOpenImage={() => setLightbox(urls[message.id] ?? null)}
            />
          ))}

          {/*
            붙일지 묻는 단추. **첫 화면에서 한 번만**이다 — 되묻지 않는다(§6).
          */}
          {turn.showsAttachChoice ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => file.current?.click()}>
                직접 첨부
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStartedWithout(true)}>
                없이 시작
              </Button>
            </div>
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
        <div className="mx-auto flex w-full max-w-2xl flex-wrap gap-2 px-4 pb-2">
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
        <div className="mx-auto w-full max-w-2xl px-4 py-3">
          <EasyModelBar
            textModel={textModel}
            imageModel={imageModel}
            imageModels={imageModels}
            onTextModel={setTextModel}
            onImageModel={setImageModel}
            disabled={turn.busy}
          />
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="그림 붙이기"
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
              placeholder={turn.canSend ? "무엇을 만들까요?" : "위에서 먼저 골라 주세요"}
              disabled={!turn.canSend}
              rows={1}
              className="max-h-32 min-h-10 resize-none"
            />
            <Button
              size="icon"
              aria-label="보내기"
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
          <p className="pt-2 text-meta text-subtle-foreground">
            만든 그림은 라이브러리에 저장됩니다. 세밀하게 만들려면 왼쪽 아래
            「자세한 모드로」를 누르세요.
          </p>
        </div>
      </div>

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

      {lightbox ? (
        <ImageLightbox
          title="만든 그림"
          images={[{ label: "만든 그림", src: lightbox, fileName: "easy.png" }]}
          index={0}
          onIndexChange={() => undefined}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}
