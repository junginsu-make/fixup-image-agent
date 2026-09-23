"use client";
import { ArrowDown, ArrowUp, Info, Plus, Trash2, Undo2, UserRound, Wand2 } from "lucide-react";
import type {
  BlueprintReview,
  CopyGapOutcome,
  CopyTarget,
  ImageModelId,
  LandingPageBlueprint,
  PdpOutputMode,
  PersonSource,
  ProductBrief,
  ReferenceModelUsage,
  ProductReadingStatus,
  SectionBlueprint,
} from "@fixup/pdp-core";
import { MAX_PLANNED_SECTIONS, MAX_STRATEGY_LENGTH, applyUserEdit, identityConflictOf, validateEvidenceBinding } from "@fixup/pdp-core";
import { Badge, Button, Textarea, cn } from "@fixup/ui";
import { ModelPicker } from "./ModelPicker";
import { ReviewPanel } from "./ReviewPanel";
import { ProductReadingNotice } from "./ProductReadingNotice";
import { SectionPlanGaps } from "./SectionPlanGaps";
import { PersonSourceChoice } from "./PersonSourceChoice";
import { SectionAngleNote } from "./SectionAngleNote";
import { StyleReferenceCard, type StyleReferenceView } from "./StyleReferenceCard";
import { StyleReferenceAttach } from "./StyleReferenceAttach";
import { CharacterPicker } from "./CharacterPicker";
import { AttachmentIntentField } from "./AttachmentIntentField";
import type { AttachmentIntents } from "@fixup/pdp-core";
import { updateScenarioBullets } from "./scenario-evidence";
import { createSectionFor } from "./scenario-sections";
const quietFieldClass =
  "resize-y border-transparent bg-transparent px-2 shadow-none transition-colors hover:border-input hover:bg-background focus-visible:border-input focus-visible:bg-background";

interface ScenarioEditorProps {
  /** 글기반 경로에서만 온다. 사진 경로는 브리프 단계가 없다. */
  brief?: ProductBrief;
  /** 사진 경로에서 올린 인물 이미지. 여기서 뺄 수 있어야 한다. */
  referenceModelName?: string;
  /** 올린 사진을 어디에 쓰는가. 「누가 나오나요」가 범위를 정확히 말하려면 필요하다. */
  referenceModelUsage?: ReferenceModelUsage | null;
  onReferenceModelRemove?: () => void;
  blueprint: LandingPageBlueprint;
  review?: BlueprintReview;
  /**
   * 사진에서 제품을 충분히 읽었는가. **사진 경로에서만 온다** — 글 경로는
   * 사용자가 친 글이 곧 근거라 물을 것이 없다.
   */
  productReadingStatus?: ProductReadingStatus;
  /**
   * 서버가 빈자리 정책으로 **실제로 무엇을 했는지**. 화면의 현재 토글값을
   * 넘기면 안 된다 — 사용자는 결과를 본 뒤에도 그 값을 바꿀 수 있다.
   */
  gapOutcome?: CopyGapOutcome;
  styleReference?: StyleReferenceView;
  styleReferenceEnabled: boolean;
  onStyleReferenceToggle: (enabled: boolean) => void;
  onStyleReferenceAttached: (reference: StyleReferenceView) => void;
  preserveProduct: boolean;
  onPreserveProductChange: (preserve: boolean) => void;
  characterId?: string;
  /**
   * 고른 각도. 비어 있으면 자동 — 서버가 섹션 설명에 맞춰 한 장 고른다.
   *
   * `characterId` 와 **따로 흐른다.** 한 덩어리로 묶으면 캐릭터만 바꾸는 자리마다
   * 각도를 함께 신경 써야 한다.
   */
  characterAngles: string[];
  onCharacterChange: (id: string | undefined, angles: string[]) => void;
  /**
   * 인물 사진과 캐릭터를 **둘 다 골랐을 때** 누구를 쓸 것인가(U-04).
   * 없으면 고르는 칸을 안 띄운다.
   */
  personSource?: PersonSource;
  onPersonSourceChange?: (next: PersonSource) => void;
  /**
   * 첨부 자리마다 적은 「이 그림을 어떻게 쓸까요」.
   *
   * 이 화면에서도 레퍼런스와 캐릭터를 붙일 수 있다. 칸이 업로드 화면에만
   * 있으면 여기서 붙인 사람은 이 기능을 쓸 방법이 없다.
   */
  attachmentIntents: AttachmentIntents;
  onIntentChange: (slot: keyof AttachmentIntents, value: string) => void;
  outputMode: PdpOutputMode;
  imageModel: ImageModelId;
  isBusy: boolean;
  onChange: (blueprint: LandingPageBlueprint) => void;
  onModelChange: (model: ImageModelId) => void;
  onRegenerate: () => void;
  /**
   * **고친 전략으로 구성만 다시 짠다**(U-11).
   *
   * 전략 칸을 고치는 것은 요약 수정일 뿐 섹션을 바꾸지 않는다(설계 §4.2).
   * 없으면 버튼을 안 띄운다 — 글 경로는 아직 이 동작이 없다.
   */
  onReplanFromStrategy?: (strategy: string) => void;
  /** 다시 짜기 전 구성으로 되돌린다. 재기획 직후에만 온다. */
  onRestorePreviousPlan?: () => void | Promise<void>;
  onConfirm: () => void;
}


function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function EditableField({
  label,
  value,
  rows = 1,
  placeholder,
  emphasis = false,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  placeholder?: string;
  emphasis?: boolean;
  /** 서버가 막는 길이와 **같은 값**을 준다. 화면이 모르면 저장 때 400 이 난다. */
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-0.5">
      <span className="text-meta text-subtle-foreground">{label}</span>
      <Textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={cn(quietFieldClass, emphasis ? "text-base font-bold" : "text-sm")}
      />
    </label>
  );
}

function BulletList({
  bullets,
  onChange,
}: {
  bullets: string[];
  onChange: (bullets: string[]) => void;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-meta text-subtle-foreground">불릿</span>
      {bullets.map((bullet, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <Textarea
            rows={1}
            value={bullet}
            onChange={(event) =>
              onChange(bullets.map((item, position) => (position === index ? event.target.value : item)))
            }
            className={cn(quietFieldClass, "text-sm")}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`불릿 ${index + 1} 삭제`}
            onClick={() => onChange(bullets.filter((_, position) => position !== index))}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...bullets, ""])}>
        <Plus size={14} className="mr-1.5" />
        불릿 추가
      </Button>
    </div>
  );
}

function SectionCard({
  section,
  index,
  total,
  onPatch,
  onTargetChange,
  onBulletsChange,
  onMove,
  onRemove,
  characterId,
  characterAngles,
}: {
  section: SectionBlueprint;
  index: number;
  total: number;
  onPatch: (patch: Partial<SectionBlueprint>) => void;
  onTargetChange: (target: CopyTarget, value: string) => void;
  onBulletsChange: (bullets: string[]) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  /**
   * 캐릭터를 골랐는가. 안 골랐으면 각도 이야기를 할 것이 없다(U-05).
   *
   * **선택 프로퍼티로 두지 않는다.** 그러면 바깥에서 안 넘겨도 타입이 통과해,
   * 기능이 통째로 사라져도 컴파일러도 시험도 안 빨개진다.
   */
  characterId: string | undefined;
  /** 직접 고른 각도. 있으면 자동이 안 돈다. */
  characterAngles: string[];
}) {
  const counts = (section.evidence ?? []).reduce(
    (value, evidence) => {
      const binding = validateEvidenceBinding(section, evidence);
      if (binding === "stale") value.stale += 1;
      else if (evidence.kind === "sample") value.sample += 1;
      else if (evidence.kind === "ask") value.ask += 1;
      return value;
    },
    { sample: 0, ask: 0, stale: 0 },
  );
  return (
    <article className="rounded-lg bg-background p-4 shadow-[var(--shadow-ring)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">섹션 {index + 1}</Badge>
        <strong className="min-w-0 truncate text-sm">{section.section_name}</strong>
        {counts.sample ? <Badge variant="outline">예시 {counts.sample}</Badge> : null}
        {counts.ask ? <Badge variant="outline">질문 {counts.ask}</Badge> : null}
        {counts.stale ? <Badge variant="outline">수정 후 재확인 {counts.stale}</Badge> : null}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="위로" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="아래로"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`섹션 ${index + 1} 삭제`}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={total === 1}
            onClick={onRemove}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        <EditableField label="목표" value={section.goal} onChange={(goal) => onPatch({ goal })} />
        <EditableField
          label="헤드라인"
          emphasis
          rows={2}
          value={section.headline}
          onChange={(headline) => onTargetChange({ slot: "headline" }, headline)}
        />
        <EditableField
          label="서브헤드라인"
          value={section.subheadline}
          onChange={(subheadline) => onTargetChange({ slot: "subheadline" }, subheadline)}
        />
        <BulletList bullets={section.bullets} onChange={onBulletsChange} />
        {/*
          **신뢰문구는 그림에 그리지 않는다**(2026-09-23 사용자: 완성본 밑에 설명
          한 줄이 박혀 나왔다). 편집 화면의 「카피」 목록에는 나오므로, 원하면
          글자로 얹을 수 있다(`copy-slots.ts`). 칸에 그렇게 적어 둔다 — 적은 것이
          그림에 나올 줄 알고 기다리게 두지 않는다.
        */}
        <EditableField
          label="신뢰·반론 문구 (이미지에는 넣지 않음)"
          placeholder="구매를 망설이게 하는 점을 덮는 한 줄. 편집 화면의 카피 목록에서 글자로 얹을 수 있습니다."
          value={section.trust_or_objection_line}
          onChange={(line) => onTargetChange({ slot: "trust_or_objection_line" }, line)}
        />
        {/*
          CTA 칸은 두지 않는다. 두 모드 모두 CTA 를 만들지 않고(pdp.service.ts / pdp.text-plan.ts),
          편집기에 얹는 길도 없다 — 채울 수 있는데 쓰이지 않는 칸은 거짓말이다.
          실제 구매 버튼은 쇼핑몰이 붙인다(사용자 결정 2026-07-30).
        */}
        <EditableField
          label="이미지 방향"
          rows={2}
          placeholder="어떤 장면을 만들지 한국어로 적어주세요."
          value={section.prompt_ko}
          onChange={(prompt_ko) => onTargetChange({ slot: "prompt_ko" }, prompt_ko)}
        />
        {/*
          **자동이 읽는 칸을 화면에 낸다**(U-05, 설계 §9.3).

          각도 자동은 `layout_notes` 를 본다. 그런데 이 칸이 화면에 없어서,
          사용자가 바로 위 「이미지 방향」에 「뒷모습」을 적고도 각도가 안 바뀌는
          것을 이해할 수 없었다 — 쪽지가 막겠다던 그 헛수고를 쪽지가 만들었다.
        */}
        <EditableField
          label="레이아웃 메모 (각도 자동이 읽는 칸)"
          placeholder="예: 인물이 뒷모습으로 걸어가고 왼쪽에 여백"
          value={section.layout_notes ?? ""}
          onChange={(layout_notes) => onPatch({ layout_notes })}
        />

        <SectionAngleNote
          layoutNotes={section.layout_notes}
          characterId={characterId}
          pickedAngles={characterAngles}
        />
      </div>
    </article>
  );
}

export function ScenarioEditor({
  brief,
  referenceModelName,
  referenceModelUsage,
  onReferenceModelRemove,
  blueprint,
  review,
  productReadingStatus,
  gapOutcome,
  styleReference,
  styleReferenceEnabled,
  onStyleReferenceToggle,
  onStyleReferenceAttached,
  preserveProduct,
  onPreserveProductChange,
  characterId,
  characterAngles,
  onCharacterChange,
  personSource,
  onPersonSourceChange,
  attachmentIntents,
  onIntentChange,
  outputMode,
  imageModel,
  isBusy,
  onChange,
  onModelChange,
  onRegenerate,
  onReplanFromStrategy,
  onRestorePreviousPlan,
  onConfirm,
}: ScenarioEditorProps) {
  const patchSection = (index: number, patch: Partial<SectionBlueprint>) => {
    onChange({
      ...blueprint,
      sections: blueprint.sections.map((section, position) =>
        position === index ? { ...section, ...patch } : section,
      ),
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    onChange({ ...blueprint, sections: moveItem(blueprint.sections, index, index + direction) });
  };

  const removeSection = (index: number) => {
    onChange({ ...blueprint, sections: blueprint.sections.filter((_, position) => position !== index) });
  };

  /*
    **화면도 서버와 같은 상한을 쓴다**(설계 §9.1).

    서버는 상한을 넘은 구성안을 자른다(`clampSections`). 화면이 그것을 모르면
    사용자는 열한 번째 섹션을 만들어 문구까지 채운 뒤, 다시 기획할 때 그것이
    사라지는 것을 본다.
  */
  // 업로드 화면에서 적은 제품 지시. 여기 칸은 없지만 지시는 살아 있다(U-18).
  const anchorConflict = identityConflictOf(attachmentIntents.anchor, "anchor");
  const canAddSection = blueprint.sections.length < MAX_PLANNED_SECTIONS;
  const addSection = () => {
    if (!canAddSection) return;
    // 공용 디자인을 **직접** 물려준다. 형제를 베끼면 그 형제가 고쳐질 때 끊긴다.
    onChange({
      ...blueprint,
      sections: [...blueprint.sections, createSectionFor(blueprint.sections, blueprint.designSystem)],
    });
  };

  return (
    <fieldset disabled={isBusy} className="grid min-w-0 gap-4">
      <div className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <span className="text-meta text-subtle-foreground">2단계</span>
            <h2 className="text-h2">구성 시나리오를 확인해 주세요</h2>
          </div>
          <Badge variant="secondary" className="ml-auto">
            {blueprint.sections.length}개 섹션
          </Badge>
          <Button type="button" variant="outline" size="sm" onClick={onRegenerate}>
            설정 바꿔 다시 만들기
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {blueprint.sections.some((section) => section.generatedImage)
            ? "이미 만든 이미지가 있습니다. 구성안을 고쳐도 기존 이미지는 바뀌지 않으므로 해당 섹션을 다시 생성해 주세요."
            : "아직 이미지를 만들지 않았습니다. 여기서 고친 내용이 이후 이미지 생성에 반영됩니다."}
        </p>

        {/*
          **제품 지시의 충돌은 구성안에도 남는다**(U-18).

          그 칸은 업로드 화면에 있고 여기로 넘어오면 화면째 사라진다. 그런데
          **지시는 그대로 실려** 이미지 생성까지 간다 — 인물·레퍼런스는 여기에도
          칸이 있어 경고가 따라오는데 제품만 안 따라왔다.
        */}
        {anchorConflict ? (
          <p className="mb-4 rounded-md border border-warning/30 bg-warning/5 p-3.5 text-sm text-warning">
            {`제품 그림에 적으신 「${anchorConflict.matched}」 요청은 그림에 반영되지 않습니다. ${anchorConflict.message}`}
          </p>
        ) : null}

        <CharacterPicker
          selectedId={characterId}
          angles={characterAngles}
          onSelect={onCharacterChange}
        />

        {/*
          **둘 다 고르면 조용히 하나를 버리지 않는다**(U-04).

          얼굴을 둘 보내면 모델이 섞어 제3의 인물을 만든다. 그래서 하나만 쓰는데,
          전에는 서버가 말없이 골랐다 — 사용자는 이미지가 나온 뒤에야 안다.
        */}
        {onPersonSourceChange ? (
          <PersonSourceChoice
            uploadedName={referenceModelName}
            characterId={characterId}
            uploadedUsage={referenceModelUsage}
            value={personSource}
            onSelect={onPersonSourceChange}
          />
        ) : null}
        {characterId || referenceModelName ? (
          <div className="mb-4 mt-2">
            <AttachmentIntentField
              id="scenario-intent-person"
              value={attachmentIntents.person ?? ""}
              onChange={(next) => onIntentChange("person", next)}
              role="person"
              placeholder="예: 안경을 꼭 씌워 주세요"
            />
          </div>
        ) : null}

        {styleReference ? (
          <div className="mb-4">
            <StyleReferenceCard
              reference={styleReference}
              enabled={styleReferenceEnabled}
              onToggle={onStyleReferenceToggle}
              preserveProduct={preserveProduct}
              onPreserveProductChange={onPreserveProductChange}
            />
            {/* 추천이 마음에 안 들면 그 자리에서 바꾼다. */}
            <StyleReferenceAttach onAttached={onStyleReferenceAttached} />
            <div className="mt-2">
              <AttachmentIntentField
                id="scenario-intent-style"
                value={attachmentIntents.style ?? ""}
                onChange={(next) => onIntentChange("style", next)}
                role="style"
                placeholder="예: 색만 가져오고 배치는 무시해 주세요"
              />
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-dashed p-3.5 text-sm">
            <p className="font-bold">디자인 레퍼런스 없이 만듭니다</p>
            <p className="mt-1 text-muted-foreground">
              마음에 드는 상세페이지 이미지를 올려두면, 상품에 어울리는 것을 골라 그 색·서체를
              따라 만듭니다.{" "}
              올린 이미지는{" "}
              <a href="/settings" className="font-medium text-primary underline-offset-2 hover:underline">
                설정
              </a>
              에서도 관리할 수 있습니다.
            </p>
            <StyleReferenceAttach onAttached={onStyleReferenceAttached} />
          </div>
        )}

        {/* 사진 경로에서 올린 인물 이미지. 올린 화면은 이미 지났으므로 여기서 뺄 수 있어야 한다. */}
        {referenceModelName && onReferenceModelRemove ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border bg-background p-3.5 text-sm">
            <UserRound size={16} className="flex-none text-primary" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate">인물 이미지: {referenceModelName}</strong>
              <span className="text-muted-foreground">이 인물의 얼굴을 참조해 만듭니다.</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onReferenceModelRemove}
            >
              <Trash2 size={14} className="mr-1.5" />
              삭제
            </Button>
          </div>
        ) : null}

        {/* 심사보다 먼저 온다. 무엇을 보고 쓴 카피인지가 심사 결과보다 앞선 물음이다. */}
        <ProductReadingNotice status={productReadingStatus} gapOutcome={gapOutcome} />

        {/*
          장수 강제를 풀었으니(U-14) 모자란 구성도 통과한다. 무엇이 빠졌는지는
          따로 본다 — 서버가 준 값이 아니라 **지금 화면의 구성안**을 보므로,
          사용자가 고치면 저절로 사라진다.
        */}
        <SectionPlanGaps
          sections={blueprint.sections}
          designSystem={blueprint.designSystem}
          onSectionsChange={(sections) => onChange({ ...blueprint, sections })}
        />

        {review ? <ReviewPanel review={review} blueprint={blueprint} /> : null}

        {brief && brief.assumptions.length > 0 ? (
          <div className="mb-4 rounded-md border border-primary/25 bg-primary-soft/40 p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
              <Info size={14} className="text-primary" />
              입력에 없어서 AI가 채운 부분입니다
            </div>
            <ul className="grid gap-1 text-sm text-muted-foreground">
              {brief.assumptions.map((assumption) => (
                <li key={assumption}>· {assumption}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <EditableField
          label="전체 전략"
          rows={3}
          // 서버가 막는 길이와 같다. 넘으면 400 이 나고 구성 화면을 떠난다.
          maxLength={MAX_STRATEGY_LENGTH}
          value={blueprint.executiveSummary}
          onChange={(executiveSummary) => onChange({ ...blueprint, executiveSummary })}
        />

        {/*
          **전략을 고치는 것과 구성을 다시 짜는 것은 다른 일이다**(U-11).

          전에는 이 칸이 그냥 글상자였다. 고쳐도 섹션은 그대로인데 화면이 그
          사실을 말하지 않아, 사용자는 고친 전략이 반영된 줄 알고 이미지를
          만들었다 — 한 장에 값이 드는데 나온 그림은 옛 전략을 따른다.
        */}
        {/*
          **안내는 두 경로 모두 띄운다.** 단추는 사진 경로에만 있지만, 「전략만
          고치면 섹션은 그대로」라는 사실은 글 경로에서도 똑같이 참이다 — 그것을
          모르는 것이 U-11 이 고치려던 오해다.
        */}
        <div className="mt-2 grid justify-items-start gap-1.5">
          <p className="text-sm text-muted-foreground">
            {onReplanFromStrategy
              ? "전략만 고치면 아래 섹션은 그대로입니다. 고친 전략으로 구성을 다시 짜려면 눌러 주세요. 지금까지 고친 문구와 만든 이미지는 새 구성으로 바뀌고, 이전 구성은 저장된 작업에 보관됩니다."
              : "전략만 고치면 아래 섹션은 그대로입니다. 구성을 다시 짜려면 위의 「설정 바꿔 다시 만들기」로 돌아가 주세요."}
          </p>
          {onReplanFromStrategy ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!blueprint.executiveSummary.trim()}
                onClick={() => onReplanFromStrategy(blueprint.executiveSummary)}
              >
                이 전략으로 구성 다시 만들기
              </Button>
              {onRestorePreviousPlan ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void onRestorePreviousPlan()}>
                  <Undo2 size={14} className="mr-1.5" />
                  이전 구성으로 되돌리기
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        {blueprint.sections.map((section, index) => (
          <SectionCard
            key={section.section_id || index}
            section={section}
            index={index}
            total={blueprint.sections.length}
            onPatch={(patch) => patchSection(index, patch)}
            onTargetChange={(target, value) => onChange(applyUserEdit(blueprint, section.section_id, target, value))}
            onBulletsChange={(bullets) => onChange(updateScenarioBullets(blueprint, index, bullets))}
            onMove={(direction) => moveSection(index, direction)}
            onRemove={() => removeSection(index)}
            characterId={characterId}
            characterAngles={characterAngles}
          />
        ))}
      </div>

      <div className="grid justify-items-start gap-1">
        <Button variant="outline" onClick={addSection} disabled={!canAddSection}>
          <Plus size={16} className="mr-1.5" />
          섹션 추가
        </Button>
        {canAddSection ? null : (
          <p className="text-sm text-muted-foreground">
            한 페이지에 {MAX_PLANNED_SECTIONS}장까지 만들 수 있습니다.
          </p>
        )}
      </div>

      {/* 대표 이미지부터 이 모델로 만들므로 생성 시작 전에 고른다. */}
      <div className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
        <ModelPicker
          value={imageModel}
          sectionCount={blueprint.sections.length}
          disabled={isBusy}
          onChange={onModelChange}
        />
        <div className="mt-4 flex justify-end">
          <Button disabled={isBusy} onClick={onConfirm}>
            <Wand2 size={16} className="mr-1.5" />
            대표 이미지 만들기
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
