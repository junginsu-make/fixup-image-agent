import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCEPT_ANY_IMAGE, ACCEPT_PNG_JPG_WEBP, ONE_ONLY_MESSAGE,
  imagesFromTransfer, useImageDropTarget, usePreventFileNavigation,
} from "../image-drop";

/**
 * **모든 그림 칸이 같은 방식으로 받는다**(2026-10-07 사용자 요청).
 * 파일 고르기·끌어다 놓기·칸을 누르고 Ctrl+V(⌘V)·여러 장.
 * 한 장만 받는 칸에 여러 장이 오면 첫 장만 넣고 알린다(사용자 결정).
 */

const png = new File(["a"], "a.png", { type: "image/png" });
const webp = new File(["b"], "b.webp", { type: "image/webp" });
const heic = new File(["h"], "h.heic", { type: "image/heic" });
const pdf = new File(["c"], "c.pdf", { type: "application/pdf" });

describe("imagesFromTransfer — 옮겨 온 것 중 받을 그림", () => {
  const 여러장 = { multiple: true, accept: ACCEPT_PNG_JPG_WEBP };
  const 한장 = { multiple: false, accept: ACCEPT_PNG_JPG_WEBP };

  it("여러 장 칸은 받을 수 있는 것을 전부", () => {
    expect(imagesFromTransfer({ files: [png, webp] }, 여러장)).toEqual({ files: [png, webp] });
  });

  it("여러 장 칸에서 받지 않는 형식은 빼고, 뺀 것을 말한다", () => {
    expect(imagesFromTransfer({ files: [png, pdf, heic] }, 여러장))
      .toEqual({ files: [png], notice: "받지 않는 형식의 파일 2개는 뺐습니다." });
  });

  it("한 장 칸에 여러 장이 오면 첫 장만 넣고 알린다", () => {
    expect(imagesFromTransfer({ files: [png, webp] }, 한장)).toEqual({ files: [png], notice: ONE_ONLY_MESSAGE });
  });

  it("한 장 칸에 한 장이면 아무 말도 안 한다", () => {
    expect(imagesFromTransfer({ files: [png] }, 한장)).toEqual({ files: [png] });
  });

  it("칸이 받는 형식만 받는다 — 그림 전부를 받는 칸은 HEIC 도 받는다", () => {
    expect(imagesFromTransfer({ files: [heic] }, 한장)).toEqual({ error: ACCEPT_PNG_JPG_WEBP.message });
    expect(imagesFromTransfer({ files: [heic] }, { multiple: false, accept: ACCEPT_ANY_IMAGE })).toEqual({ files: [heic] });
  });

  it("파일 목록이 비면 항목에서 꺼낸다 — 캡처를 붙여넣을 때 이쪽으로만 오는 브라우저가 있다", () => {
    const items = [{ kind: "string", getAsFile: () => null }, { kind: "file", getAsFile: () => png }];
    expect(imagesFromTransfer({ files: [], items }, 한장)).toEqual({ files: [png] });
  });

  it("받을 수 있는 파일이 하나도 없으면 왜 안 되는지 말한다", () => {
    expect(imagesFromTransfer({ files: [pdf] }, 여러장)).toEqual({ error: ACCEPT_PNG_JPG_WEBP.message });
  });

  it("파일이 없으면(글자만 붙여넣음) 아무 일도 아니다", () => {
    expect(imagesFromTransfer({ files: [], items: [{ kind: "string", getAsFile: () => null }] }, 한장)).toBeNull();
    expect(imagesFromTransfer(null, 한장)).toBeNull();
  });
});

/* ── 칸에 거는 손잡이 ─────────────────────────────────────────── */

const onFiles = vi.fn<(files: File[], notice?: string) => void>();
const onMessage = vi.fn<(message: string) => void>();
let target: ReturnType<typeof useImageDropTarget>;

function Probe({ disabled, multiple = false }: { disabled: boolean; multiple?: boolean }) {
  target = useImageDropTarget({ disabled, multiple, onFiles, onMessage });
  return null;
}

let view: ReturnType<typeof create> | null = null;
function render(disabled = false, multiple = false) {
  act(() => { view = create(<Probe disabled={disabled} multiple={multiple} />); });
}

const ZONE = { name: "zone" };
const CHILD = { name: "child" };
const PORTAL = { name: "portal" };
const zone = { contains: (node: unknown) => node === ZONE || node === CHILD || node === TEXT_FIELD };
/** 칸 안의 글상자(세트 이름 등). */
const TEXT_FIELD = { tagName: "INPUT", type: "text", isContentEditable: false };

function dragEvent(files: File[], options: { types?: string[]; at?: object } = {}) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { types: options.types ?? ["Files"], files, items: [], dropEffect: "none" },
    currentTarget: zone,
    target: options.at ?? ZONE,
  } as unknown as React.DragEvent<HTMLElement>;
}

function pasteEvent(files: File[], options: { at?: object; types?: string[] } = {}) {
  return {
    preventDefault: vi.fn(),
    currentTarget: zone,
    target: options.at ?? ZONE,
    clipboardData: { files, items: [], types: options.types ?? (files.length ? ["Files"] : ["text/plain"]) },
  } as unknown as React.ClipboardEvent<HTMLElement>;
}

const listeners = new Map<string, (event: unknown) => void>();
beforeEach(() => {
  onFiles.mockReset();
  onMessage.mockReset();
  listeners.clear();
  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: (event: unknown) => void) => { listeners.set(type, listener); },
    removeEventListener: (type: string) => { listeners.delete(type); },
  });
});
afterEach(() => {
  act(() => view?.unmount());
  view = null;
  vi.unstubAllGlobals();
});

describe("useImageDropTarget — 끌어다 놓기", () => {
  it("파일을 끌고 들어오면 칸을 강조하고, 밖으로 나가면 끈다", () => {
    render();
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    expect(target.over).toBe(true);
    act(() => target.handlers.onDragLeave(dragEvent([png])));
    expect(target.over).toBe(false);
  });

  it("칸 안의 단추로 옮겨 가는 것은 나간 것이 아니다", () => {
    render();
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    act(() => target.handlers.onDragEnter(dragEvent([png], { at: CHILD })));
    act(() => target.handlers.onDragLeave(dragEvent([png])));
    expect(target.over).toBe(true);
    act(() => target.handlers.onDragLeave(dragEvent([png], { at: CHILD })));
    expect(target.over).toBe(false);
  });

  it("놓으면 강조를 끄고, 다시 끌고 들어오면 처음부터 센다", () => {
    render();
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    act(() => target.handlers.onDragEnter(dragEvent([png], { at: CHILD })));
    act(() => target.handlers.onDrop(dragEvent([png], { at: CHILD })));
    expect(target.over).toBe(false);
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    act(() => target.handlers.onDragLeave(dragEvent([png])));
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

  it("여러 장 칸은 놓은 그림을 전부 넘긴다", () => {
    render(false, true);
    act(() => target.handlers.onDrop(dragEvent([png, webp])));
    expect(onFiles).toHaveBeenCalledWith([png, webp], undefined);
    expect(onMessage).not.toHaveBeenCalled();
  });

  /*
    알림은 **넣는 쪽에 함께 넘긴다.** 화면의 올리기가 시작·끝에 안내 칸을 다시
    쓰므로, 여기서 따로 띄우면 그 사이에 지워졌다(2026-10-07 리뷰).
  */
  it("한 장 칸은 첫 장만 넘기고, 알림은 넣는 쪽에 함께 넘긴다", () => {
    render();
    act(() => target.handlers.onDrop(dragEvent([png, webp])));
    expect(onFiles).toHaveBeenCalledWith([png], ONE_ONLY_MESSAGE);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("받을 수 있는 파일이 없으면 안내만 한다", () => {
    render();
    act(() => target.handlers.onDrop(dragEvent([pdf])));
    expect(onFiles).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith(ACCEPT_PNG_JPG_WEBP.message);
  });

  it("잠긴 칸은 강조도 받기도 안 한다 — 그래도 놓기는 막는다", () => {
    render(true);
    const over = dragEvent([png]);
    const drop = dragEvent([png]);
    act(() => target.handlers.onDragEnter(dragEvent([png])));
    expect(target.over).toBe(false);
    act(() => target.handlers.onDragOver(over));
    act(() => target.handlers.onDrop(drop));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("라이브러리 창(포털)에서 끌어도 뒤의 칸은 강조하지 않고, 놓아도 받지 않는다", () => {
    render();
    act(() => target.handlers.onDragEnter(dragEvent([png], { at: PORTAL })));
    expect(target.over).toBe(false);
    act(() => target.handlers.onDrop(dragEvent([png], { at: PORTAL })));
    expect(onFiles).not.toHaveBeenCalled();
  });
});

describe("useImageDropTarget — 붙여넣기", () => {
  it("그림을 붙여넣으면 넘긴다", () => {
    render(false, true);
    const paste = pasteEvent([png, webp]);
    act(() => target.handlers.onPaste(paste));
    expect(paste.preventDefault).toHaveBeenCalled();
    expect(onFiles).toHaveBeenCalledWith([png, webp], undefined);
  });

  it("글자만 붙여넣으면 건드리지 않는다", () => {
    render();
    const paste = pasteEvent([]);
    act(() => target.handlers.onPaste(paste));
    expect(paste.preventDefault).not.toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  /*
    칸 안의 글상자(세트 이름 등)에 글을 붙여넣는데 클립보드에 그림도 함께
    실려 있으면(엑셀 셀 복사 등) 글 대신 그림이 올라갔다(2026-10-07 리뷰).
  */
  it("칸 안의 글상자에 글이 함께 실린 붙여넣기는 글상자에 맡긴다", () => {
    render(false, true);
    const paste = pasteEvent([png], { at: TEXT_FIELD, types: ["text/plain", "Files"] });
    act(() => target.handlers.onPaste(paste));
    expect(paste.preventDefault).not.toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("글상자라도 그림만 붙여넣으면 받는다", () => {
    render(false, true);
    act(() => target.handlers.onPaste(pasteEvent([png], { at: TEXT_FIELD, types: ["Files"] })));
    expect(onFiles).toHaveBeenCalledWith([png], undefined);
  });

  it("잠긴 칸에는 붙여넣지 않는다", () => {
    render(true);
    const paste = pasteEvent([png]);
    act(() => target.handlers.onPaste(paste));
    expect(onFiles).not.toHaveBeenCalled();
    expect(paste.preventDefault).not.toHaveBeenCalled();
  });

  it("라이브러리 창(포털)에서 붙여넣으면 뒤의 칸이 받지 않는다", () => {
    render();
    const paste = pasteEvent([png], { at: PORTAL });
    act(() => target.handlers.onPaste(paste));
    expect(onFiles).not.toHaveBeenCalled();
    expect(paste.preventDefault).not.toHaveBeenCalled();
  });
});

describe("칸 밖에 놓기", () => {
  function nativeDrag(type: "dragover" | "drop", types: string[], handledByZone = false) {
    return {
      type, defaultPrevented: handledByZone, preventDefault: vi.fn(),
      dataTransfer: { types, dropEffect: handledByZone ? "copy" : "move" },
    };
  }

  it("칸을 쓰는 화면은 저절로 보호된다 — 칸 밖에 놓아도 페이지를 떠나지 않는다", () => {
    render();
    const drop = nativeDrag("drop", ["Files"]);
    listeners.get("drop")!(drop);
    expect(drop.preventDefault).toHaveBeenCalled();
  });

  it("칸이 이미 받은 놓기는 건드리지 않는다", () => {
    function Guard() { usePreventFileNavigation(); return null; }
    act(() => { view = create(<Guard />); });
    const over = nativeDrag("dragover", ["Files"], true);
    listeners.get("dragover")!(over);
    expect(over.dataTransfer.dropEffect).toBe("copy");
    expect(over.preventDefault).not.toHaveBeenCalled();
  });

  it("글자를 끌어 놓는 것은 건드리지 않는다", () => {
    render();
    const drop = nativeDrag("drop", ["text/plain"]);
    listeners.get("drop")!(drop);
    expect(drop.preventDefault).not.toHaveBeenCalled();
  });

  it("화면을 떠나면 보호 장치도 떼어 낸다", () => {
    render();
    expect(listeners.size).toBe(2);
    act(() => view?.unmount());
    view = null;
    expect(listeners.size).toBe(0);
  });
});
