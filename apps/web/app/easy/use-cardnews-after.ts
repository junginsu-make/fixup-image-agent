"use client";

import * as React from "react";
import type { RunningJob } from "../../lib/running-jobs";
import { snsCardFilename } from "../sns/download-filename";
import { downloadList, type CopyPatch } from "./cardnews-after";
import { cardnewsRequest } from "./cardnews-request";
import { cardnewsJob, openTool, type CardTool } from "./cardnews-state";
import type { CardnewsProjectLike, EasyCardnewsView } from "./cardnews-view";
import type { EasyMessage } from "./turn";

/**
 * **만든 카드뉴스 손보기 — 화면 상태와 요청**(3단계 설계 §4 · §6).
 *
 * 한 장 글 고치기 · 한 장 다시 만들기(확인 뒤) · 게시글 · 전부 받기. 판단은
 * `cardnews-after.ts` · `cardnews-state.ts` 에 있고, 여기는 요청과 상태만 든다.
 * `use-cardnews.ts` 가 이것을 불러 원고 줄에 넘긴다.
 */

type Project = CardnewsProjectLike & { title?: string };

interface 서버줄 { id?: string; body?: string }

export function useCardnewsAfter(input: {
  conversationId: string;
  projects: Readonly<Record<string, Project>>;
  views: Readonly<Record<string, EasyCardnewsView>>;
  replace(project: Project): void;
  start(job: RunningJob): void;
  onMessage(message: EasyMessage): void;
  onError(error: { message: string; retryable: boolean }): void;
}) {
  const { conversationId, projects, views, replace, start, onMessage, onError } = input;
  const [tool, setTool] = React.useState<CardTool>(null);
  // 지금 보내는 일(줄 id). 그동안 단추를 잠근다.
  const [working, setWorking] = React.useState<string | null>(null);

  const 말을붙인다 = (message: 서버줄 | undefined) => {
    if (message?.body) onMessage({ id: message.id || `after-${Date.now()}`, role: "assistant", body: message.body });
  };

  async function 한다(rowId: string, work: (project: Project) => Promise<void>) {
    const project = projects[rowId];
    if (!project || working) return;
    setWorking(rowId);
    try {
      await work(project);
    } catch (cause) {
      onError({ message: (cause as Error).message, retryable: (cause as { retryable?: boolean }).retryable !== false });
    } finally {
      setWorking(null);
    }
  }

  /** 한 장 글 고치기(무료). 그림이 있는 장이면 「그림에도 반영할까요?」 확인 줄을 연다. */
  const editCard = (rowId: string, index: number, change: { copy?: CopyPatch; words?: string }) =>
    한다(rowId, async (project) => {
      const body = await cardnewsRequest({ conversationId, projectId: project.id, action: "edit", index, ...change });
      replace(body.project);
      말을붙인다(body.message);
      setTool(body.needsRedraw ? { rowId, index, mode: "redo" } : null);
    });

  /** 한 장 다시 만들기 — 확인 줄의 단추를 눌렀을 때만 온다. 값은 그 장만큼. */
  const redoCard = (rowId: string, index: number, note?: string) =>
    한다(rowId, async (project) => {
      const body = await cardnewsRequest({ conversationId, projectId: project.id, action: "redo", index, ...(note?.trim() ? { note } : {}) });
      replace(body.project);
      // 진행은 2단계 진행 표시가 이어 받는다. 떠나도 셸이 받게 이 대화 주소로 건다.
      start(cardnewsJob(project.id, conversationId, project.title ?? ""));
      말을붙인다(body.message);
      setTool(null);
    });

  /** 게시글 쓰기(크레딧 없음). */
  const writeCaption = (rowId: string) =>
    한다(rowId, async (project) => {
      const body = await cardnewsRequest({ conversationId, projectId: project.id, action: "caption" });
      replace(body.project);
    });

  /** 전부 받기 — 그림이 있는 장을 압축 파일 하나로(브라우저, 카드뉴스 화면과 같은 이름 규칙). */
  const downloadAll = (rowId: string) =>
    한다(rowId, async (project) => {
      const view = views[rowId];
      const list = view ? downloadList(view) : [];
      if (!list.length) throw Object.assign(new Error("받을 그림이 없습니다."), { retryable: false });
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const card of list) {
        const response = await fetch(card.url);
        if (!response.ok) throw new Error(`${card.index}번 그림을 받지 못했습니다.`);
        zip.file(snsCardFilename(project.title ?? "", card.index, new URL(card.url, window.location.href).pathname), await response.blob());
      }
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: `${project.title || "card-news"}.zip` });
      link.click();
      URL.revokeObjectURL(url);
    });

  /**
   * 채팅 턴의 답 중 손보기 것을 받는다(3단계 §6-5). 받았으면 `true`.
   * 말 「3번 다시」는 확인 줄만 연다 — 값은 단추를 눌러야 나간다.
   */
  function take(body: {
    cardAsk?: { rowId: string; index: number; note?: string };
    cardEdited?: { rowId: string; project: Project; index: number; needsRedraw: boolean };
    caption?: { rowId: string; project: Project };
    download?: { rowId: string };
    message?: 서버줄;
  }): boolean {
    if (body.cardAsk) {
      const { rowId, index, note } = body.cardAsk;
      setTool((current) => openTool(current, { rowId, index, mode: "redo", ...(note ? { note } : {}) }, { keep: true }));
    } else if (body.cardEdited) {
      replace(body.cardEdited.project);
      말을붙인다(body.message);
      if (body.cardEdited.needsRedraw) setTool({ rowId: body.cardEdited.rowId, index: body.cardEdited.index, mode: "redo" });
    } else if (body.caption) {
      replace(body.caption.project);
      말을붙인다(body.message);
    } else if (body.download) {
      void downloadAll(body.download.rowId);
    } else return false;
    return true;
  }

  return {
    tool,
    /** 단추로 연다 · 닫는다. 같은 장 같은 도구를 다시 누르면 닫는다. */
    toggleTool: (next: CardTool) => setTool((current) => openTool(current, next)),
    closeTool: () => setTool(null),
    working,
    editCard,
    redoCard,
    writeCaption,
    downloadAll,
    take,
  };
}
