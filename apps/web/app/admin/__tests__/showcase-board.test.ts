import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { keyboardTarget, moveItem, orderChanged, orderOf } from "../showcase-board";

/**
 * 첫 화면 갤러리 판 (2026-09-14).
 *
 * 전에는 줄마다 서버 액션 폼이 넷이었다. 서버 액션은 끝나면 `/admin` 으로
 * 되돌려 보내므로 **한 칸 옮길 때마다 관리자 페이지가 통째로 다시 그려졌다.**
 *
 * jsdom 이 없어 끌어 보는 시험은 못 쓴다. 어디로 가는가는 계산이라 그것만
 * 떼어 시험하고, 화면에 걸렸는지는 파일을 글자로 읽어 확인한다.
 */

const WEB = process.cwd();
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

const panel = read("app/admin/showcase-panel.tsx");
const page = read("app/admin/page.tsx");
const route = read("app/api/showcase/manage/route.ts");
const store = read("app/api/showcase/store.ts");

const list = ["a", "b", "c", "d", "e"];

describe("칸 옮기기", () => {
  it("앞으로 옮긴다", () => {
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c", "e"]);
  });

  it("뒤로 옮긴다", () => {
    expect(moveItem(list, 1, 3)).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("맨 앞과 맨 뒤로도 옮긴다", () => {
    expect(moveItem(list, 4, 0)).toEqual(["e", "a", "b", "c", "d"]);
    expect(moveItem(list, 0, 4)).toEqual(["b", "c", "d", "e", "a"]);
  });

  /** 원본을 건드리면 요청이 실패했을 때 되돌릴 것이 없다. */
  it("원본을 바꾸지 않는다", () => {
    const before = [...list];
    moveItem(list, 0, 4);
    expect(list).toEqual(before);
  });

  it("제자리에 놓으면 그대로다", () => {
    expect(moveItem(list, 2, 2)).toEqual(list);
  });

  /** 끌다가 판 밖에서 놓으면 이런 값이 온다. */
  it("범위를 벗어나면 그대로 돌려준다", () => {
    for (const [from, to] of [[-1, 2], [9, 2], [2, -1], [2, 9]]) {
      expect(moveItem(list, from!, to!)).toEqual(list);
    }
  });

  /** 어느 것도 잃지 않는다. 하나라도 사라지면 첫 화면에서 그림이 빠진다. */
  it("옮겨도 묶음이 그대로다", () => {
    for (let from = 0; from < list.length; from += 1) {
      for (let to = 0; to < list.length; to += 1) {
        expect([...moveItem(list, from, to)].sort()).toEqual([...list].sort());
      }
    }
  });
});

describe("바뀌었나", () => {
  it("같으면 안 바뀐 것이다", () => {
    expect(orderChanged(list, [...list])).toBe(false);
  });

  it("자리가 다르면 바뀐 것이다", () => {
    expect(orderChanged(list, moveItem(list, 0, 1))).toBe(true);
  });

  it("개수가 다르면 바뀐 것이다", () => {
    expect(orderChanged(list, list.slice(1))).toBe(true);
  });

  it("차례를 id 로 뽑는다", () => {
    expect(orderOf([{ id: "x" }, { id: "y" }] as never)).toEqual(["x", "y"]);
  });
});

describe("키보드로 옮기기", () => {
  /** 끌기만 두면 마우스를 못 쓰는 사람에게 이 화면은 읽기 전용이 된다. */
  it("방향키로 한 칸씩 움직인다", () => {
    expect(keyboardTarget(2, "ArrowLeft", 5)).toBe(1);
    expect(keyboardTarget(2, "ArrowRight", 5)).toBe(3);
    expect(keyboardTarget(2, "ArrowUp", 5)).toBe(1);
    expect(keyboardTarget(2, "ArrowDown", 5)).toBe(3);
  });

  /** 끝에서 반대쪽으로 감기면 어디로 갔는지 알 수 없다. */
  it("끝에 닿으면 그대로다", () => {
    expect(keyboardTarget(0, "ArrowLeft", 5)).toBe(0);
    expect(keyboardTarget(4, "ArrowRight", 5)).toBe(4);
  });

  it("다른 키는 아무 일도 안 한다", () => {
    for (const key of ["Enter", "a", " ", "Escape", "Tab"]) {
      expect(keyboardTarget(2, key, 5)).toBe(2);
    }
  });
});

describe("화면에 실제로 걸려 있다", () => {
  /**
   * **되돌려 보내면 안 된다.** 서버 액션은 끝나면 `/admin` 으로 보내므로
   * 관리자 페이지가 통째로 다시 그려진다. 그것을 없애려고 새로 짠 판이다.
   */
  it("판이 서버 액션을 안 쓴다", () => {
    expect(panel).not.toContain("moveShowcase");
    expect(panel).not.toContain("removeShowcase");
    expect(panel).not.toContain("updateShowcase");
    expect(panel).toContain('fetch("/api/showcase/manage"');
  });

  it("관리자 페이지가 옛 액션을 더 안 부른다", () => {
    for (const dead of ["moveShowcase", "removeShowcase", "updateShowcase"]) {
      expect(page, `${dead} 가 남아 있다`).not.toContain(dead);
    }
  });

  /** 운영자 요청: 설명·종류 칸을 뺀다. 자리의 절반을 먹고 있었다. */
  it("설명과 종류 입력칸이 없다", () => {
    expect(panel).not.toContain('name="caption"');
    expect(panel).not.toContain('name="kindLabel"');
    expect(panel).not.toContain("문구 저장");
  });

  /** 끌어 옮기기와 키보드 둘 다 있어야 한다. */
  it("끌기와 키보드를 모두 받는다", () => {
    expect(panel).toContain("draggable");
    expect(panel).toContain("onDrop");
    expect(panel).toContain("onKeyDown");
    expect(panel).toContain("keyboardTarget(");
  });

  /**
   * 실패하면 되돌려야 한다. 안 되돌리면 화면은 옮겨진 채인데 서버는 그대로라,
   * 새로고침하면 갑자기 제자리로 돌아간다.
   */
  it("실패하면 되돌린다", () => {
    expect(panel.split("setItems(before)").length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe("차례를 한 번에 적는다", () => {
  /** 한 칸 이동을 여러 번 부르면 중간에 실패했을 때 절반만 옮겨진 채 남는다. */
  it("목록 전체를 받는 문이 있다", () => {
    expect(route).toContain("export async function PUT");
    expect(route).toContain("ShowcaseReorderSchema");
    expect(route).toContain("reorderShowcase(order)");
  });

  /**
   * **묶음이 같은지 먼저 본다.** 화면이 낡은 목록을 들고 있는 사이 다른 창에서
   * 하나를 지웠다면, 그대로 적으면 지워진 것을 되살리거나 남은 것을 빠뜨린다.
   */
  it("보낸 묶음과 지금 묶음이 같은지 본다", () => {
    const at = store.indexOf("export async function reorderShowcase(");
    expect(at).toBeGreaterThan(0);
    const body = store.slice(at, store.indexOf("\nexport ", at + 10));
    expect(body).toContain("같은 항목이 두 번");
    expect(body).toContain("그사이 바뀌었습니다");
  });

  /** 200줄에서 하나를 옮기면 실제로 바뀌는 것은 몇 줄뿐이다. */
  it("값이 그대로인 줄은 건너뛴다", () => {
    const at = store.indexOf("export async function reorderShowcase(");
    const body = store.slice(at, store.indexOf("\nexport ", at + 10));
    expect(body).toContain("if (item.position === next) continue;");
  });
});
