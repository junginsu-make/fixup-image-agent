import { describe, expect, it } from "vitest";
import {
  PROJECT_SCOPED_TABLES,
  normalizeProjectName,
  projectNameError,
  reorder,
  resolveCurrentProject,
} from "../projects";

describe("프로젝트 이름", () => {
  it("앞뒤 공백을 떼고 가운데를 하나로 줄인다", () => {
    expect(normalizeProjectName("  봄   신상  ")).toBe("봄 신상");
  });

  it("빈 이름을 막는다", () => {
    expect(projectNameError("   ")).toContain("적어 주세요");
  });

  it("너무 긴 이름을 막는다", () => {
    expect(projectNameError("가".repeat(61))).toContain("60자");
    expect(projectNameError("가".repeat(60))).toBeNull();
  });
});

describe("어디에 붙나", () => {
  it("세 표에만 붙인다", () => {
    // 참고 이미지·참고 세트·캐릭터는 분류하지 않는다. 그것들은 만드는 데
    // 쓰는 재료지 결과물이 아니라, 프로젝트로 나누면 재료를 못 찾는다.
    expect(PROJECT_SCOPED_TABLES).toEqual(["library_items", "sns_projects", "poster_projects"]);
  });

  it("자식 표에는 안 붙인다", () => {
    for (const child of ["sns_cards", "poster_images", "library_images"]) {
      expect(PROJECT_SCOPED_TABLES).not.toContain(child);
    }
  });
});

describe("지금 고른 프로젝트", () => {
  const available = [{ id: "p1" }, { id: "p2" }];

  it("목록에 있으면 그대로 쓴다", () => {
    expect(resolveCurrentProject("p2", available)).toBe("p2");
  });

  it("쿠키가 없으면 전체다", () => {
    expect(resolveCurrentProject(undefined, available)).toBeNull();
  });

  it("모르는 값이면 전체로 떨어진다", () => {
    // **이것이 이 함수가 있는 이유다.** 팀을 옮겼거나 프로젝트가 접힌 뒤에도
    // 쿠키는 남는데, 그대로 걸면 모든 화면이 텅 빈 채로 열린다. 화면에는 아무
    // 표시도 없으니 「작업물이 다 사라졌다」로 보인다.
    expect(resolveCurrentProject("접힌-것", available)).toBeNull();
  });

  it("고를 것이 하나도 없어도 안 터진다", () => {
    expect(resolveCurrentProject("p1", [])).toBeNull();
  });
});

describe("차례 바꾸기", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("위로 한 칸", () => {
    expect(reorder(items, "b", "up")).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("아래로 한 칸", () => {
    expect(reorder(items, "b", "down")).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("전체에 번호를 다시 매긴다", () => {
    // 두 줄만 바꿔치기하면 `position` 이 겹쳐 있을 때 순서가 안 바뀐 것처럼
    // 보인다. 그때 사용자는 버튼이 고장 났다고 여긴다.
    const plan = reorder(items, "c", "up");
    expect(plan.map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it("맨 위에서 더 올리면 그대로 둔다", () => {
    // 되감겨서 맨 아래로 가면 놀란다.
    expect(reorder(items, "a", "up")).toEqual([]);
  });

  it("맨 아래에서 더 내리면 그대로 둔다", () => {
    expect(reorder(items, "c", "down")).toEqual([]);
  });

  it("없는 것을 옮기라 하면 아무것도 안 한다", () => {
    expect(reorder(items, "없음", "up")).toEqual([]);
  });
});
