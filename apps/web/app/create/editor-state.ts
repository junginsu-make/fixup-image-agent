import type { SectionBlueprint } from "@fixup/pdp-core";
import type { PdpEditorDraftState } from "./pdp-drafts";

/** 구성안의 섹션이 정본이다. 편집 배치·옵션은 섹션 식별자로 따라간다. */
export function editorForSections(editor: PdpEditorDraftState, sections: SectionBlueprint[]): PdpEditorDraftState {
  const oldKeys = new Map(editor.sections.map((section, index) => [section.section_id, editor.sectionKeys[index]]));
  const sectionKeys = sections.map((section) => oldKeys.get(section.section_id) ?? section.section_id);
  const selected = editor.sections[editor.currentSectionIndex]?.section_id;
  const selectedIndex = sections.findIndex((section) => section.section_id === selected);
  const keep = <T,>(record: Record<string, T>) => Object.fromEntries(sectionKeys.flatMap((key) => record[key] === undefined ? [] : [[key, record[key]]]));
  return { ...editor, sections, sectionKeys,
    currentSectionIndex: selectedIndex >= 0 ? selectedIndex : Math.max(0, Math.min(editor.currentSectionIndex, sections.length - 1)),
    overlaysBySection: keep(editor.overlaysBySection ?? {}), sectionOptions: keep(editor.sectionOptions ?? {}) };
}
