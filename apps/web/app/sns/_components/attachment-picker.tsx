"use client";

import * as React from "react";
import { AlertTriangle, ImagePlus, Loader2, X } from "lucide-react";
import { groupAttachments, modelById, referenceWarningsForRole, validateAttachments, type Attachment, type AttachmentKind, type StyleRole } from "@fixup/sns-core";
import { Badge, Button, Card, CardContent } from "@fixup/ui";
import { ATTACHMENT_ROLE_HINT, ATTACHMENT_ROLE_LABEL, fromCardNewsAttachment, toCardNewsAttachment, type AttachmentRole } from "@fixup/shared";
import {
  LibraryPickerButton, type LibraryPickCharacterAngle, type LibraryPickSet,
} from "../../_components/library-picker";
import type { ReferenceImageRow } from "../../library/reference-upload";
import { randomId } from "../../../lib/browser-safe";
import { attachmentsForUploaded } from "./uploaded-attachments";
import { SlotIntents, type SlotIntents as SlotIntentsValue } from "./slot-intents";

type ImageView = ReferenceImageRow & { signedUrl: string | null };

/** 선택 상자에 표시할 값. 마지막 장은 역할이 아니라 자리라 따로 둔다. */
function roleOf(attachment: Attachment): string {
  // **그림 느낌만 바꾸는 사람을 먼저 본다.** 공용 어휘는 이 둘을 같은 kind 로
  // 옮기므로(카드뉴스에 담을 칸이 없다), 화면에서는 `restyle` 로 갈라야 한다.
  if (attachment.kind === "keep_identity" && attachment.subject === "person" && attachment.restyle) {
    return "preserve_person_restyled";
  }
  return fromCardNewsAttachment(attachment.kind, attachment.subject) ?? "ending";
}

/**
 * 카드뉴스가 쓰는 역할 다섯.
 *
 * **「사람은 그대로, 그림 느낌만」이 넷째다**(설계 §4-3). 「인물 지키기」는 그림
 * 느낌까지 고정하고 「따라 만들기」는 사람을 새로 만든다 — 그 사이가 비어 있었다.
 */
const CARD_ROLES: AttachmentRole[] = [
  "style", "preserve_product", "preserve_person", "preserve_person_restyled", "place_as_is",
];

export function AttachmentPicker({
  attachments,
  onChange,
  modelId,
  totalCards,
  intents,
  onIntentsChange,
}: {
  /** 자리마다 사용자가 적은 말 (표지/속지/엔딩). */
  intents: SlotIntentsValue;
  onIntentsChange: (next: SlotIntentsValue) => void;
  attachments: Attachment[];
  onChange(value: Attachment[]): void;
  modelId: string;
  totalCards: number;
}) {
  const [images, setImages] = React.useState<ImageView[]>([]);
  const [sets, setSets] = React.useState<LibraryPickSet[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);

  /** 읽은 목록을 돌려준다 — 방금 올린 그림을 바로 붙이려면 그 줄이 필요하다. */
  const load = React.useCallback(async (): Promise<ImageView[]> => {
    setLoading(true);
    try {
      // 로컬이든 운영이든 같은 길로 읽는다. 서버가 모드를 가른다.
      const response = await fetch("/api/reference-images", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; images?: ImageView[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "참고 이미지를 불러오지 못했습니다.");
      const fresh = payload.images ?? [];
      setImages(fresh);
      // 세트도 함께 읽는다. 한 벌로 만들어 뒀으면 한 벌로 부를 수 있어야 한다.
      const setsBody = await (await fetch("/api/reference-sets", { cache: "no-store" })).json();
      setSets(setsBody.ok ? (setsBody.sets ?? []) : []);
      // 캐릭터도 같이 읽는다. 만들어 둔 인물을 카드에 그대로 쓸 수 있어야 한다.
      setMessage("");
      return fresh;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "참고 이미지를 불러오지 못했습니다.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  /**
   * 올린 그림은 **바로 이 작업에 넣는다.**
   *
   * 전에는 라이브러리에만 넣고 끝냈다. 여기 보이는 것은 붙인 그림뿐이라 화면은
   * 아무 변화가 없었고, 올리기가 안 되는 것처럼 보였다. 실제로는 저장까지 다
   * 되고 있었다(2026-09-03 운영 DB 확인). 올리는 사람은 지금 쓰려고 올린다.
   */
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const id = randomId();
        const form = new FormData();
        form.set("id", id);
        form.set("title", file.name.replace(/\.[^.]+$/, ""));
        form.set("purpose", "cardnews");
        form.set("file", file);
        const response = await fetch("/api/reference-images", { method: "POST", body: form });
        const payload = await response.json() as { ok?: boolean; message?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.message ?? "업로드하지 못했습니다.");
        added.push(id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "업로드하지 못했습니다.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
    if (!added.length) return;
    const attach = attachmentsForUploaded(added, await load(), attachments);
    if (attach.length) onChange([...attachments, ...attach]);
  }

  /** 세트를 통째로 넣는다. 표지·속지·엔딩 자리를 그대로 가져온다. */
  function pickSet(set: LibraryPickSet) {
    const added = set.items.flatMap((item) => {
      const image = images.find((entry) => entry.id === item.referenceImageId);
      if (!image || attachments.some((attachment) => attachment.id === image.id)) return [];
      return [{
        id: image.id,
        kind: "style_reference" as const,
        role: item.role,
        assetPath: image.storagePath,
        url: image.signedUrl ?? "",
      }];
    });
    if (!added.length) return setMessage("이 세트의 그림이 이미 다 들어 있습니다.");
    onChange([...attachments, ...added]);
    setMessage(`'${set.name}' 세트에서 ${added.length}장을 넣었습니다.`);
  }

  /**
   * 캐릭터의 **고른 각도 한 장**을 넣는다.
   *
   * 전에는 무엇을 눌러도 정면이 들어갔다. 측면을 만들어 둬도 고를 수가 없어
   * 각도를 만든 뜻이 사라졌다(2026-09-11 사용자 지적). 이제 어느 각도를
   * 골랐는지는 창이 알려 준다.
   *
   * **한 번에 한 장만**인 것은 그대로다. 얼굴 기준이 여럿이면 모델이 절충해
   * 카드마다 다른 얼굴이 나온다(2026-07-30 실측).
   */
  function pickCharacterAngle({ name, angle, image }: LibraryPickCharacterAngle) {
    const row = images.find((entry) => entry.id === image.id);
    if (!row) return setMessage("이 각도를 라이브러리에서 찾지 못했습니다.");
    if (attachments.some((attachment) => attachment.id === row.id)) {
      return setMessage("이미 들어 있습니다.");
    }
    onChange([...attachments, {
      id: row.id,
      // 인물은 카드마다 얼굴이 유지되어야 한다. 카드 자리는 없다 — 자리가 아니라
      // 모든 카드에 함께 가는 정체성 기준이다.
      kind: "keep_identity",
      subject: "person",
      assetPath: row.storagePath,
      url: row.signedUrl ?? "",
    }]);
    setMessage(`'${name}' 의 ${angle}을(를) 넣었습니다.`);
  }

  function toggle(image: ImageView) {
    const current = attachments.find((attachment) => attachment.id === image.id);
    if (current) return onChange(attachments.filter((attachment) => attachment.id !== image.id));
    onChange([...attachments, {
      id: image.id,
      kind: "style_reference",
      role: "body",
      assetPath: image.storagePath,
      url: image.signedUrl ?? "",
    }]);
  }

  function patch(id: string, change: Partial<Attachment>) {
    onChange(attachments.map((attachment) => attachment.id === id ? { ...attachment, ...change } : attachment));
  }

  const model = modelById(modelId);
  const issues = validateAttachments(attachments, model.maxReferenceImages, totalCards);
  const grouped = groupAttachments(attachments);
  const warnings = (["cover", "body"] as StyleRole[]).flatMap((role) => referenceWarningsForRole(grouped, role));

  /** 라이브러리에서 아주 지운다. 세 도구 어디서도 안 보이게 된다. */
  async function removeFromLibrary(image: ImageView) {
    if (!window.confirm(`'${image.title ?? "이 이미지"}' 를 라이브러리에서 지울까요?`)) return;
    try {
      const body = await (await fetch(`/api/reference-images/${image.id}`, { method: "DELETE" })).json();
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      onChange(attachments.filter((attachment) => attachment.id !== image.id));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지우지 못했습니다.");
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
        <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {uploading ? "올리는 중…" : "새 참고 이미지 올리기"}
        </Button>
        <LibraryPickerButton
          images={images.map((image) => ({ id: image.id, title: image.title, url: image.signedUrl }))}
          selectedIds={attachments.map((attachment) => attachment.id)}
          loading={loading}
          onToggle={(picked) => {
            const image = images.find((entry) => entry.id === picked.id);
            if (image) toggle(image);
          }}
          sets={sets}
          onPickSet={pickSet}
          onPickCharacterAngle={pickCharacterAngle}
          onReload={() => void load()}
          onDelete={(picked) => {
            const image = images.find((entry) => entry.id === picked.id);
            if (image) void removeFromLibrary(image);
          }}
        />
        <span className="text-sm text-muted-foreground">여기서 올린 그림도 라이브러리에 들어갑니다.</span>
      </div>
      {message ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
      {attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 고른 그림이 없습니다. 새로 올리거나 라이브러리에서 불러오세요.
        </p>
      ) : (
        // **이미지 만들기와 같은 격자.** 전에는 카드 하나가 511px 라 넉 장만
        // 넣어도 한 화면에 안 들어왔다 — 「①번을 ②번 느낌으로」를 쓰면서 그림을
        // 봐야 하는데 굴려야 보이면 번호를 붙인 뜻이 없다(2026-09-08 사용자).
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {attachments.map((selected) => {
            const image = images.find((entry) => entry.id === selected.id);
            const title = image?.title ?? "참고 이미지";
            const url = selected.url || image?.signedUrl || "";
            return <Card key={selected.id} className="relative border-primary shadow-[0_0_0_1px_var(--primary-ring)]">
              <button
                type="button"
                aria-label={`${title} 빼기`}
                onClick={() => onChange(attachments.filter((attachment) => attachment.id !== selected.id))}
                className="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
              <div className="aspect-square overflow-hidden rounded-t-xl bg-muted">{url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={title} data-zoomable className="h-full w-full cursor-zoom-in object-cover" />
              ) : null}</div>
              <p className="truncate p-3 text-left text-sm font-medium">{title}</p>
              <CardContent className="grid gap-3 border-t p-3">
                {/* 종류와 대상을 한 칸으로 합쳤다. 두 칸이면 '그대로 넣을 것'을
                    고른 뒤 대상을 안 고르고 넘어가 사람이 물건으로 다뤄졌다. */}
                <label className="grid gap-1 text-xs">이 그림의 역할<select aria-label={`${title} 역할`} className="h-9 rounded-md border bg-background px-2 text-sm" value={roleOf(selected)} onChange={(event) => {
                  const value = event.target.value;
                  if (value === "ending") return patch(selected.id, { kind: "ending", role: undefined, subject: undefined, bodySlot: undefined });
                  const next = toCardNewsAttachment(value as AttachmentRole);
                  patch(selected.id, {
                    kind: next.kind as AttachmentKind,
                    subject: next.subject,
                    // 공용 어휘가 둘을 같은 kind 로 옮기므로 여기서 갈라 적는다.
                    restyle: value === "preserve_person_restyled" ? true : undefined,
                    role: next.kind === "style_reference" ? (selected.role ?? "body") : undefined,
                    bodySlot: undefined,
                  });
                }}>
                  {CARD_ROLES.map((role) => (
                    <option key={role} value={role}>{ATTACHMENT_ROLE_LABEL[role]}</option>
                  ))}
                  <option value="ending">마지막 장</option>
                </select></label>
                {/* 무엇을 고른 것인지 한 줄로 말해 준다. 이미지 만들기에는 있고
                    카드뉴스에는 없어서, 이름만 보고 골라야 했다. */}
                <span className="text-[11px] leading-snug text-subtle-foreground">
                  {ATTACHMENT_ROLE_HINT[roleOf(selected) as AttachmentRole] ?? "마지막 장에 그대로 넣습니다"}
                </span>
                {selected.kind === "style_reference" ? <label className="grid gap-1 text-xs">카드 자리<select aria-label={`${title} 카드 자리`} className="h-9 rounded-md border bg-background px-2 text-sm" value={selected.role ?? "body"} onChange={(event) => patch(selected.id, { role: event.target.value as StyleRole })}><option value="cover">표지</option><option value="body">속지</option><option value="ending">엔딩</option></select></label> : null}
                {selected.kind === "place_as_is" ? <label className="grid gap-1 text-xs">카드 번호 · 선택<input aria-label={`${title} 카드 번호`} className="h-9 rounded-md border bg-background px-2 text-sm" type="number" min={2} max={totalCards - 1} value={selected.bodySlot ?? ""} onChange={(event) => patch(selected.id, { bodySlot: event.target.value ? Number(event.target.value) : undefined })} placeholder={`2~${totalCards - 1}`} /></label> : null}
              </CardContent>
            </Card>;
          })}
        </div>
      )}
      {/*
        **자리마다 번호와 지시.**

        카드에 배지를 못 단다 — 같은 인물이 표지에서는 ②, 속지에서는 ①일 수
        있기 때문이다. 자리별로 묶어야 화면 번호와 프롬프트 번호가 맞는다.
      */}
      <SlotIntents
        attachments={attachments}
        images={images}
        intents={intents}
        onChange={onIntentsChange}
      />

      <div className="grid gap-2" aria-live="polite">
        {issues.map((issue) => <div key={issue} role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 flex-none" />{issue}</div>)}
        {warnings.map((warning) => <div key={warning} className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{warning}</div>)}
        {!issues.length && attachments.length ? <Badge variant="green" className="w-fit">첨부 검증 통과 · {attachments.length}장</Badge> : null}
      </div>
    </div>
  );
}
