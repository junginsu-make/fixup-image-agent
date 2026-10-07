import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOT_IMAGE_MESSAGE, imageFromTransfer, useImageDropTarget, usePreventFileNavigation,
} from "../image-drop";

/**
 * 그림을 **끌어다 놓기·붙여넣기**로 넣는다(2026-10-07 사용자 요청).
 *
 * 받는 형식은 「새 이미지 올리기」와 같다(PNG·JPG·WEBP).
 */

const png = new File(["a"], "a.png", { type: "image/png" });
const webp = new File(["b"], "b.webp", { type: "image/webp" });
const pdf = new File(["c"], "c.pdf", { type: "application/pdf" });

describe("imageFromTransfer — 옮겨 온 것 중 그림 한 장을 고른다", () => {
  it("그림 파일이면 그것", () => {
    expect(imageFromTransfer({ files: [png] })).toEqual({ file: png });
  });

  it("여럿이면 받을 수 있는 첫 장", () => {
    expect(imageFromTransfer({ files: [pdf, webp, png] })).toEqual({ file: webp });
  });

  it("파일 목록이 비면 항목에서 꺼낸다 — 캡처를 붙여넣을 때 이쪽으로만 오는 브라우저가 있다", () => {
    const items = [
      { kind: "string", getAsFile: () => null },
      { kind: "file", getAsFile: () => png },
    ];
    expect(imageFromTransfer({ files: [], items })).toEqual({ file: png });
  });

  it("그림이 아닌 파일만 있으면 왜 안 되는지 말한다", () => {
    expect(imageFromTransfer({ files: [pdf] })).toEqual({ error: NOT_IMAGE_MESSAGE });
  });

  it("파일이 없으면(글자만 붙여넣음) 아무 일도 아니다", () => {
    expect(imageFromTransfer({ files: [], items: [{ kind: "string", getAsFile: () => null }] })).toBeNull();
    expect(imageFromTransfer(null)).toBeNull();
  });
});

/* ── 칸에 거는 손잡이 ─────────────────────────────────────────── */

const onFile = vi.fn<(file: File) => void>();
const onError = vi.fn<(message: string) => void>();
let target: ReturnType<typeof useImageDropTarget>;

function Probe({ disabled }: { disabled: boolean }) {
  target = useImageDropTarget({ disabled, onFile, onError });
  return null;
}

function render(disabled = false) {
  act(() => { create(<Probe disabled={disabled} />); });
}

/** 칸과 그 안의 단추. 칸 밖은 라이브러리 창(포털)처럼 DOM 으로는 칸 바깥인 곳이다. */
const ZONE = { name: "zone" };
const CHILD = { name: "child" };
const PORTAL = { name: "portal" };
const zone = { contains: (node: unknown) => node === ZONE || node === CHILD };

function dragEvent(files: File[], options: { types?: string[]; at?: object } = {}) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { types: options.types ?? ["Files"], files, items: [], dropEffect: "none" },
    currentTarget: zone,
    target: options.at ?? ZONE,
  } as unknown as React.DragEvent<HTMLElement>;
}

function pasteEvent(files: File[], at: object = ZONE) {
  return {
    preventDefault: vi.fn(),
    currentTarget: zone,
    target: at,
    clipboardData: { files, items: [], types: files.length ? ["Files"] : ["text/plain"] },
  } as unknown as React.ClipboardEvent<HTMLElement>;
}

beforeEach(() => {
  onFile.mockReset();
  onError.mockReset();
});

describe("useImageDropTarget — 끌어다 놓기", () => {
  it("파일을 끌고 들어오면 칸을 강조하고, 밖으로 나가면 끈다", () => {
    render();
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    expect(target.over).toBe(true);
    act(() => target.handlers.onDragLeave(dragEvent([png])));
    expect(target.over).toBe(false);
  });

  /*
    칸 안의 단추로 옮겨 가면 「단추에 들어옴」이 먼저, 「칸에서 나감」이 뒤에 온다.
    어디로 나가는지(relatedTarget)를 비워 주는 브라우저가 있어 그것에 기대지 않고
    들어온 수와 나간 수를 센다.
  */
  it("칸 안의 단추로 옮겨 가는 것은 나간 것이 아니다", () => {
    render();
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    act(() => target.handlers.onDragEnter(dragEvent([png], { at: CHILD })));
    act(() => target.handlers.onDragLeave(dragEvent([png])));
    expect(target.over).toBe(true);
    act(() => target.handlers.onDragLeave(dragEvent([png], { at: CHILD })));
    expect(target.over).toBe(false);
  });

  it("글자를 끌어오면 강조하지 않고, 놓아도 막지 않는다", () => {
    render();
    act(() => target.handlers.onDragEnter(dragEvent([], { types: ["text/plain"] })));
    expect(target.over).toBe(false);
    const drop = dragEvent([], { types: ["text/plain"] });
    act(() => target.handlers.onDrop(drop));
    expect(drop.preventDefault).not.toHaveBeenCalled();
  });

  it("그림을 놓으면 그 그림을 넘기고 강조를 끈다", () => {
    render();
    const drop = dragEvent([png]);
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    act(() => target.handlers.onDrop(drop));
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(onFile).toHaveBeenCalledWith(png);
    expect(target.over).toBe(false);
  });

  it("놓은 뒤 다시 끌고 들어오면 처음처럼 센다", () => {
    render();
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    act(() => target.handlers.onDragEnter(dragEvent([png], { at: CHILD })));
    act(() => target.handlers.onDrop(dragEvent([png], { at: CHILD })));
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    act(() => target.handlers.onDragLeave(dragEvent([png])));
    expect(target.over).toBe(false);
  });

  it("그림이 아닌 파일을 놓으면 안내한다", () => {
    render();
    act(() => target.handlers.onDrop(dragEvent([pdf])));
    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(NOT_IMAGE_MESSAGE);
  });

  it("잠긴 칸은 강조도 받기도 안 한다 — 그래도 놓기는 막는다(안 막으면 브라우저가 그 파일을 열어 작업을 떠난다)", () => {
    render(true);
    const over = dragEvent([png]);
    const drop = dragEvent([png]);
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    expect(target.over).toBe(false);
    act(() => target.handlers.onDragOver(over));
    act(() => target.handlers.onDrop(drop));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(onFile).not.toHaveBeenCalled();
  });

  it("라이브러리 창(포털)에 놓은 것은 뒤의 칸이 받지 않는다", () => {
    render();
    const drop = dragEvent([png], { at: PORTAL });
    act(() => target.handlers.onDragEnter(dragEvent([png], { at: PORTAL })));
    expect(target.over).toBe(false);
    act(() => target.handlers.onDrop(drop));
    expect(onFile).not.toHaveBeenCalled();
  });
});

describe("useImageDropTarget — 붙여넣기", () => {
  it("그림을 붙여넣으면 그 그림을 넘긴다", () => {
    render();
    const paste = pasteEvent([png]);
    act(() => target.handlers.onPaste(paste));
    expect(paste.preventDefault).toHaveBeenCalled();
    expect(onFile).toHaveBeenCalledWith(png);
  });

  it("글자만 붙여넣으면 건드리지 않는다", () => {
    render();
    const paste = pasteEvent([]);
    act(() => target.handlers.onPaste(paste));
    expect(paste.preventDefault).not.toHaveBeenCalled();
    expect(onFile).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("잠긴 칸에는 붙여넣지 않는다", () => {
    render(true);
    act(() => target.handlers.onPaste(pasteEvent([png])));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("라이브러리 창이 열린 채 붙여넣으면 뒤의 칸이 받지 않는다", () => {
    render();
    const paste = pasteEvent([png], PORTAL);
    act(() => target.handlers.onPaste(paste));
    expect(onFile).not.toHaveBeenCalled();
    expect(paste.preventDefault).not.toHaveBeenCalled();
  });
});

/* ── 칸 밖에 놓았을 때 ────────────────────────────────────────── */

describe("usePreventFileNavigation — 칸 옆에 잘못 놓아도 페이지를 떠나지 않는다", () => {
  const listeners = new Map<string, (event: unknown) => void>();
  const fakeWindow = {
    addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => { listeners.set(type, listener); }),
    removeEventListener: vi.fn((type: string) => { listeners.delete(type); }),
  };

  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal("window", fakeWindow);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  function Guard() {
    usePreventFileNavigation();
    return null;
  }

  function nativeDrag(type: "dragover" | "drop", types: string[], handledByZone = false) {
    return {
      type, defaultPrevented: handledByZone, preventDefault: vi.fn(),
      dataTransfer: { types, dropEffect: handledByZone ? "copy" : "move" },
    };
  }

  it("칸이 이미 받은 놓기는 건드리지 않는다 — 덮으면 칸에 놓을 수 없게 된다", () => {
    act(() => { create(<Guard />); });
    const over = nativeDrag("dragover", ["Files"], true);
    listeners.get("dragover")!(over);
    expect(over.dataTransfer.dropEffect).toBe("copy");
    expect(over.preventDefault).not.toHaveBeenCalled();
  });

  it("파일을 끌어 놓으면 막고, 받지는 않는다", () => {
    let view!: ReturnType<typeof create>;
    act(() => { view = create(<Guard />); });
    const over = nativeDrag("dragover", ["Files"]);
    const drop = nativeDrag("drop", ["Files"]);
    listeners.get("dragover")!(over);
    listeners.get("drop")!(drop);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer.dropEffect).toBe("none");
    expect(drop.preventDefault).toHaveBeenCalled();
    act(() => view.unmount());
    expect(listeners.size).toBe(0);
  });

  it("글자를 끌어 놓는 것은 건드리지 않는다", () => {
    act(() => { create(<Guard />); });
    const drop = nativeDrag("drop", ["text/plain"]);
    listeners.get("drop")!(drop);
    expect(drop.preventDefault).not.toHaveBeenCalled();
  });
});
