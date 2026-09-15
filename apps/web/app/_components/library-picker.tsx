"use client";

import * as React from "react";
import { Check, FolderOpen, Layers, Maximize2, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@fixup/ui";
import { openImageViewer } from "./image-viewer";
import {
  SET_ROLE_LABEL,
  canAttachSet,
  defaultPickedSet,
  orderedSetItems,
  setPickSummary,
  toggleSetItem,
} from "./set-pick";

/**
 * 라이브러리에서 그림을 불러오는 버튼.
 *
 * 전에는 라이브러리 그림을 화면에 통째로 깔아 두고 "눌러서 고르세요"라고
 * 적어 뒀다. 누를 것이 안 보이니 불러올 방법이 없다는 말을 세 번 들었다.
 * 파일 올리기 옆에 같은 크기의 버튼을 두고, 고른 것만 아래에 남긴다.
 *
 * 이 컴포넌트는 그리기만 한다. 목록을 어디서 가져오는지는 쓰는 쪽 사정이다.
 */

export interface LibraryPickImage {
  id: string;
  title: string | null;
  url: string | null;
}

/**
 * 묶음 세트 — 표지·속지·엔딩까지 정해 둔 한 벌.
 *
 * 세트를 만들어 놓고도 여기서 못 불러왔다. 낱장만 보여줘서 한 장씩 고르고
 * 자리도 다시 정해야 했다. 세트를 만든 뜻이 사라진다.
 */
export interface LibraryPickSet {
  id: string;
  name: string;
  items: Array<{ referenceImageId: string; role: "cover" | "body" | "ending" }>;
}

export function LibraryPickerButton({
  images,
  selectedIds,
  loading = false,
  onToggle,
  onReload,
  onDelete,
  sets,
  onPickSet,
  label = "라이브러리에서 불러오기",
  fit = "cover",
  title = "라이브러리에서 불러오기",
  description,
}: {
  images: LibraryPickImage[];
  selectedIds: string[];
  loading?: boolean;
  onToggle(image: LibraryPickImage): void;
  onReload(): void;
  /** 세트를 넣는다. 안 넘기면 세트 탭이 안 나온다. */
  sets?: LibraryPickSet[];
  /**
   * 고른 장만 넘어온다.
   *
   * 전에는 세트를 통째로만 넣을 수 있었다. 세트에 든 장 하나가 이번 작업에 안
   * 맞으면 세트를 새로 만들어야 했고, 그러면 만든 뜻이 사라진다.
   */
  onPickSet?(set: LibraryPickSet, pickedIds: string[]): void;
  /** 라이브러리에서 아주 지운다. 안 넘기면 지우기 버튼이 안 나온다. */
  onDelete?(image: LibraryPickImage): void;
  label?: string;
  /**
   * 격자에 그림을 **채울지 담을지.**
   *
   * 기본은 `cover` — 참고 이미지는 정사각으로 잘라도 무엇인지 알아본다.
   * 광고 마스터처럼 **가로가 긴 그림**(2:1·1.91:1)은 자르면 좌우가 날아가
   * 「건강한 선택」이 「한 선택」이 된다. 어느 작업인지 보려고 보는 그림인데
   * 알아볼 수가 없다. 그럴 때 `contain` 을 준다.
   */
  fit?: "cover" | "contain";
  /** 창을 열고 닫을 때의 제목·설명. 쓰는 화면마다 고르는 것이 다르다. */
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"images" | "sets">("images");
  const [openedSetId, setOpenedSetId] = React.useState<string | null>(null);
  const [setPicked, setSetPicked] = React.useState<string[]>([]);

  const picked = new Set(selectedIds);
  // 그림이 하나도 없는 세트는 누를 이유가 없다. 목록에서 뺀다.
  const shownSets = (sets ?? []).filter((set) => set.items.length > 0);
  const hasSets = Boolean(shownSets.length && onPickSet);
  const openedSet = shownSets.find((entry) => entry.id === openedSetId) ?? null;

  /** 이미지를 id 로 찾는다. 세트는 id 만 들고 있어 그림을 여기서 짝짓는다. */
  const imageById = React.useMemo(
    () => new Map(images.map((image) => [image.id, image])),
    [images],
  );

  /* 열 때마다 처음으로 돌린다. 지난번에 펼쳐 둔 세트가 남아 있으면 헷갈린다. */
  React.useEffect(() => {
    if (open) return;
    setTab("images");
    setOpenedSetId(null);
    setSetPicked([]);
  }, [open]);

  const openSet = (set: LibraryPickSet) => {
    setOpenedSetId(set.id);
    setSetPicked(defaultPickedSet(set.items));
  };

  const attachSet = () => {
    if (!openedSet || !onPickSet || !canAttachSet(setPicked)) return;
    onPickSet(openedSet, setPicked);
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FolderOpen className="size-4" />
        {label}
        <Badge variant="secondary" className="ml-1">{images.length}</Badge>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description ?? `올려 둔 그림 ${images.length}장 · 눌러서 고르고 다시 눌러 뺍니다`}
            </DialogDescription>
          </DialogHeader>

          {/*
            **탭으로 가른다.** 전에는 세트가 단추 한 줄로 위에 얹혀 있었다.
            「실사/녹색 4장」이라고만 적혀 안에 무엇이 들었는지 알 수 없었고,
            그래서 누를 이유가 없는 줄이 되었다(2026-09-15 사용자 보고).

            빈 세트는 아예 안 낸다. 눌러도 아무 일이 없다.
          */}
          {hasSets ? (
            <div className="flex gap-1 border-b">
              <TabButton on={tab === "images"} onClick={() => setTab("images")}>
                그림 <Badge variant="secondary" className="ml-1">{images.length}</Badge>
              </TabButton>
              <TabButton on={tab === "sets"} onClick={() => { setTab("sets"); setOpenedSetId(null); }}>
                묶음 세트 <Badge variant="secondary" className="ml-1">{shownSets.length}</Badge>
              </TabButton>
            </div>
          ) : null}

          {tab === "sets" && hasSets ? (
            openedSet ? (
              <>
                <SetContents
                  set={openedSet}
                  picked={setPicked}
                  imageById={imageById}
                  onToggle={(id) => setSetPicked((current) => toggleSetItem(current, id, openedSet.items))}
                />
                <DialogFooter className="items-center gap-2 sm:justify-between">
                  <span className="text-sm text-muted-foreground">
                    {setPickSummary(setPicked, openedSet.items)}
                  </span>
                  <span className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => setOpenedSetId(null)}>
                      다른 세트
                    </Button>
                    <Button type="button" onClick={attachSet} disabled={!canAttachSet(setPicked)}>
                      {canAttachSet(setPicked) ? "이 장들을 붙입니다" : "장을 고르세요"}
                    </Button>
                  </span>
                </DialogFooter>
              </>
            ) : (
              <SetGrid sets={shownSets} imageById={imageById} onOpen={openSet} />
            )
          ) : null}

          {tab === "sets" && hasSets ? null : loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">불러오는 중입니다.</p>
          ) : images.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              라이브러리가 비어 있습니다. 먼저 그림을 올려 주세요.
            </p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
              {images.map((image) => {
                const selected = picked.has(image.id);
                return (
                  <div key={image.id} className="relative">
                    <button
                      type="button"
                      onClick={() => onToggle(image)}
                      aria-pressed={selected}
                      aria-label={`${image.title ?? "참고 이미지"} ${selected ? "빼기" : "고르기"}`}
                      className={cn(
                        // 고른 것은 **멀리서도 보여야 한다.** 테두리 하나로는
                        // 격자 안에서 눈에 안 띈다 — 색 고리와 바탕까지 같이 바꾼다.
                        "block w-full overflow-hidden rounded-lg border-2 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary-soft ring-2 ring-primary/40"
                          : "border-transparent hover:border-border",
                      )}
                    >
                      <span className="relative block aspect-square overflow-hidden bg-muted">
                        {image.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image.url}
                            alt=""
                            className={cn(
                              "h-full w-full",
                              fit === "contain" ? "object-contain p-1" : "object-cover",
                            )}
                          />
                        ) : null}
                        {/*
                          **오른쪽 아래다.** 왼쪽 위에는 확대 단추가 겹쳐 있어서,
                          거기 두면 골랐다는 표시가 그 단추에 가려 안 보였다
                          (2026-09-11). 지우기 단추는 오른쪽 위에 있다.
                        */}
                        {selected ? (
                          <span className="absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-ring)]">
                            <Check className="size-3.5" />
                          </span>
                        ) : null}
                      </span>
                      <span className={cn(
                        "block truncate px-2 py-2 text-xs",
                        selected && "font-bold text-primary",
                      )}>
                        {image.title ?? "제목 없음"}
                      </span>
                    </button>
                    {/* 그림 자체는 고르기에 쓰이므로 확대는 따로 연다. */}
                    <button
                      type="button"
                      aria-label={`${image.title ?? "참고 이미지"} 크게 보기`}
                      onClick={() => openImageViewer(image.url ?? "", image.title ?? "참고 이미지")}
                      className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-foreground"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                    {onDelete ? (
                      <button
                        type="button"
                        aria-label={`${image.title ?? "참고 이미지"} 라이브러리에서 지우기`}
                        onClick={() => onDelete(image)}
                        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/*
            **세트를 펼쳤을 때는 이 줄을 안 낸다.** 그 아래에 세트 전용 단추 줄이
            이미 있어서, 둘이 겹치면 어느 쪽을 눌러야 붙는지 알 수 없다.
          */}
          {openedSet ? null : (
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={onReload}>새로고침</Button>
              <Button type="button" onClick={() => setOpen(false)}>
                다 골랐습니다{selectedIds.length ? ` · ${selectedIds.length}장` : ""}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 탭 하나. 눌린 쪽이 밑줄로 남는다. */
function TabButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * 세트 목록.
 *
 * **안에 든 그림을 겹쳐 보여준다.** 이름과 장수만 적혀 있으면 무엇이 들었는지
 * 눌러 봐야 알고, 그러면 누를 이유가 없는 줄이 된다 — 캐릭터 카드가 정면을
 * 대표로 세우는 것과 같은 규칙이다.
 */
function SetGrid({
  sets,
  imageById,
  onOpen,
}: {
  sets: LibraryPickSet[];
  imageById: Map<string, LibraryPickImage>;
  onOpen(set: LibraryPickSet): void;
}) {
  return (
    <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3">
      {sets.map((set) => {
        const shots = orderedSetItems(set.items)
          .map((item) => imageById.get(item.referenceImageId))
          .filter((image): image is LibraryPickImage => Boolean(image?.url))
          .slice(0, 4);

        return (
          <button
            key={set.id}
            type="button"
            onClick={() => onOpen(set)}
            className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary"
          >
            <span className="relative flex gap-0.5 bg-muted p-0.5">
              {shots.length ? (
                shots.map((image) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={image.id} alt="" src={image.url as string} className="aspect-[3/4] min-w-0 flex-1 object-cover" />
                ))
              ) : (
                <span className="grid aspect-[3/1] w-full place-items-center text-center text-xs text-subtle-foreground">
                  그림을 못 불러왔습니다
                </span>
              )}

              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-[var(--shadow-ring)]">
                <Layers className="size-3" />
                {set.items.length}장
              </span>
            </span>

            <span className="truncate p-2 text-sm font-bold">{set.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 펼친 세트의 장들. **자리 이름을 함께** 단다.
 *
 * 세트의 값어치가 자리(표지·속지·엔딩)를 들고 있다는 것이라, 자리가 안 보이면
 * 낱장을 여럿 고른 것과 구분이 안 된다.
 */
function SetContents({
  set,
  picked,
  imageById,
  onToggle,
}: {
  set: LibraryPickSet;
  picked: string[];
  imageById: Map<string, LibraryPickImage>;
  onToggle(id: string): void;
}) {
  return (
    <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
      {orderedSetItems(set.items).map((item) => {
        const image = imageById.get(item.referenceImageId);
        const on = picked.includes(item.referenceImageId);

        return (
          <button
            key={item.referenceImageId}
            type="button"
            onClick={() => onToggle(item.referenceImageId)}
            aria-pressed={on}
            aria-label={`${SET_ROLE_LABEL[item.role]} ${image?.title ?? ""} ${on ? "빼기" : "고르기"}`}
            className={cn(
              "relative block overflow-hidden rounded-lg border-2 text-left transition-colors",
              on ? "border-primary bg-primary-soft ring-2 ring-primary/40" : "border-transparent hover:border-muted-foreground/40",
            )}
          >
            {image?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={image.url} className="aspect-[3/4] w-full object-cover" />
            ) : (
              <span className="grid aspect-[3/4] w-full place-items-center px-2 text-center text-xs text-subtle-foreground">
                이 그림을 못 찾았습니다
              </span>
            )}

            <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-bold shadow-[var(--shadow-ring)]">
              {SET_ROLE_LABEL[item.role]}
            </span>

            {on ? (
              <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-ring)]">
                <Check className="size-3.5" />
              </span>
            ) : null}

            <span className="block truncate px-2 py-1.5 text-xs">{image?.title ?? "제목 없음"}</span>
          </button>
        );
      })}
    </div>
  );
}
