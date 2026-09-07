"use client";

import * as React from "react";
import { AlertTriangle, ImagePlus, X } from "lucide-react";
import { Button, Label, Textarea, cn } from "@fixup/ui";
import {
  ATTACHMENT_ROLE_HINT, ATTACHMENT_ROLE_LABEL, personOverflow, type AttachmentRole,
} from "@fixup/shared";
import {
  LibraryPickerButton, type LibraryPickCharacter, type LibraryPickSet,
} from "../../_components/library-picker";
import { attachmentNumber } from "@fixup/poster-core";
import { openImageViewer } from "../../_components/image-viewer";
import { randomId } from "../../../lib/browser-safe";

/**
 * 포스터 레퍼런스 고르기.
 *
 * 라이브러리의 그림을 그대로 쓴다. 여기서 새로 올려도 라이브러리에 들어간다 —
 * 올린 곳이 어디든 세 도구가 다 본다.
 *
 * 역할은 공용 어휘를 쓴다(@fixup/shared). 세 도구가 같은 말을 써야 라이브러리에서
 * 불러온 그림이 도구를 옮겨도 역할을 잃지 않는다.
 *
 *   따라 만들기        레이아웃·서체·색을 가져온다
 *   제품 그대로 지키기   형태·색·재질·라벨을 유지한다
 *   인물 그대로 지키기   얼굴과 체형을 유지한다
 */

export interface ReferenceItem {
  id: string;
  title: string | null;
  url?: string;
}

/** 공용 역할 어휘를 그대로 쓴다. none 은 '아직 안 골랐다'는 화면 상태다. */
export type Role = "none" | AttachmentRole;

/**
 * 여기서 고를 수 있는 역할.
 *
 * 「원본 그대로 넣기」는 뺐다. 그건 여러 장 중 한 자리에 원본을 끼우는
 * 말인데 포스터는 한 장짜리라 끼울 자리가 없다(toPosterImage 도 null 을
 * 돌려준다).
 */
const POSTER_ROLES: AttachmentRole[] = ["style", "preserve_product", "preserve_person"];

export function ReferencePicker({
  references, roles, order, onRoleChange, onUploaded, intent, onIntentChange,
}: {
  references: ReferenceItem[];
  roles: Record<string, Role>;
  /**
   * **고른 차례.** 이 차례가 화면의 ①②③ 이고 프롬프트의 `Image N` 이다.
   *
   * `references` 는 라이브러리 최신순이라 먼저 고른 것이 뒤에 놓인다. 그 순서로
   * 번호를 매기면 「①번을」이라고 쓴 지시가 다른 그림에 붙는다.
   */
  order: string[];
  onRoleChange(id: string, role: Role): void;
  /** 다시 읽은 목록을 돌려준다. 방금 올린 줄이 들어왔는지 여기서 확인한다. */
  onUploaded(): Promise<ReferenceItem[]>;
  /** 첨부한 그림들을 어떻게 쓸지. 드롭다운으로 못 만드는 조합을 여기서 연다. */
  intent: string;
  onIntentChange(value: string): void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [sets, setSets] = React.useState<LibraryPickSet[]>([]);
  const [characters, setCharacters] = React.useState<LibraryPickCharacter[]>([]);
  const fileInput = React.useRef<HTMLInputElement>(null);

  /**
   * 묶음 세트도 여기서 부른다.
   *
   * 세트의 역할(표지·속지·엔딩)은 카드뉴스의 말이라 여기서는 뜻이 없다.
   * 그래도 **묶음 자체는 뜻이 있다** — 같이 쓰려고 묶어 둔 그림들이다.
   * 역할은 버리고 전부 「따라 만들기」로 넣는다.
   */
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = await (await fetch("/api/reference-sets", { cache: "no-store" })).json();
        if (alive) setSets(body.ok ? (body.sets ?? []) : []);
        const characterBody = await (await fetch("/api/characters", { cache: "no-store" })).json();
        if (alive) setCharacters(characterBody.ok ? (characterBody.characters ?? []) : []);
      } catch {
        // 세트를 못 불러와도 낱장 고르기는 그대로 된다.
      }
    })();
    return () => { alive = false; };
  }, []);

  /**
   * 캐릭터를 넣는다 — **정면 한 장만.**
   *
   * 네 장을 다 넣으면 안 된다. 정체성 참조가 여러 장이면 모델이 그것들을
   * 절충해 제3의 인물을 만든다(2026-07-30 실측, pdp.character.ts 의
   * pickAngleForSection 주석). 화면의 「인물은 한 명만」 경고에도 걸린다 —
   * 같은 사람인데 넷으로 세어진다.
   *
   * 다른 각도가 필요하면 라이브러리 낱장에 「이름 (캐릭터) · 좌측」 으로
   * 그대로 있으니 거기서 고르면 된다.
   *
   * 역할은 「인물 그대로 지키기」로 정한다. 캐릭터를 붙이는 이유가 그 대상을
   * 지키려는 것이므로 「따라 만들기」로 들어가면 뜻이 반대가 된다. 사물
   * 캐릭터라면 화면에서 「제품 그대로 지키기」로 바꾸면 된다.
   */
  function pickCharacter(character: LibraryPickCharacter) {
    const prefix = `${character.name} (캐릭터)`;
    const matched = references.filter((entry) => (entry.title ?? "").startsWith(prefix));
    const front = matched.find((entry) => (entry.title ?? "").endsWith("정면")) ?? matched[0];
    if (!front) {
      setMessage("이 캐릭터의 각도를 라이브러리에서 찾지 못했습니다.");
      return;
    }
    onRoleChange(front.id, "preserve_person");
    setMessage(
      `'${character.name}' 의 정면을 넣었습니다. 다른 각도가 필요하면 라이브러리 낱장에서 고르세요.`,
    );
  }

  function pickSet(set: LibraryPickSet) {
    for (const item of set.items) {
      if ((roles[item.referenceImageId] ?? "none") === "none") {
        onRoleChange(item.referenceImageId, "style");
      }
    }
  }

  /** 라이브러리에서 아주 지운다. 세 도구 어디서도 안 보이게 된다. */
  async function remove(item: ReferenceItem) {
    if (!window.confirm(`'${item.title ?? "이 이미지"}' 를 라이브러리에서 지울까요?`)) return;
    try {
      const body = await (await fetch(`/api/reference-images/${item.id}`, { method: "DELETE" })).json();
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      onRoleChange(item.id, "none");
      await onUploaded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지우지 못했습니다.");
    }
  }

  /**
   * 올린 그림은 **바로 이 작업에 넣는다.**
   *
   * 전에는 라이브러리에만 넣고 끝냈다. 여기 보이는 것은 역할이 정해진 그림뿐이라
   * 화면은 아무 변화가 없었고, 올리기가 안 되는 것처럼 보였다. 실제로는 저장까지
   * 다 되고 있었다(2026-09-03 운영 DB 확인). 올리는 사람은 지금 쓰려고 올린다.
   *
   * **다시 읽기를 기다린다.** 던져 놓고 역할만 주면 그 사이 `picked` 가 못 찾는다
   * — 화면에 붙인 그림은 `references` 에 있는 줄만 그리기 때문이다. 다시 읽기가
   * 실패하면 역할만 남고 그림은 영영 안 나온다. 그때는 조용히 넘기지 않고 말한다.
   */
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const id = randomId();
        const form = new FormData();
        form.set("id", id);
        form.set("title", file.name.replace(/\.[^.]+$/, ""));
        // 용도로 거르지 않지만 어디서 올렸는지는 남긴다.
        form.set("purpose", "poster");
        form.set("file", file);
        const response = await fetch("/api/reference-images", { method: "POST", body: form });
        const payload = await response.json() as { ok?: boolean; message?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.message ?? "올리지 못했습니다.");
        added.push(id);
      }
      const fresh = await onUploaded();
      const missing = added.filter((id) => !fresh.some((entry) => entry.id === id));
      if (missing.length) {
        setMessage(
          `${missing.length}장이 라이브러리 목록에 아직 안 보입니다. `
          + "저장은 됐으니 새로고침하면 나옵니다.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "올리지 못했습니다.");
    } finally {
      // 중간에 실패해도 그 앞에 성공한 것들은 넣는다. 이미 라이브러리에 있다.
      for (const id of added) onRoleChange(id, "style");
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /**
   * 고른 것만, **고른 차례로** 화면에 남긴다.
   *
   * 전에는 `references.filter(...)` 였다. 그러면 라이브러리 최신순이라 먼저
   * 고른 것이 뒤에 놓이고, 화면 번호가 사용자가 넣은 차례와 어긋난다.
   */
  const picked = order
    .map((id) => references.find((reference) => reference.id === id))
    .filter((reference): reference is ReferenceItem => Boolean(reference));

  // 사람과 물건을 가르는 이유: 지키는 방법이 다르고, 얼굴이 둘이면 모델이
  // 절충해 제3의 인물을 만든다(2026-07-30 실측).
  const tooManyPeople = personOverflow(picked.map((reference) => roles[reference.id] as AttachmentRole));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(event) => void upload(event.target.files)}
        />
        <Button type="button" variant="secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="size-4" />
          {uploading ? "올리는 중…" : "새 이미지 올리기"}
        </Button>
        <LibraryPickerButton
          images={references.map((reference) => ({ id: reference.id, title: reference.title, url: reference.url ?? null }))}
          selectedIds={references.filter((reference) => (roles[reference.id] ?? "none") !== "none").map((reference) => reference.id)}
          onToggle={(picked) => onRoleChange(picked.id, (roles[picked.id] ?? "none") === "none" ? "style" : "none")}
          sets={sets}
          onPickSet={pickSet}
          characters={characters}
          onPickCharacter={pickCharacter}
          onReload={onUploaded}
          onDelete={(picked) => {
            const reference = references.find((entry) => entry.id === picked.id);
            if (reference) void remove(reference);
          }}
        />
        <span className="text-sm text-muted-foreground">
          여기서 올린 그림도 라이브러리에 들어갑니다.
        </span>
      </div>

      {message ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {message}
        </div>
      ) : null}

      {tooManyPeople ? (
        <div role="alert" className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 flex-none" />
          인물을 지키는 그림이 둘 이상입니다. 모델이 얼굴을 섞어 없던 사람을 만듭니다 —
          한 명만 남기세요. 그대로 두면 첫 번째 인물만 씁니다.
        </div>
      ) : null}

      {picked.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 고른 그림이 없습니다. 새로 올리거나 라이브러리에서 불러오세요.
        </p>
      ) : (
        // 한 칸을 작게 잡는다. 넉 장을 넣어도 한 화면에 들어와야 「①번을 ②번
        // 느낌으로」를 쓰면서 그림을 볼 수 있다. 큰 그림이 필요하면 눌러서 연다.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {picked.map((reference, index) => {
            const role = (roles[reference.id] ?? "style") as AttachmentRole;
            const title = reference.title ?? "참고 이미지";
            // 화면 ①②③ 과 프롬프트 `Image N` 이 **같은 함수**로 센다.
            const number = attachmentNumber(index);
            return (
              <div key={reference.id} className="relative">
              <div
                className={cn(
                  "overflow-hidden rounded-lg border-2 transition-colors",
                  role === "style" ? "border-primary" : "border-amber-500",
                )}
              >
                <button
                  type="button"
                  aria-label={`${title} 크게 보기`}
                  onClick={() => openImageViewer(reference.url ?? "", title)}
                  className="block w-full"
                >
                  {reference.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={reference.url} alt={title} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center bg-muted text-xs text-muted-foreground">
                      미리보기 없음
                    </div>
                  )}
                </button>
                {/*
                  **번호를 크게 왼쪽 위에.** 지시란에 「①번」이라고 쓰려면 어느
                  것이 ① 인지 보여야 한다. 프롬프트는 이미 이 번호를 쓰고 있었고,
                  화면만 안 보여 주고 있었다.
                */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-foreground/85 text-sm font-bold text-background shadow"
                >
                  {number}
                </span>
                <div className="grid gap-1 px-3 pb-3 pt-2">
                  <span className="truncate text-xs">
                    <span className="sr-only">{number}번 그림. </span>
                    {title}
                  </span>
                  {/*
                    역할은 고르게 한다. 예전에는 그림을 누르면 역할이 돌았는데,
                    누를 수 있다는 것 자체가 안 보여서 전부 「따라 만들기」로
                    나갔다. 지켜야 할 제품이 그냥 참고로 쓰이면 결과가 딴것이 된다.
                  */}
                  <label className="grid gap-1 text-xs">
                    <span className="sr-only">이 그림의 역할</span>
                    <select
                      aria-label={`${title} 역할`}
                      value={role}
                      onChange={(event) => onRoleChange(reference.id, event.target.value as Role)}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      {POSTER_ROLES.map((option) => (
                        <option key={option} value={option}>{ATTACHMENT_ROLE_LABEL[option]}</option>
                      ))}
                    </select>
                  </label>
                  <span className="text-[11px] leading-snug text-subtle-foreground">
                    {ATTACHMENT_ROLE_HINT[role]}
                  </span>
                </div>
              </div>
                <button
                  type="button"
                  aria-label={`${reference.title ?? "참고 이미지"} 빼기`}
                  onClick={() => onRoleChange(reference.id, "none")}
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/*
        **드롭다운으로 못 만드는 조합을 여기서 연다.**

        역할 셋은 「무엇을 가져올지」를 묶음으로만 고르게 한다. 「①번 사람들을
        ②번 느낌으로」는 누구인지(①)와 그림 느낌(②)을 갈라 가져오는 것이라
        어느 묶음에도 없다.

        여기 적은 말은 프롬프트의 맨 앞으로 가고, 다른 모든 지시보다 세다.

        그림이 없으면 안 보인다 — 쓸 대상이 없다.
      */}
      {picked.length > 0 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="attachment-intent">이 그림들을 어떻게 쓸까요 · 선택</Label>
          <Textarea
            id="attachment-intent"
            value={intent}
            onChange={(event) => onIntentChange(event.target.value)}
            rows={2}
            placeholder="예: 1번 사진의 사람들을 2번 그림 느낌으로"
          />
          <p className="text-sm text-muted-foreground">
            그림 왼쪽 위 번호로 부르면 됩니다. 여기 적은 말이 위에서 고른 역할보다 우선합니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
