"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SlotInspector } from "./slot-inspector";
import { LibraryPicker, LibraryUploadButton, useLibraryImages } from "./library-picker";
import { PreviewPanel, type PreviewCopy, type PreviewResult } from "./preview-panel";
import { DeckPanel } from "./deck-panel";
import { SideDrawer } from "./side-drawer";
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

const BAR_SELECT = "h-9 rounded-md border bg-background px-2 text-sm";

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

export function LayoutStudio() {
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
  const [saveName, setSaveName] = useState("");
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState<"preview" | "analyze" | "save" | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  /** 미리보기와 세트는 다 고친 뒤 한 번 쓰는 것이라 서랍에 넣는다. */
  const [drawer, setDrawer] = useState<"preview" | "deck" | null>(null);

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

  async function runPreview() {
    setBusy("preview");
    setNotes([]);
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
    }
  }

  async function runAnalyze() {
    if (!analyzeId) return;
    setBusy("analyze");
    setNotes([]);
    try {
      const response = await fetch("/api/sns/layout/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referenceImageId: analyzeId }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message ?? "칸을 읽어내지 못했습니다.");
      // 초안이다. 그대로 쓰지 않는다 — 화면에서 고친 뒤 쓴다.
      if (payload.slots.length) {
        setSlots(payload.slots as LayoutSlot[]);
        setSelected(null);
        setPreview(null);
        // 읽어낸 칸을 레퍼런스 위에 겹쳐 둔다. 안 그러면 「비슷하게 나왔나」를
        // 사람이 확인할 길이 없다.
        setCompareId(analyzeId);
        setShowCompare(true);
      }
      setNotes(payload.issues as string[]);
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
    /* 화면 높이 안에서 끝낸다. 열마다 자기 안에서만 스크롤한다. */
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[auto_15rem_22rem_1fr]">
        <section className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <SlotCanvas
            slots={slots}
            size={ratio.pixel}
            selected={selected}
            backdrop={showCompare ? (compareUrl ?? preview?.image) : preview?.image}
            onSelect={setSelected}
            onChange={(offset, slot) => setSlots((current) => replaceSlot(current, offset, slot))}
          />
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
          {compareUrl ? (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={showCompare} onChange={(event) => setShowCompare(event.target.checked)} />
              레퍼런스 위에 겹쳐 보기
            </label>
          ) : null}

          {/*
            설정과 버튼을 캔버스 아래에 둔다.
            상단 띠로 빼면 화면 맨 위에 몇 개 안 되는 것이 늘어서고, 정작
            캔버스 아래는 비어 있었다. 고치는 대상 바로 밑이 제자리다.
          */}
          <div className="grid gap-2 rounded-lg border bg-card p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">자리</span>
                <select className={BAR_SELECT} value={role} onChange={(event) => changeRole(event.target.value as Role)}>
                  {ROLES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
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
        </section>

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

        <section className="flex min-h-0 flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">레퍼런스에서 칸 읽어내기</h3>
            <span className="text-xs text-muted-foreground">읽어낸 것은 초안입니다. 화면에서 고쳐 쓰세요.</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
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

      <SideDrawer open={drawer === "preview"} title="미리보기" onClose={() => setDrawer(null)}>
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
