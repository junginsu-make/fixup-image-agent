"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button, Input } from "@fixup/ui";
import { CARD_RATIOS, IMAGE_MODELS } from "@fixup/sns-core";
import {
  DEFAULT_TEMPLATES,
  defaultTemplateForRole,
  estimateSlots,
  reorderSlot,
  validateTemplate,
  type CardTemplate,
  type LayoutSlot,
  type SlotKind,
} from "@fixup/layout-core";
import { SlotCanvas } from "./slot-canvas";
import { canvasSize } from "./fit-screen";
import { billableFetch } from "../../../lib/billable-fetch";
import { useFitScreen } from "./use-fit-screen";
import { SlotInspector } from "./slot-inspector";
import { LibraryPicker, LibraryUploadButton, useLibraryImages } from "./library-picker";
import { PreviewPanel, type PreviewCopy, type PreviewResult } from "./preview-panel";
import { DeckPanel } from "./deck-panel";
import { SideDrawer } from "./side-drawer";
import { PanelHandle } from "../../_components/panel-handle";
import { LayerList } from "./layer-list";
import { SLOT_LABEL, newSlot, removeSlot, replaceSlot } from "./slot-defaults";

/**
 * 칸을 먼저 정하고, 그 칸에만 AI 가 그림을 넣는다.
 *
 * 이 화면은 **틀을 만들고 고치는 곳**이다. 그림도 글도 여기서 만들지 않는다 —
 * 카드는 카드뉴스 작업이 만들고, 여기서 만든 틀을 거기서 불러다 쓴다.
 *
 * **한 화면에 다 들어가야 한다.** 칸을 옮기면서 레퍼런스를 대조하고 글씨를
 * 고치는 일이라, 스크롤 때문에 셋이 서로 안 보이면 일이 안 된다. 그래서 세
 * 칸으로 나누고 **각 칸이 자기 안에서만 스크롤**한다.
 *
 * 말은 둘로만 쓴다 — **틀**(카드 한 장)과 **세트**(표지·속지·엔딩 한 벌).
 * 「뼈대」·「템플릿」을 섞어 쓰면 같은 것을 세 이름으로 부르게 된다.
 */

const ROLES = [
  { id: "cover", label: "표지" },
  { id: "body", label: "속지" },
  { id: "ending", label: "엔딩" },
] as const;

type Role = (typeof ROLES)[number]["id"];

const EMPTY_COPY: PreviewCopy = {
  headline: "칸을 먼저 정하고 그 칸에만 AI 가 그림을 넣는다",
  body: "글은 우리가 직접 그린다. 장마다 글자 위치가 달라지지 않는다.",
  accent: "레이아웃 고정",
  footnote: "2026-09-03",
};

/**
 * 설정 칸의 선택 상자.
 *
 * **칸 폭을 넘지 않는다**(`w-full min-w-0`). 안 막으면 가장 긴 선택지(「인스타그램
 * 피드 4:5」) 폭으로 늘어나, 좁은 화면에서 왼쪽 열에 가로 스크롤이 생겼다
 * (1280×650 실측).
 */
const BAR_SELECT = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";

/**
 * 견적을 셀 때 쓰는 모델.
 *
 * **이 화면은 그림을 만들지 않는다.** 실제 모델은 카드뉴스 작업이 정한다.
 * 그런데도 「얼마 드는지」는 미리 보여 줘야 하므로 기본 모델로 셈한다 —
 * 여기서 고르게 하면 「여기서 고른 모델로 만들어지나」로 오해한다.
 */
const ESTIMATE_MODEL = IMAGE_MODELS.find((model) => model.isDefault)?.id ?? IMAGE_MODELS[0]!.id;
const ADD_KINDS: SlotKind[] = ["background", "image", "logo", "text"];

interface SavedTemplate extends CardTemplate {
  createdAt: string;
}

/** 이 안이면 같은 모양으로 본다. 1:1 과 4:5 는 이 밖이다. */
const SHAPE_TOLERANCE = 0.05;

/**
 * 레퍼런스의 **실제 모양**을 브라우저에서 잰다.
 *
 * 서버에 묻지 않는다 — 그림은 이미 화면에 떠 있고, `naturalWidth` 가 정확하다.
 * 이걸 위해 라우트에 sharp 를 들이면 읽기 하나가 그리기만큼 무거워진다.
 *
 * 못 재면 **아무 말도 안 한다.** 「모르겠다」를 경고로 띄우면 진짜 경고가 묻힌다.
 */
function measureShape(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : undefined);
    image.onerror = () => resolve(undefined);
    image.src = url;
  });
}

export function LayoutStudio() {
  /** 화면 한 장에 맞추려고 실제로 남은 자리를 잰다(`use-fit-screen.ts`). */
  const fit = useFitScreen();
  const [ratioId, setRatioId] = useState(CARD_RATIOS[0]!.id);
  const [role, setRole] = useState<Role>("cover");
  const [slots, setSlots] = useState<LayoutSlot[]>(defaultTemplateForRole("cover").slots);
  const [selected, setSelected] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [copy, setCopy] = useState<PreviewCopy>(EMPTY_COPY);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [analyzeId, setAnalyzeId] = useState<string | undefined>();
  /** 읽어낸 칸이 레퍼런스와 맞는지 눈으로 대 보는 그림. */
  const [compareId, setCompareId] = useState<string | undefined>();
  const [showCompare, setShowCompare] = useState(true);
  /**
   * 「칸 읽어내기」 **직전의 칸들.**
   *
   * 분석은 캔버스를 통째로 갈아 끼운다. 30분 짜 놓고 「이 레퍼런스는 어떻게
   * 나오나」 눌러 본 사람이 그걸로 끝나면 안 된다. 한 걸음만 되돌린다 —
   * 여러 걸음은 이 화면이 감당할 일이 아니고, 실제로 잃는 것은 이 한 번이다.
   */
  const [beforeAnalyze, setBeforeAnalyze] = useState<LayoutSlot[] | null>(null);
  const [saveName, setSaveName] = useState("");
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState<"preview" | "analyze" | "save" | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  /** 미리보기와 세트는 다 고친 뒤 한 번 쓰는 것이라 서랍에 넣는다. */
  const [drawer, setDrawer] = useState<"preview" | "deck" | null>(null);
  /**
   * 서랍을 **닫아 둔 사이에** 미리보기가 끝났는가.
   *
   * 한 장에 몇 십 초가 걸린다. 그 사이 덮개를 누르면 서랍이 닫히는데, 끝난
   * 줄 모른 채 그대로 있게 된다. 테두리 손잡이가 뛰어 알린다.
   */
  const [drawerAlert, setDrawerAlert] = useState(false);
  /** 끝난 그 순간에 서랍이 열려 있었는지. 상태는 시작할 때의 값이라 못 쓴다. */
  const drawerRef = useRef<"preview" | "deck" | null>(null);

  const ratio = CARD_RATIOS.find((entry) => entry.id === ratioId)!;
  const { images: libraryImages, add: addLibraryImage } = useLibraryImages();
  const compareUrl = libraryImages.find((entry) => entry.id === compareId)?.signedUrl ?? undefined;

  const issues = useMemo(
    () => validateTemplate({ id: "draft", name: saveName || "만드는 중", role, slots }),
    [role, saveName, slots],
  );
  const blocked = issues.some((issue) => issue.severity === "error");

  /** 이 비율에서 잘리는 칸. 만들고 나서 알면 돈은 이미 나갔다. */
  const cropping = useMemo(
    () => estimateSlots(slots, ratio.pixel, ESTIMATE_MODEL).filter((entry) => entry.cropped),
    [ratio.pixel, slots],
  );

  const reloadSaved = useCallback(async () => {
    // 서버가 HTML 오류 페이지를 주면 json() 이 던진다. 목록을 못 불러온 것뿐이라
    // 화면 전체를 세울 일이 아니다 — 기본 틀은 코드에 있어 그대로 쓸 수 있다.
    try {
      const response = await fetch("/api/sns/layout/templates", { cache: "no-store" });
      const payload = await response.json();
      if (payload.ok) setSaved(payload.saved as SavedTemplate[]);
      else setNotes([payload.message ?? "저장한 틀을 불러오지 못했습니다."]);
    } catch {
      setNotes(["저장한 틀을 불러오지 못했습니다. 기본 틀은 그대로 쓸 수 있습니다."]);
    }
  }, []);

  useEffect(() => { void reloadSaved(); }, [reloadSaved]);

  const allTemplates = useMemo(() => [...DEFAULT_TEMPLATES, ...saved], [saved]);

  function changeRole(next: Role) {
    setRole(next);
    setSlots(defaultTemplateForRole(next).slots);
    setSelected(null);
    setPreview(null);
  }

  useEffect(() => { drawerRef.current = drawer; }, [drawer]);

  async function runPreview() {
    setBusy("preview");
    setNotes([]);
    setDrawerAlert(false);
    try {
      const response = await fetch("/api/sns/layout/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ratio: ratioId, modelId: ESTIMATE_MODEL, slots, copy }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message ?? "미리보기를 만들지 못했습니다.");
      setPreview({ image: payload.image, warnings: payload.warnings, estimate: payload.estimate });
    } catch (error) {
      setNotes([error instanceof Error ? error.message : "미리보기를 만들지 못했습니다."]);
    } finally {
      setBusy(null);
      // 기다리는 사이에 닫았으면, 끝났다는 것을 손잡이가 알린다.
      if (drawerRef.current !== "preview") setDrawerAlert(true);
    }
  }

  /**
   * 레퍼런스와 카드의 **모양이 다르면** 말해 준다.
   *
   * 좌표가 0~1 비율이라 깨지지는 않는다. 다만 1:1 레퍼런스에서 읽어낸
   * 「정사각형 그림 칸」을 4:5 카드에 놓으면 그 칸은 더 이상 정사각형이
   * 아니다. 읽어낸 대로 나올 줄 알았던 사람이 만들고 나서 알면 늦다.
   */
  const referenceShapeNote = useCallback(async (imageId: string): Promise<string[]> => {
    const url = libraryImages.find((entry) => entry.id === imageId)?.signedUrl;
    if (!url) return [];
    const shape = await measureShape(url);
    if (shape === undefined) return [];
    const card = ratio.pixel.width / ratio.pixel.height;
    if (Math.abs(shape - card) / card <= SHAPE_TOLERANCE) return [];
    return [`레퍼런스와 카드(${ratioId})의 모양이 다릅니다. 칸 자리는 그대로지만 칸 모양이 달라집니다.`];
  }, [libraryImages, ratio.pixel.height, ratio.pixel.width, ratioId]);

  async function runAnalyze() {
    if (!analyzeId) return;
    setBusy("analyze");
    setNotes([]);
    try {
      /*
        **크레딧이 깎이는 요청이라 식별자가 필요하다.** 맨 `fetch` 로 부르면 서버가
        예약 전에 400 「요청 식별자가 올바르지 않습니다」로 막는다 — 운영에서 이
        버튼이 그래서 안 됐다(2026-09-17 사용자 보고). 로컬은 인증 우회가 검사보다
        먼저 지나가 안 드러난다. 캐릭터 화면이 2026-09-04 에 같은 사고를 냈다.
      */
      const response = await billableFetch("/api/sns/layout/analyze", {
        body: JSON.stringify({ referenceImageId: analyzeId }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message ?? "칸을 읽어내지 못했습니다.");
      // 초안이다. 그대로 쓰지 않는다 — 화면에서 고친 뒤 쓴다.
      if (payload.slots.length) {
        // 갈아 끼우기 **전에** 챙긴다. 뒤에 하면 이미 덮인 것을 챙기게 된다.
        setBeforeAnalyze(slots);
        setSlots(payload.slots as LayoutSlot[]);
        setSelected(null);
        setPreview(null);
        // 읽어낸 칸을 레퍼런스 위에 겹쳐 둔다. 안 그러면 「비슷하게 나왔나」를
        // 사람이 확인할 길이 없다.
        setCompareId(analyzeId);
        setShowCompare(true);
      }
      setNotes([...(payload.issues as string[]), ...(await referenceShapeNote(analyzeId))]);
    } catch (error) {
      setNotes([error instanceof Error ? error.message : "칸을 읽어내지 못했습니다."]);
    } finally {
      setBusy(null);
    }
  }

  async function saveTemplate() {
    setBusy("save");
    setNotes([]);
    try {
      const response = await fetch("/api/sns/layout/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), role, slots }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message ?? "틀을 저장하지 못했습니다.");
      setSaveName("");
      setNaming(false);
      setNotes([`「${payload.template.name}」 틀을 저장했습니다.`]);
      await reloadSaved();
    } catch (error) {
      setNotes([error instanceof Error ? error.message : "틀을 저장하지 못했습니다."]);
    } finally {
      setBusy(null);
    }
  }

  const alerts = [
    ...cropping.map((entry) => `${entry.slot}번 그림 칸은 ${ratioId} 에서 만들 수 있는 비율이 없어 가운데를 잘라 넣습니다.`),
    ...issues.map((issue) => `${issue.severity === "error" ? "막힘" : "살펴보기"} · ${issue.message}`),
    ...notes,
  ];

  return (
    /*
      **화면 한 장 안에서 끝낸다**(2026-09-17 사용자 요청). 열마다 자기 안에서만
      스크롤한다.

      높이를 어림값(`100vh - 9rem`)으로 두지 않고 **실제로 남은 자리를 잰다.**
      위에 놓인 것이 어림보다 두꺼워 아래로 넘쳤고, 레퍼런스의 「칸 읽어내기」
      버튼이 반만 보였다.
    */
    <div ref={fit.rootRef} className="flex min-w-0 flex-col gap-3" style={{ height: fit.rootHeight }}>
      {/*
        **네 열이 다 조금씩 줄어든다.** 고정 폭이면 줄어드는 곳이 레퍼런스 열
        하나뿐이라 그 칸만 손톱만 해졌다.

        **첫 열에는 바닥을 준다.** `auto` 로만 두면 좁은 화면에서 69px 까지
        짜부라져, 그 아래 설정 묶음이 세로로 327px 까지 늘어나고 카드 칸이 설
        자리가 사라졌다(1280×650 실측). 바닥 합(17+11+14+15rem)이 1280 폭 본문
        안에 들어가게 잡았다.

        **열 정의나 틈(`gap-3`)을 바꾸면 `fit-screen.ts` 의 `COLUMN_LAYOUTS`·
        `COLUMN_GAP_PX` 도 바꾼다.** 캔버스 가로 한계를 거기서 셈한다.

        **1280 보다 좁으면 세 열이다.** 네 열의 최소 폭 합이 그 본문에 안 들어가,
        레이어 목록과 칸 설정을 한 열에 위아래로 쌓는다(2026-09-17 독립 리뷰).

        **첫 열 폭은 캔버스 폭으로 못 박는다.** `max-content` 로 두었더니 격자가
        남는 폭을 가운데 두 열에 먼저 나눠 줘, 첫 열이 캔버스보다 27px 좁아져
        가로로 넘쳤다(1280×1024 실측). 캔버스 폭은 이미 나머지 세 열의 최소
        폭을 뺀 자리 안이라, 못 박아도 뒤 열들은 자기 최소 폭을 지킨다.
      */}
      <div
        className="grid min-h-0 min-w-0 flex-1 gap-3 lg:grid-cols-[var(--first-column)_minmax(13rem,18rem)_minmax(14rem,1fr)] xl:grid-cols-[var(--first-column)_minmax(11rem,15rem)_minmax(14rem,22rem)_minmax(15rem,1fr)]"
        style={{ "--first-column": `max(17rem, ${canvasSize(ratio.pixel, fit.canvasSpace).width}px)` } as CSSProperties}
      >
        <section ref={fit.columnRef} className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <SlotCanvas
            slots={slots}
            size={ratio.pixel}
            space={fit.canvasSpace}
            selected={selected}
            backdrop={showCompare ? (compareUrl ?? preview?.image) : preview?.image}
            onSelect={setSelected}
            onChange={(offset, slot) => setSlots((current) => replaceSlot(current, offset, slot))}
          />
          {/*
            캔버스 아래 묶음. **이 높이를 재서** 캔버스가 남은 자리에 맞게 줄어든다.
          */}
          <div ref={fit.belowRef} className="grid shrink-0 gap-2">
          <div className="flex flex-wrap gap-1">
            {ADD_KINDS.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // 길이를 갱신자 안에서 뽑는다. 밖에서 읽으면 이 렌더가 본 값이라
                  // 연달아 누를 때 방금 더한 칸이 아닌 것이 골라질 수 있다.
                  setSlots((current) => {
                    setSelected(current.length);
                    return [...current, newSlot(kind)];
                  });
                }}
              >
                + {SLOT_LABEL[kind]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {compareUrl ? (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={showCompare} onChange={(event) => setShowCompare(event.target.checked)} />
                레퍼런스 위에 겹쳐 보기
              </label>
            ) : null}
            {/* 읽어내기는 캔버스를 통째로 갈아 끼운다. 돌아갈 길을 그 자리에 둔다. */}
            {beforeAnalyze ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSlots(beforeAnalyze);
                  setBeforeAnalyze(null);
                  setSelected(null);
                  setPreview(null);
                  setShowCompare(false);
                  setNotes(["읽어내기 전으로 되돌렸습니다."]);
                }}
              >
                읽어내기 전으로 되돌리기
              </Button>
            ) : null}
          </div>

          {/*
            설정과 버튼을 캔버스 아래에 둔다.
            상단 띠로 빼면 화면 맨 위에 몇 개 안 되는 것이 늘어서고, 정작
            캔버스 아래는 비어 있었다. 고치는 대상 바로 밑이 제자리다.
          */}
          <div className="grid gap-2 rounded-lg border bg-card p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid min-w-0 gap-1">
                <span className="text-[11px] text-muted-foreground">자리</span>
                <select className={BAR_SELECT} value={role} onChange={(event) => changeRole(event.target.value as Role)}>
                  {ROLES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-[11px] text-muted-foreground">비율</span>
                <select className={BAR_SELECT} value={ratioId} onChange={(event) => { setRatioId(event.target.value); setPreview(null); }}>
                  {CARD_RATIOS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
              </label>
            </div>

            {naming ? (
              <div className="flex gap-2">
                <Input
                  className="h-9 flex-1"
                  autoFocus
                  placeholder="틀 이름"
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter" && saveName.trim() && !blocked) void saveTemplate(); }}
                />
                <Button type="button" size="sm" disabled={!saveName.trim() || blocked || busy === "save"} onClick={saveTemplate}>
                  저장
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>취소</Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSlots([{ kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" }]);
                    setSelected(null);
                    setPreview(null);
                  }}
                >
                  빈 카드에서
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setNaming(true)}>틀 저장</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setDrawer("preview")}>미리보기</Button>
                <Button className="flex-1" type="button" size="sm" onClick={() => setDrawer("deck")}>카드뉴스에 쓰기</Button>
              </div>
            )}
          </div>

          {alerts.length ? (
            <ul className="grid gap-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
              {alerts.map((alert) => <li key={alert}>{alert}</li>)}
            </ul>
          ) : null}
          </div>
        </section>

        {/*
          레이어 목록과 칸 설정. 네 열일 때는 `contents` 로 풀려 각자 한 열을 쓰고,
          세 열일 때는 한 열에 위아래로 쌓여 각자 안에서 스크롤한다.
        */}
        <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] xl:contents">
        <section className="min-h-0 overflow-y-auto">
          <LayerList
            slots={slots}
            selected={selected}
            onSelect={setSelected}
            onReorder={(from, to) => {
              setSlots((current) => reorderSlot(current, from, to));
              setSelected(to);
            }}
            onRemove={(offset) => {
              setSlots((current) => removeSlot(current, offset));
              setSelected(null);
            }}
          />
        </section>

        <section className="min-h-0 overflow-y-auto">
          {selected !== null && slots[selected] ? (
            <SlotInspector
              slot={slots[selected]!}
              offset={selected}
              onChange={(slot) => setSlots((current) => replaceSlot(current, selected, slot))}
              onRemove={() => {
                setSlots((current) => removeSlot(current, selected));
                setSelected(null);
              }}
            />
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              칸을 누르면 여기서 종류·자리·글씨를 고칩니다.
            </p>
          )}
        </section>
        </div>

        <section className="flex min-h-0 flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            {/* 제목은 짧게(2026-09-17 사용자 결정). 무엇을 하는지는 아래 버튼이 말한다. */}
            <h3 className="shrink-0 whitespace-nowrap font-semibold">레퍼런스</h3>
            <span className="text-xs text-muted-foreground">읽어낸 것은 초안입니다. 화면에서 고쳐 쓰세요.</span>
          </div>
          {/*
            좁은 폭(열이 쌓일 때)에는 높이를 재지 않아 격자가 끝없이 길어진다. 그림이
            수십 장이면 「칸 읽어내기」가 목록 맨 아래로 밀리므로 높이를 막아 둔다.
          */}
          <div className="min-h-0 flex-1 overflow-hidden max-lg:max-h-[60vh]">
            <LibraryPicker value={analyzeId} onPick={setAnalyzeId} size="card" images={libraryImages} />
          </div>
          <div className="flex shrink-0 gap-2">
            <LibraryUploadButton onUploaded={(image) => { addLibraryImage(image); setAnalyzeId(image.id); }} />
            <Button className="flex-1" type="button" disabled={!analyzeId || busy === "analyze"} onClick={runAnalyze}>
              {busy === "analyze" ? "읽는 중…" : "칸 읽어내기"}
            </Button>
          </div>
        </section>
      </div>

      {/* 테두리 손잡이. 서랍을 닫아 두어도 돌아올 길이 있어야 한다 —
          미리보기 한 장에 몇 십 초가 걸린다. */}
      {!drawer && (busy === "preview" || preview) ? (
        <PanelHandle
          onOpen={() => { setDrawer("preview"); setDrawerAlert(false); }}
          busy={busy === "preview"}
          alert={drawerAlert}
          label={busy === "preview" ? "미리보기 만드는 중" : drawerAlert ? "다 됐습니다 · 열기" : "미리보기 열기"}
        />
      ) : null}

      <SideDrawer
        open={drawer === "preview"} title="미리보기"
        busy={busy === "preview"}
        onClose={() => setDrawer(null)}
      >
        <PreviewPanel
          copy={copy}
          onCopyChange={setCopy}
          result={preview}
          busy={busy === "preview"}
          onPreview={runPreview}
        />
      </SideDrawer>

      {/* 원고는 두 쪽이 같은 것을 쓴다. 따로 두면 한 쪽만 고치고 왜 다르냐고 묻게 된다. */}
      <SideDrawer open={drawer === "deck"} title="카드뉴스에 쓰기" onClose={() => setDrawer(null)}>
        <DeckPanel
          ratioId={ratioId}
          modelId={ESTIMATE_MODEL}
          copy={copy}
          editing={slots}
          templates={allTemplates}
          onRatioChange={(next) => { setRatioId(next); setPreview(null); }}
        />
      </SideDrawer>
    </div>
  );
}
