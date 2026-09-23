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
import { gridSrc } from "./grid-src";
import { ThumbImage } from "./thumb-image";
import { canDeleteReference } from "./reference-delete-prompt";
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
  /** 원본. 골라서 실제로 쓸 때와 확대해 볼 때 이것을 쓴다. */
  url: string | null;
  /**
   * 격자에 거는 작은 사본. 없으면 원본으로 떨어진다(`grid-src.ts`).
   *
   * **물음표를 붙이지 않는다.** 없을 수 있다는 뜻은 `null` 이 맡고, 적는
   * 것 자체는 강제한다. 선택형으로 뒀더니 호출처 넷 중 하나가 통째로
   * 빠졌는데 타입 검사·시험 2,084개·린트가 전부 통과했다(2026-09-15).
   * 사본 주소가 없는 화면은 `null` 이라고 적어서 그렇다고 밝힌다.
   */
  thumbUrl: string | null;
  /**
   * 내가 올린 것인가. **`false` 면 남의 것이다.**
   *
   * 창고가 공용이라 목록에 남의 그림이 섞여 있다. 안 실으면 화면이 내 것과
   * 남의 것을 가를 방법이 없고, 그러면 지우기 단추가 아무 데나 붙는다
   * (2026-09-17 독립 리뷰). 모르면 `undefined` — 그때는 안 가른다.
   */
  mine?: boolean;
  /** 누가 올렸는가. 관리자에게만 온다. 지우기 전에 밝히는 데 쓴다. */
  ownerEmail?: string | null;
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
  canDeleteOthers = false,
  sets,
  onPickSet,
  label = "라이브러리에서 불러오기",
  triggerAriaLabel,
  triggerVariant = "outline",
  fit = "cover",
  title = "라이브러리에서 불러오기",
  description,
}: {
  images: LibraryPickImage[];
  selectedIds: string[];
  loading?: boolean;
  onToggle(image: LibraryPickImage): void;
  onReload(): void;
  /**
   * 남이 올린 것에도 지우기를 낼까. **관리자만 참이다.**
   *
   * 기본은 거짓 — 넘기는 것을 잊은 화면은 좁은 쪽으로 틀린다.
   */
  canDeleteOthers?: boolean;
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
  /** 글자 없이 아이콘만 낼 때의 이름. 화면 낭독기가 읽는다. */
  triggerAriaLabel?: string;
  /**
   * 여는 단추의 색. **기본은 지금까지대로 `outline`** 이라 쓰던 화면은 그대로다.
   *
   * Easy 첫 화면만 다르다 — 거기서는 이 단추가 나란한 셋 중 하나이고,
   * 셋이 똑같이 생기면 무엇이 다음 걸음인지 알 수 없다(2026-09-21 사용자).
   */
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
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
  /**
   * **내 그림만 볼까.**
   *
   * 창고가 공용이라 남이 올린 그림이 함께 보인다. 쓸 만한 본보기를 같이 쓰자는
   * 뜻이지만, 내가 올린 것을 찾을 때는 남의 것이 방해가 된다(2026-09-17 사용자
   * 결정). 목록 자체는 이미 **내 것을 앞에** 두고 온다.
   */
  const [mineOnly, setMineOnly] = React.useState(false);

  const picked = new Set(selectedIds);
  // 그림이 하나도 없는 세트는 누를 이유가 없다. 목록에서 뺀다.
  const shownSets = (sets ?? []).filter((set) => set.items.length > 0);
  const hasSets = Boolean(shownSets.length && onPickSet);
  const openedSet = shownSets.find((entry) => entry.id === openedSetId) ?? null;

  /**
   * 내 것만 보기를 켰을 때 실제로 그릴 목록.
   *
   * **주인을 모르는 줄은 「내 것」이 아니다.** 지우기 판정(`canDeleteReference`)도
   * 모르면 닫는 쪽이다 — 두 값이 서로 다른 방향으로 틀리면 안 된다
   * (2026-09-17 독립 리뷰).
   */
  const shownImages = mineOnly ? images.filter((image) => image.mine === true) : images;
  /** 남이 올린 것이 하나라도 있나. 없으면 거를 것도 없어 단추를 안 낸다. */
  const hasOthers = images.some((image) => image.mine === false);

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
      <Button type="button" variant={triggerVariant} aria-label={triggerAriaLabel} onClick={() => setOpen(true)}>
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
            <>
              {/* 남의 것이 섞여 있을 때만 낸다. 혼자 쓰는 사람에게는 뜻이 없다. */}
              {hasOthers ? (
                <div className="flex items-center gap-1.5">
                  <TabButton on={!mineOnly} onClick={() => setMineOnly(false)}>
                    전체 <Badge variant="secondary" className="ml-1">{images.length}</Badge>
                  </TabButton>
                  <TabButton on={mineOnly} onClick={() => setMineOnly(true)}>
                    내 그림
                    <Badge variant="secondary" className="ml-1">
                      {images.filter((image) => image.mine === true).length}
                    </Badge>
                  </TabButton>
                </div>
              ) : null}
              {shownImages.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  내가 올린 그림이 없습니다. 「전체」를 누르면 함께 쓰는 그림이 보입니다.
                </p>
              ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
              {shownImages.map((image) => {
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
                        {gridSrc(image) ? (
                          <ThumbImage
                            src={gridSrc(image) as string}
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
                    {onDelete && canDeleteReference(image, { isAdmin: canDeleteOthers }) ? (
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
            </>
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
                  <ThumbImage key={image.id} alt="" src={gridSrc(image) as string} className="aspect-[3/4] min-w-0 flex-1 object-cover" />
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
            {gridSrc(image) ? (
              <ThumbImage alt="" src={gridSrc(image) as string} className="aspect-[3/4] w-full object-cover" />
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
