import type { PdpAppState, PdpDraftRecord, PdpEditorDraftState } from "./pdp-drafts";

/**
 * 화면 상태에서 초안에 담을 몸통을 만든다.
 *
 * **여기서 한 칸을 빠뜨리면 조용히 잃는다.** 초안을 저장하고 불러올 때만
 * 드러나고, 그때는 이미 다른 값이 화면에 있어서 무엇이 사라졌는지 보이지 않는다.
 *
 * 실제로 그렇게 겪었다 — 첨부 자리별 지시를 여기 안 담아서, 다른 작업을
 * 불러오면 **앞 제품에 대해 적은 말이 새 제품에 붙었다.** 그 제품의 보호 문구가
 * 여섯 줄 빠진 채로 그림이 나갔고, 편집기 화면에는 그 칸이 없어 사용자는
 * 무엇이 반영되는지 볼 수도 없었다.
 *
 * 그래서 화면 밖으로 뺐다. 값으로 재면 빠진 칸이 바로 드러난다.
 */
export type DraftInput = Omit<PdpDraftRecord, "id" | "createdAt" | "title" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
};

export type DraftInputState = Omit<DraftInput, "appState" | "notice" | "editorState"> & {
  /** 화면이 지금 어느 단계인가. 분석 중이면 저장은 업로드 단계로 되돌린다. */
  appState: PdpAppState;
  notice: string;
  editorDraftState: PdpEditorDraftState | null;
  /** 결과가 있는데 편집기 상태가 없으면 기본값을 만들어 담는다. */
  defaultEditorState: () => PdpEditorDraftState;
};

/**
 * 담을 것이 하나도 없으면 `null`.
 *
 * 빈 초안을 만들면 목록이 유령으로 찬다.
 */
export function buildDraftInput(state: DraftInputState, hasContent: boolean): DraftInput | null {
  if (!hasContent) return null;

  const { appState, notice, editorDraftState, defaultEditorState, ...rest } = state;

  return {
    // 받은 것을 먼저 펼친다. 하나씩 나열하면 새 칸이 늘 때 조용히 사라진다 —
    // 이 파일이 존재하는 이유가 그것이다.
    ...rest,
    /**
     * 지금 보고 있는 단계를 그대로 적는다.
     *
     * **`result` 가 있다고 무조건 `"editor"` 로 적으면 안 된다.** 시나리오를
     * 보던 중에도 결과는 이미 있으므로, 자동 저장이 도는 순간 그 단계가
     * 사라지고 되불렀을 때 편집기로 열렸다 — 시나리오 화면에만 있는 심사
     * 지적이 통째로 안 보였다.
     *
     * 되살릴 수 있는 단계는 `"scenario"` 와 `"editor"` 둘뿐이다. 그 밖이면
     * 결과가 있을 때만 편집기로 열고, 없으면 업로드로 되돌린다 — 분석 중에
     * 저장하면 되불렀을 때 「분석 중」에 갇히기 때문이다.
     */
    appState:
      appState === "scenario" || appState === "editor"
        ? appState
        : rest.result
          ? "editor"
          : "upload",
    notice: editorDraftState?.notice ?? notice,
    editorState: rest.result ? (editorDraftState ?? defaultEditorState()) : null,
  };
}
