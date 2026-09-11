"use client";

import * as React from "react";
import { Check, FolderOpen, Layers, Maximize2, Trash2, UserRound } from "lucide-react";
import {

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
import { groupCharacterRows, withoutCharacterRows } from "./character-rows";

/**
 * 라이브러리에서 그림을 불러오는 버튼.
 *
 * 전에는 라이브러리 그림을 화면에 통째로 깔아 두고 "눌러서 고르세요"라고
 * 적어 뒀다. 누를 것이 안 보이니 불러올 방법이 없다는 말을 세 번 들었다.
 * 파일 올리기 옆에 같은 크기의 버튼을 두고, 고른 것만 아래에 남긴다.
 *
 * ── **칸을 탭으로 나눈다** (2026-09-11 사용자 요청) ────────────────
 *
 * 묶음 세트와 캐릭터를 낱장 격자 **위에** 쌓아 뒀더니 셋이 서로를 밀어냈다.
 * 세트는 이름과 장수만 있어 무엇이 든 벌인지 알 수 없었고, 캐릭터는 작은
 * 썸네일만 붙어 있는 데다 눌러도 **정면만** 들어갔다 — 측면을 만들어 둔
 * 뜻이 사라진다.
 *
 * 지금은 셋을 탭으로 가른다. 라이브러리가 기본이고, 세트·캐릭터는 줄 것이
 * 있을 때만 탭이 생긴다. 캐릭터 탭에서는 **각도를 하나씩 고른다.**
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

/** 캐릭터에서 고른 한 각도. 쓰는 쪽은 이 낱장에 역할만 정하면 된다. */
export interface LibraryPickCharacterAngle {
  /** 캐릭터 이름. 「예천 들기름 모델」 */
  name: string;
  /** 각도 이름. 「정면」 */
  angle: string;
  /** 그 각도의 라이브러리 낱장. */
  image: LibraryPickImage;
}

/**
 * 숫자 딱지.
 *
 * `Badge` 를 안 쓴다 — 그것은 `<div>` 라서 `<p>`·`<button>` 안에 넣으면
 * HTML 이 어긋나고 React 가 하이드레이션 경고를 낸다. 여기 자리는 전부
 * 글자 사이라 `<span>` 이어야 한다.
 */
function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">
      {children}
    </span>
  );
}

const SET_ROLE: Record<string, string> = { cover: "표지", body: "속지", ending: "엔딩" };
/** 한 벌을 훑는 차례. 카드뉴스가 나가는 차례와 같다. */
const SET_ROLE_ORDER = ["cover", "body", "ending"];

type TabId = "images" | "sets" | "characters";

export function LibraryPickerButton({
  images,
  selectedIds,
  loading = false,
  onToggle,
  onReload,
  onDelete,
  sets,
  onPickSet,
  onPickCharacterAngle,
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
  /** 세트를 통째로 넣는다. 안 넘기면 세트 탭이 안 나온다. */
  sets?: LibraryPickSet[];
  onPickSet?(set: LibraryPickSet): void;
  /**
   * 캐릭터의 한 각도를 넣는다. 안 넘기면 캐릭터 탭이 안 나온다.
   *
   * **각도는 한 번에 하나다.** 정체성 참조가 여럿이면 모델이 절충해 장마다
   * 다른 얼굴이 나온다(2026-07-30 실측). 그래서 「전부 넣기」를 두지 않는다.
   */
  onPickCharacterAngle?(pick: LibraryPickCharacterAngle): void;
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
  const [tab, setTab] = React.useState<TabId>("images");
  const picked = new Set(selectedIds);

  const groups = React.useMemo(
    () => (onPickCharacterAngle ? groupCharacterRows(images) : []),
    [images, onPickCharacterAngle],
  );

  /**
   * 낱장 탭에서는 **캐릭터 줄을 뺀다.**
   *
   * 캐릭터 하나가 일곱 장이라, 두어 명만 만들어도 낱장 격자가 캐릭터로 찬다.
   * 캐릭터 탭에 그대로 있으므로 사라지는 것이 아니다 — 아래 안내로 말한다.
   * 캐릭터 탭이 없는 화면(광고)에서는 그대로 둔다.
   */
  const loose = React.useMemo(
    () => (onPickCharacterAngle ? withoutCharacterRows(images) : images),
    [images, onPickCharacterAngle],
  );

  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "images", label: "라이브러리", count: loose.length },
    ...(sets?.length && onPickSet ? [{ id: "sets" as const, label: "묶음 세트", count: sets.length }] : []),
    ...(groups.length && onPickCharacterAngle
      ? [{ id: "characters" as const, label: "캐릭터", count: groups.length }]
      : []),
  ];

  // 열 때마다 낱장으로 돌아간다. 지난번에 캐릭터 탭에서 닫았다고 그 자리에서
  // 열리면, 대부분의 사람이 찾는 것(낱장)이 한 번 더 눌러야 나온다.
  React.useEffect(() => { if (open) setTab("images"); }, [open]);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FolderOpen className="size-4" />
        {label}
        <Count>{images.length}</Count>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description ?? "눌러서 고르고 다시 눌러 뺍니다"}
            </DialogDescription>
          </DialogHeader>

          {/* 탭은 줄 것이 둘 이상일 때만 그린다. 하나뿐인데 탭을 두면
              누를 것이 하나인 줄이 하나 더 생길 뿐이다. */}
          {tabs.length > 1 ? (
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
              {tabs.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-current={tab === entry.id ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === entry.id
                      ? "bg-background shadow-[var(--shadow-ring)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.id === "sets" ? <Layers className="size-3.5" /> : null}
                  {entry.id === "characters" ? <UserRound className="size-3.5" /> : null}
                  {entry.label}
                  <Count>{entry.count}</Count>
                </button>
              ))}
            </div>
          ) : null}

          {/* ── 낱장 ────────────────────────────────────────────── */}
          {tab === "images" ? (
            loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">불러오는 중입니다.</p>
            ) : loose.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {images.length
                  ? "낱장은 없습니다. 위 「캐릭터」 탭에서 고르세요."
                  : "라이브러리가 비어 있습니다. 먼저 그림을 올려 주세요."}
              </p>
            ) : (
              <>
                <div className="grid max-h-[56vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
                  {loose.map((image) => (
                    <PickCell
                      key={image.id}
                      image={image}
                      selected={picked.has(image.id)}
                      fit={fit}
                      onToggle={() => onToggle(image)}
                      onDelete={onDelete ? () => onDelete(image) : undefined}
                    />
                  ))}
                </div>
                {groups.length ? (
                  <p className="text-[11px] text-subtle-foreground">
                    캐릭터의 각도 {groups.reduce((sum, group) => sum + group.angles.length, 0)}장은
                    「캐릭터」 탭에 모아 두었습니다.
                  </p>
                ) : null}
              </>
            )
          ) : null}

          {/* ── 묶음 세트 ────────────────────────────────────────── */}
          {tab === "sets" && sets && onPickSet ? (
            <div className="grid max-h-[56vh] gap-3 overflow-y-auto p-1 sm:grid-cols-2">
              {sets.map((set) => {
                // 무엇이 든 벌인지 **보여 준다.** 전에는 이름과 장수뿐이라
                // 열어 보기 전에는 알 수 없었다.
                // 차례는 **표지 → 속지 → 엔딩**이다. 세트에 담긴 차례를 그대로
                // 두면 엔딩이 맨 앞에 와서, 한 벌을 훑는 눈이 거꾸로 간다.
                const shots = set.items
                  .map((item) => ({
                    role: item.role,
                    image: images.find((entry) => entry.id === item.referenceImageId),
                  }))
                  .filter((entry) => entry.image?.url)
                  .sort((left, right) => SET_ROLE_ORDER.indexOf(left.role) - SET_ROLE_ORDER.indexOf(right.role));

                return (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => { onPickSet(set); setOpen(false); }}
                    className="grid gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary"
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{set.name}</span>
                      <Count>{set.items.length}장</Count>
                    </span>
                    {shots.length ? (
                      <span className="flex gap-1.5">
                        {shots.slice(0, 4).map((entry) => (
                          <span key={entry.image!.id} className="grid w-16 gap-0.5">
                            <span className="block aspect-[3/4] overflow-hidden rounded border bg-muted">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={entry.image!.url as string} alt="" className="h-full w-full object-cover" />
                            </span>
                            <span className="text-center text-[10px] text-subtle-foreground">
                              {SET_ROLE[entry.role] ?? entry.role}
                            </span>
                          </span>
                        ))}
                        {shots.length > 4 ? (
                          <span className="grid w-16 place-items-center rounded border border-dashed text-[11px] text-subtle-foreground">
                            +{shots.length - 4}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="rounded border border-dashed p-3 text-center text-[11px] text-subtle-foreground">
                        이 세트의 그림을 라이브러리에서 찾지 못했습니다.
                      </span>
                    )}
                    <span className="text-[11px] text-subtle-foreground">누르면 한 벌이 통째로 들어갑니다</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* ── 캐릭터 ──────────────────────────────────────────── */}
          {tab === "characters" && onPickCharacterAngle ? (
            <div className="grid max-h-[56vh] gap-4 overflow-y-auto p-1">
              <p className="text-[11px] leading-snug text-subtle-foreground">
                <strong>각도를 하나 고르세요.</strong> 얼굴 기준은 한 장만 넣습니다 —
                여러 장을 넣으면 모델이 절충해 장마다 다른 얼굴이 나옵니다.
              </p>
              {groups.map((group) => (
                <section key={group.name} className="grid gap-2 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <UserRound className="size-3.5 flex-none text-subtle-foreground" />
                    <span className="min-w-0 truncate">{group.name}</span>
                    <Count>{group.angles.length}장</Count>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                    {group.angles.map((row) => (
                      <PickCell
                        key={row.image.id}
                        image={row.image}
                        caption={row.angle}
                        selected={picked.has(row.image.id)}
                        fit="cover"
                        onToggle={() => {
                          onPickCharacterAngle({ name: group.name, angle: row.angle, image: row.image });
                          setOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={onReload}>새로고침</Button>
            <Button type="button" onClick={() => setOpen(false)}>
              다 골랐습니다{selectedIds.length ? ` · ${selectedIds.length}장` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 고를 수 있는 그림 한 칸. 낱장 탭과 캐릭터 탭이 같은 칸을 쓴다.
 *
 * 고른 표시는 **오른쪽 아래**다. 왼쪽 위에는 확대 단추가 겹쳐 있어서, 거기
 * 두면 골랐다는 표시가 그 단추에 가려 안 보였다(2026-09-11).
 */
function PickCell({ image, selected, fit, caption, onToggle, onDelete }: {
  image: LibraryPickImage;
  selected: boolean;
  fit: "cover" | "contain";
  /** 그림 아래에 적을 말. 없으면 제목을 적는다. */
  caption?: string;
  onToggle(): void;
  onDelete?(): void;
}) {
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={`${caption ?? image.title ?? "참고 이미지"} ${selected ? "빼기" : "고르기"}`}
        className={cn(
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
              className={cn("h-full w-full", fit === "contain" ? "object-contain p-1" : "object-cover")}
            />
          ) : null}
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
          {caption ?? image.title ?? "제목 없음"}
        </span>
      </button>
      {/* 그림 자체는 고르기에 쓰이므로 확대는 따로 연다. */}
      <button
        type="button"
        aria-label={`${caption ?? image.title ?? "참고 이미지"} 크게 보기`}
        onClick={() => openImageViewer(image.url ?? "", caption ?? image.title ?? "참고 이미지")}
        className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-foreground"
      >
        <Maximize2 className="size-3.5" />
      </button>
      {onDelete ? (
        <button
          type="button"
          aria-label={`${image.title ?? "참고 이미지"} 라이브러리에서 지우기`}
          onClick={onDelete}
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-background/90 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
