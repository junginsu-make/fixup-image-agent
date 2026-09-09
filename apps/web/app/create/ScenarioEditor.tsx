"use client";
import { ArrowDown, ArrowUp, Info, Plus, Trash2, UserRound, Wand2 } from "lucide-react";
import type {
  BlueprintReview,
  CopyTarget,
  ImageModelId,
  LandingPageBlueprint,
  PdpOutputMode,
  ProductBrief,
  SectionBlueprint,
} from "@fixup/pdp-core";
import { applyUserEdit, validateEvidenceBinding } from "@fixup/pdp-core";
import { Badge, Button, Textarea, cn } from "@fixup/ui";
import { ModelPicker } from "./ModelPicker";
import { ReviewPanel } from "./ReviewPanel";
import { StyleReferenceCard, type StyleReferenceView } from "./StyleReferenceCard";
import { StyleReferenceAttach } from "./StyleReferenceAttach";
import { CharacterPicker } from "./CharacterPicker";
import { AttachmentIntentField } from "./AttachmentIntentField";
import type { AttachmentIntents } from "@fixup/pdp-core";
import { updateScenarioBullets } from "./scenario-evidence";
import { createEmptySection } from "./scenario-sections";
const quietFieldClass =
  "resize-y border-transparent bg-transparent px-2 shadow-none transition-colors hover:border-input hover:bg-background focus-visible:border-input focus-visible:bg-background";

interface ScenarioEditorProps {
  /** 글기반 경로에서만 온다. 사진 경로는 브리프 단계가 없다. */
  brief?: ProductBrief;
  /** 사진 경로에서 올린 인물 이미지. 여기서 뺄 수 있어야 한다. */
  referenceModelName?: string;
  onReferenceModelRemove?: () => void;
  blueprint: LandingPageBlueprint;
  review?: BlueprintReview;
  styleReference?: StyleReferenceView;
  styleReferenceEnabled: boolean;
  onStyleReferenceToggle: (enabled: boolean) => void;
  onStyleReferenceAttached: (reference: StyleReferenceView) => void;
  preserveProduct: boolean;
  onPreserveProductChange: (preserve: boolean) => void;
  characterId?: string;
  onCharacterChange: (id: string | undefined) => void;
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
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  placeholder?: string;
  emphasis?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-0.5">
      <span className="text-meta text-subtle-foreground">{label}</span>
      <Textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
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
}: {
  section: SectionBlueprint;
  index: number;
  total: number;
  onPatch: (patch: Partial<SectionBlueprint>) => void;
  onTargetChange: (target: CopyTarget, value: string) => void;
  onBulletsChange: (bullets: string[]) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
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
      </div>
    </article>
  );
}

export function ScenarioEditor({
  brief,
  referenceModelName,
  onReferenceModelRemove,
  blueprint,
  review,
  styleReference,
  styleReferenceEnabled,
  onStyleReferenceToggle,
  onStyleReferenceAttached,
  preserveProduct,
  onPreserveProductChange,
  characterId,
  onCharacterChange,
  attachmentIntents,
  onIntentChange,
  outputMode,
  imageModel,
  isBusy,
  onChange,
  onModelChange,
  onRegenerate,
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

  const addSection = () => {
    onChange({ ...blueprint, sections: [...blueprint.sections, createEmptySection(blueprint.sections.length)] });
  };

  return (
    <section className="grid gap-4">
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
          아직 이미지를 만들지 않았습니다. 여기서 고친 내용이 그대로 이미지에 반영됩니다.
        </p>

        <CharacterPicker selectedId={characterId} onSelect={onCharacterChange} />
        {characterId || referenceModelName ? (
          <div className="mb-4 mt-2">
            <AttachmentIntentField
              id="scenario-intent-person"
              value={attachmentIntents.person ?? ""}
              onChange={(next) => onIntentChange("person", next)}
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
            {/*
              구성안은 이미 만들어졌다. 여기서 바꾸면 구성은 앞 레퍼런스로 짜인
              채 이미지만 새 레퍼런스로 나간다. 안 밝히면 사용자는 왜 구성이
              안 바뀌는지 알 수 없다.
            */}
            <p className="mt-1 text-meta text-subtle-foreground">
              여기서 바꾸면 색·서체만 바뀝니다. 구성까지 맞추려면 처음 화면에서 붙이고 다시
              분석해야 합니다.
            </p>
            <div className="mt-2">
              <AttachmentIntentField
                id="scenario-intent-style"
                value={attachmentIntents.style ?? ""}
                onChange={(next) => onIntentChange("style", next)}
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
              <strong className="text-foreground">
                구성은 이미 짜였으므로, 여기서 붙인 레퍼런스는 이미지에만 반영됩니다.
              </strong>{" "}
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

        {review ? <ReviewPanel review={review} /> : null}

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
          value={blueprint.executiveSummary}
          onChange={(executiveSummary) => onChange({ ...blueprint, executiveSummary })}
        />
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
          />
        ))}
      </div>

      <Button variant="outline" className="justify-self-start" onClick={addSection}>
        <Plus size={16} className="mr-1.5" />
        섹션 추가
      </Button>

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
    </section>
  );
}
