"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";

/**
 * **모든 그림 칸이 같은 방식으로 받는다**(2026-10-07 사용자 요청).
 *
 * 파일 고르기 말고도 끌어다 놓기, 칸을 누르고 Ctrl+V(Mac 은 ⌘V), 여러 장을
 * 한꺼번에. 전에는 화면마다 달랐다 — 상세페이지만 끌어다 놓기가 됐고, 붙여넣기는
 * 아무 곳도 안 됐다.
 *
 * 화면이 여럿이라 붙여넣기는 **누른 칸**으로 간다. 칸을 한 번 눌러 두면 붙여넣기가
 * 그 칸에서 일어나 여기 손잡이까지 올라온다. 받은 그림은 그 칸의 「올리기」와 같은
 * 길로 넣는다 — 저장·크기 제한이 따로 갈라지지 않게 하려는 것이다.
 *
 * 처음에는 캐릭터 화면에만 있었다(`characters/image-drop.ts`, PR #271). 그것을
 * 여기로 옮겨 넓혔다.
 */

/** 칸이 받는 형식과, 안 맞을 때 할 말. 칸마다 지금의 `accept` 를 그대로 옮긴다. */
export interface AcceptRule {
  accepts(file: File): boolean;
  message: string;
}

const PNG_JPG_WEBP = new Set(["image/png", "image/jpeg", "image/webp"]);

/** 참고 이미지 창고가 받는 셋. 대부분의 칸이 이것이다. */
export const ACCEPT_PNG_JPG_WEBP: AcceptRule = {
  accepts: (file) => PNG_JPG_WEBP.has(file.type),
  message: "PNG·JPG·WEBP 그림만 넣을 수 있습니다.",
};

/** `accept="image/*"` 였던 칸(상세페이지 사진·쉽게). 서버가 형식을 따로 거른다. */
export const ACCEPT_ANY_IMAGE: AcceptRule = {
  accepts: (file) => file.type.startsWith("image/"),
  message: "그림 파일만 넣을 수 있습니다.",
};

/** 한 장만 받는 칸에 여러 장이 왔을 때(사용자 결정 2026-10-07: 첫 장만 넣고 알림). */
export const ONE_ONLY_MESSAGE = "이 칸은 한 장만 씁니다. 첫 장을 넣었습니다.";

/** 칸 옆에 적는 안내. 화면마다 따로 적으면 말이 갈린다. */
export const DROP_PASTE_HINT = "그림을 끌어다 놓거나, 이 칸을 누르고 Ctrl+V(Mac 은 ⌘V)로 붙여넣어도 됩니다.";

interface ItemLike { kind: string; getAsFile(): File | null }

/** 끌어온 것·붙여넣은 것의 공통 모양. 브라우저 객체를 그대로 받는다. */
export interface TransferLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ItemLike> | null;
  types?: ArrayLike<string> | null;
}

export type TransferPick = { files: File[]; notice?: string } | { error: string } | null;

/**
 * 옮겨 온 것 중 **이 칸이 받을 그림.**
 *
 * 파일 목록이 비면 항목에서 꺼낸다 — 캡처를 붙여넣을 때 그쪽으로만 주는
 * 브라우저가 있다. 파일이 하나도 없으면(글자를 붙여넣음) `null` 이다 —
 * 그건 그림 넣기가 아니니 아무 말도 하지 않는다.
 */
export function imagesFromTransfer(
  data: TransferLike | null | undefined,
  rule: { multiple: boolean; accept: AcceptRule },
): TransferPick {
  if (!data) return null;
  const listed = Array.from(data.files ?? []);
  const files = listed.length
    ? listed
    : Array.from(data.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
  if (!files.length) return null;

  const images = files.filter((file) => rule.accept.accepts(file));
  if (!images.length) return { error: rule.accept.message };
  if (!rule.multiple) {
    return images.length > 1 ? { files: [images[0]!], notice: ONE_ONLY_MESSAGE } : { files: [images[0]!] };
  }
  const skipped = files.length - images.length;
  return skipped ? { files: images, notice: `그림이 아닌 파일 ${skipped}개는 뺐습니다.` } : { files: images };
}

/** 파일을 끌고 있는가. 글자·링크를 끌 때는 칸을 강조하지도 막지도 않는다. */
function carriesFiles(data: TransferLike | null | undefined): boolean {
  return Array.from(data?.types ?? []).includes("Files");
}

/**
 * 이 칸 안에서 일어난 일인가.
 *
 * 라이브러리 고르기 창은 화면 맨 위(포털)에 뜨지만, React 는 이벤트를 부품
 * 차례대로 올려 보낸다. 그래서 창 위에서 붙여넣거나 놓은 것이 **창 뒤의 칸**에
 * 닿는다(2026-10-07 리뷰). 실제 화면 자리로 거른다.
 */
function fromInside(event: { currentTarget: { contains(node: unknown): boolean }; target: unknown }) {
  return event.currentTarget.contains(event.target);
}

interface DropTargetInput {
  disabled: boolean;
  /** 여러 장을 받는 칸인가. 아니면 첫 장만 넣고 알린다. */
  multiple?: boolean;
  /** 받는 형식. 안 주면 PNG·JPG·WEBP. */
  accept?: AcceptRule;
  onFiles: (files: File[]) => void;
  /** 안 받은 까닭이나 덧붙일 말(한 장만 씀·그림 아님). */
  onMessage: (message: string) => void;
}

/** 고른 결과를 넘긴다 — 그림이면 넣고, 할 말이 있으면 한다. */
function deliver(pick: TransferPick, { onFiles, onMessage }: DropTargetInput) {
  if (!pick) return;
  if ("error" in pick) return onMessage(pick.error);
  onFiles(pick.files);
  if (pick.notice) onMessage(pick.notice);
}

/**
 * 칸에 거는 손잡이.
 *
 * **잠긴 칸도 놓기는 막는다.** 막지 않으면 브라우저가 그 파일을 새로 열어
 * 이 페이지를 떠난다 — 만들던 것이 사라진다. 받지만 않는다. 칸 밖에 놓은 것도
 * 같은 까닭으로 막는다(`usePreventFileNavigation`) — 이 손잡이를 쓰는 화면은 저절로.
 *
 * 강조는 **들어온 수와 나간 수**로 끈다. 칸 안의 단추로 옮겨 가면 「단추에
 * 들어옴」 뒤에 「칸에서 나감」이 오는데, 어디로 나갔는지를 비워 주는 브라우저가
 * 있어 그것에 기대지 않는다.
 */
export function useImageDropTarget(input: DropTargetInput) {
  usePreventFileNavigation();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const { disabled } = input;
  const rule = { multiple: Boolean(input.multiple), accept: input.accept ?? ACCEPT_PNG_JPG_WEBP };
  const take = (pick: TransferPick) => deliver(pick, input);

  const handlers = {
    onDragEnter(event: DragEvent<HTMLElement>) {
      if (!carriesFiles(event.dataTransfer) || !fromInside(event)) return;
      event.preventDefault();
      depth.current += 1;
      if (!disabled) setOver(true);
    },
    onDragOver(event: DragEvent<HTMLElement>) {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled || !fromInside(event) ? "none" : "copy";
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!carriesFiles(event.dataTransfer) || !fromInside(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop(event: DragEvent<HTMLElement>) {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth.current = 0;
      setOver(false);
      if (!disabled && fromInside(event)) take(imagesFromTransfer(event.dataTransfer, rule));
    },
    onPaste(event: ClipboardEvent<HTMLElement>) {
      if (disabled || !fromInside(event)) return;
      const pick = imagesFromTransfer(event.clipboardData, rule);
      if (!pick) return;
      event.preventDefault();
      take(pick);
    },
  };

  return { over, handlers };
}

/**
 * **칸 옆에 잘못 놓아도 페이지를 떠나지 않게** 화면 전체에서 파일 놓기를 막는다.
 *
 * 칸 밖(글상자·칸 사이 여백)에 그림을 놓으면 브라우저가 그 파일을 열어 만들던
 * 것이 사라진다(2026-10-07 리뷰). 받지는 않는다 — 막기만 한다. 칸이 먼저 받는다.
 *
 * **칸이 이미 처리한 것은 건드리지 않는다.** 이것은 칸보다 나중에 돈다. 칸이
 * 「여기 놓아도 됨(copy)」이라 정한 것을 「안 됨(none)」으로 덮으면 브라우저가
 * 칸에 놓기 자체를 거절한다. 칸이 여럿이라 여러 번 걸려도 첫 번째가 막으면
 * 나머지는 「이미 처리됨」으로 지나간다.
 */
export function usePreventFileNavigation() {
  useEffect(() => {
    const block = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented || !carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.type === "dragover" && event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);
}
