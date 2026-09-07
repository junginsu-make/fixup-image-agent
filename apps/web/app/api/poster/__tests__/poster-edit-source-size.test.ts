import { describe, expect, it } from "vitest";
import { editSourceSize } from "../projects/[id]/edit/edit-source-size";

/**
 * 수정할 때 크기를 어디서 얻는가 (설계 §10 3-b 다섯 번째 파일).
 *
 * **`match-source` 로 만든 작업은 지금도 수정이 거절된다.** 이 규칙이 그것을
 * 고친다. 광고가 만든 고장이 아니라 이미 있던 고장이고, 3단계가 광고 경로
 * 전원을 `match-source` 로 보내므로 간판 기능의 기본 경로로 승격시킨다.
 */

const master = { width: 2048, height: 1072 };
const parent = { width: 1200, height: 628 };

describe("수정할 때 쓸 크기", () => {
  it("광고 마스터가 있으면 그것을 쓴다", () => {
    expect(editSourceSize("match-source", master, parent)).toEqual(master);
  });

  /**
   * **광고와 무관한 기존 사용자가 여기서 고쳐진다.** 수정의 원본은 부모 그림
   * 자체이므로 그 크기가 곧 만들 크기다.
   */
  it("마스터가 없으면 부모 그림의 크기를 쓴다", () => {
    expect(editSourceSize("match-source", undefined, parent)).toEqual(parent);
  });

  /** 옛 행에는 크기가 안 채워져 있다. 그때는 지금까지처럼 거절된다 — 후퇴가 없다. */
  it("부모 크기를 모르면 아무것도 주지 않는다", () => {
    expect(editSourceSize("match-source", undefined, { width: null, height: null })).toBeUndefined();
    expect(editSourceSize("match-source", undefined, { width: 1200, height: null })).toBeUndefined();
  });

  /**
   * **비율이 `match-source` 가 아니면 주면 안 된다.** 화면이 수정하면서 비율을
   * 바꿀 수 있는데(`ratioId ?? project.ratio`), 그때 크기를 실으면 사용자가 고른
   * 비율을 덮어쓴다.
   */
  it("다른 비율이면 주지 않는다 — 사용자가 고른 비율을 덮으면 안 된다", () => {
    expect(editSourceSize("1:1", master, parent)).toBeUndefined();
    expect(editSourceSize("16:9", undefined, parent)).toBeUndefined();
  });
});
