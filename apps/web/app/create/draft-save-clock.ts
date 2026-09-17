/** 저장 응답은 요청 당시 버전만 확인한다. 그 사이의 수정은 남겨 둔다. */
export class DraftSaveClock {
  revision = 0;
  private savedRevision = 0;
  private values: readonly unknown[] = [];
  get dirty() { return this.revision !== this.savedRevision; }
  changed() { return ++this.revision; }
  acknowledge(revision: number) { this.savedRevision = Math.max(this.savedRevision, Math.min(revision, this.revision)); }
  observe(values: readonly unknown[]) {
    if (values.length !== this.values.length || values.some((value, index) => value !== this.values[index])) {
      this.values = values; this.changed();
    }
    return this.revision;
  }
}

/** 새 입력 필드도 자동 포함한다. 저장 식별자·표시 알림은 문서 수정이 아니다. */
export function draftChangeValues(input: object): unknown[] {
  const skip = new Set(["id", "createdAt", "updatedAt", "title", "notice"]);
  return Object.entries(input).filter(([key]) => !skip.has(key)).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, value]) => {
    if (key === "editorState" && value && typeof value === "object") return [key, ...draftChangeValues(value)];
    return [key, value];
  });
}

/** 콜백 변경과 타이머 수명을 분리해 연속 입력 중에도 checkpoint가 돈다. */
export function startDraftAutosave(writeLatest: () => void): () => void {
  const timer = setInterval(writeLatest, 30_000);
  return () => clearInterval(timer);
}
