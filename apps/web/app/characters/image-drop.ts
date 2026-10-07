"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";

/**
 * 그림을 **끌어다 놓기·붙여넣기(Ctrl+V, Mac 은 ⌘V)** 로 넣는다(2026-10-07 사용자 요청).
 *
 * 칸이 둘(「내 캐릭터」·「참고할 그림」)이라 붙여넣기는 **누른 칸**으로 간다 —
 * 칸을 한 번 눌러 두면 붙여넣기가 그 칸에서 일어나 여기 손잡이까지 올라온다.
 * 받은 그림은 「새 이미지 올리기」와 같은 길로 넣는다. 라이브러리 저장·크기
 * 제한이 따로 갈라지지 않게 하려는 것이다.
 */

/** 「새 이미지 올리기」의 `accept` 와 같다. */
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);

export const NOT_IMAGE_MESSAGE = "PNG·JPG·WEBP 그림만 넣을 수 있습니다.";

interface ItemLike { kind: string; getAsFile(): File | null }

/** 끌어온 것·붙여넣은 것의 공통 모양. 브라우저 객체를 그대로 받는다. */
export interface TransferLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ItemLike> | null;
  types?: ArrayLike<string> | null;
}

export type TransferPick = { file: File } | { error: string } | null;

/**
 * 옮겨 온 것 중 **받을 수 있는 그림 한 장.**
 *
 * 파일 목록이 비면 항목에서 꺼낸다 — 캡처를 붙여넣을 때 그쪽으로만 주는
 * 브라우저가 있다. 파일이 하나도 없으면(글자를 붙여넣음) `null` 이다 —
 * 그건 그림 넣기가 아니니 아무 말도 하지 않는다.
 */
export function imageFromTransfer(data: TransferLike | null | undefined): TransferPick {
  if (!data) return null;
  const listed = Array.from(data.files ?? []);
  const files = listed.length
    ? listed
    : Array.from(data.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
  if (!files.length) return null;
  const image = files.find((file) => ACCEPTED.has(file.type));
  return image ? { file: image } : { error: NOT_IMAGE_MESSAGE };
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
  onFile: (file: File) => void;
  onError: (message: string) => void;
}

/** 고른 결과를 넘긴다 — 그림이면 넣고, 아니면 왜 안 되는지 말한다. */
function deliver(pick: TransferPick, { onFile, onError }: DropTargetInput) {
  if (!pick) return;
  if ("file" in pick) onFile(pick.file);
  else onError(pick.error);
}

/**
 * 칸에 거는 손잡이.
 *
 * **잠긴 칸도 놓기는 막는다.** 막지 않으면 브라우저가 그 파일을 새로 열어
 * 이 페이지를 떠난다 — 만들던 것이 사라진다. 받지만 않는다.
 *
 * 강조는 **들어온 수와 나간 수**로 끈다. 칸 안의 단추로 옮겨 가면 「단추에
 * 들어옴」 뒤에 「칸에서 나감」이 오는데, 어디로 나갔는지를 비워 주는 브라우저가
 * 있어 그것에 기대지 않는다.
 */
export function useImageDropTarget(input: DropTargetInput) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const { disabled } = input;
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
      if (!disabled && fromInside(event)) take(imageFromTransfer(event.dataTransfer));
    },
    onPaste(event: ClipboardEvent<HTMLElement>) {
      if (disabled || !fromInside(event)) return;
      const pick = imageFromTransfer(event.clipboardData);
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
 * 칸 밖(묘사 글상자·칸 사이 여백)에 그림을 놓으면 브라우저가 그 파일을 열어
 * 만들던 것이 사라진다(2026-10-07 리뷰). 끌어다 놓기를 권하는 화면이라 그
 * 실수가 잦아진다. 받지는 않는다 — 막기만 한다. 칸이 먼저 받는다.
 *
 * **칸이 이미 처리한 것은 건드리지 않는다.** 이것은 칸보다 나중에 돈다. 칸이
 * 「여기 놓아도 됨(copy)」이라 정한 것을 「안 됨(none)」으로 덮으면 브라우저가
 * 칸에 놓기 자체를 거절한다.
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
