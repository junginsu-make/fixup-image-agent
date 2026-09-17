/** 저장 응답은 요청 당시 버전만 확인한다. 그 사이의 수정은 남겨 둔다. */
export class DraftSaveClock {
  revision = 0;
  private savedRevision = 0;
  get dirty() { return this.revision !== this.savedRevision; }
  changed() { return ++this.revision; }
  acknowledge(revision: number) { this.savedRevision = Math.max(this.savedRevision, Math.min(revision, this.revision)); }
}

/** 콜백 변경과 타이머 수명을 분리해 연속 입력 중에도 checkpoint가 돈다. */
export function startDraftAutosave(writeLatest: () => void): () => void {
  const timer = setInterval(writeLatest, 30_000);
  return () => clearInterval(timer);
}
