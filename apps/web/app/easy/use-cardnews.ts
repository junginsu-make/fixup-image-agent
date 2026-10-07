"use client";
import { observeAccountResponse } from "../../lib/membership/account-events";

import * as React from "react";
import { useRunningJobs } from "../_components/running-jobs";
import { billableFetch } from "../../lib/billable-fetch";
import { JOB_POLL_INTERVAL_MS, jobId } from "../../lib/running-jobs";
import type { CardOptions } from "./cardnews-options";
import { cardnewsRequest, readCardnewsProject } from "./cardnews-request";
import { useCardnewsAfter } from "./use-cardnews-after";
import type { CopyPatch } from "./cardnews-after";
import {
  cardnewsJob, generatingProjects, jobsToRegister, latestCardnewsRow, redoCostLabel, startedDespiteError,
} from "./cardnews-state";
import { cardnewsView, type CardnewsProjectLike, type EasyCardnewsView } from "./cardnews-view";
import type { EasyMessage } from "./turn";

/**
 * **「쉽게」 화면의 카드뉴스 원고 · 진행**(2단계 설계 §7 · §8).
 *
 * 화면(`easy-client.tsx`)이 800줄을 넘지 않게 여기로 뺐다. 판단은
 * `cardnews-state.ts` 에 있고, 여기는 요청과 상태만 든다.
 */

type Project = CardnewsProjectLike & { title?: string };

export interface EasyCardnewsHandlers {
  /** 새 줄(원고 줄 · 원고를 못 쓴 까닭)을 대화에 붙인다. */
  onMessage(message: EasyMessage): void;
  onError(error: { message: string; retryable: boolean }): void;
  /** 원고를 썼다. 정해진 사진 역할을 기억하고 대화 목록을 새로 읽는다. */
  onDrafted(photoRoles: unknown): void;
}

const 보낸다 = cardnewsRequest;

/** 작업을 다시 읽는다. 못 읽으면 `undefined`(`cardnews-request.ts`). */
const 다시읽는다 = readCardnewsProject;

export function useEasyCardnews(input: {
  conversationId: string;
  messages: readonly EasyMessage[];
  initial?: Record<string, Project>;
  policy: "cost-v1" | "image-v2";
  handlers: EasyCardnewsHandlers;
}) {
  const { conversationId, messages, policy, handlers } = input;
  const [projects, setProjects] = React.useState<Record<string, Project>>(input.initial ?? {});
  const [acting, setActing] = React.useState(false);
  // 조건을 바꿔 원고를 다시 쓰는 줄. 1~2분 걸려 그동안 그 원고에 표시한다.
  const [redrafting, setRedrafting] = React.useState<string | null>(null);
  // 「이대로 만들기」를 보낸 줄. 응답까지 몇 분 걸려 그동안 그 원고에 표시한다.
  const [starting, setStarting] = React.useState<string | null>(null);
  const { jobs, start, finish } = useRunningJobs();

  const views = React.useMemo<Record<string, EasyCardnewsView>>(
    () => Object.fromEntries(Object.entries(projects).map(([row, project]) => [row, cardnewsView(project, policy)])),
    [projects, policy],
  );
  const generating = generatingProjects(views);

  /** 원고 줄을 붙인다. 서버가 준 줄 id 로 건다. */
  const add = React.useCallback((rowId: string, project: Project) => {
    setProjects((current) => ({ ...current, [rowId]: project }));
    handlers.onMessage({ id: rowId, role: "image", body: "", workId: project.id });
  }, [handlers]);

  /** 같은 작업을 가리키는 줄을 모두 바꾼다. */
  const replace = React.useCallback((project: Project) => {
    setProjects((current) => Object.fromEntries(Object.entries(current).map(([row, one]) =>
      [row, one.id === project.id ? { ...one, ...project } : one])));
  }, []);

  /** 「이대로 만들기」. 크레딧은 카드뉴스 `generate` 가 잡는다. */
  async function generate(rowId: string) {
    const project = projects[rowId];
    if (!project || acting || generating.length) return;
    setActing(true);
    setStarting(rowId);
    try {
      await 보낸다({ conversationId, projectId: project.id, action: "generate" });
      start(cardnewsJob(project.id, conversationId, project.title ?? ""));
      replace({ ...project, status: "generating" });
    } catch (cause) {
      // 답을 못 받았어도 서버가 이미 시작했을 수 있다. 다시 읽어 보고 이어 간다(미뤄 둔 것 3).
      const 지금 = await 다시읽는다(project.id);
      if (지금 && startedDespiteError(지금.status)) {
        start(cardnewsJob(project.id, conversationId, project.title ?? ""));
        replace(지금);
      } else {
        handlers.onError({ message: (cause as Error).message, retryable: (cause as { retryable?: boolean }).retryable !== false });
      }
    } finally {
      setActing(false);
      setStarting(null);
    }
  }

  /** 조건 바꾸기. 새 작업을 만들고 앞 작업은 그대로 둔다(설계 §7). */
  async function redraft(rowId: string, options: Partial<CardOptions>) {
    const project = projects[rowId];
    if (!project || acting) return;
    setActing(true);
    setRedrafting(rowId);
    try {
      const body = await 보낸다({ conversationId, projectId: project.id, action: "redraft", options });
      if (body.cardnews) add(body.cardnews.rowId, body.cardnews.project);
      else if (body.talked && body.message) {
        handlers.onMessage({ id: body.message.id, role: "assistant", body: body.message.body ?? "" });
      }
    } catch (cause) {
      handlers.onError({ message: (cause as Error).message, retryable: (cause as { retryable?: boolean }).retryable !== false });
    } finally {
      setActing(false);
      setRedrafting(null);
    }
  }

  /** 카드뉴스 갈래의 답이면 받아 그리고 `true`. 값은 원고까지 안 든다. */
  // 만든 카드뉴스 손보기(3단계). 채팅 턴의 답도 `take` 가 먼저 그쪽에 건넨다.
  const after = useCardnewsAfter({
    conversationId, projects, views, replace, start, onMessage: handlers.onMessage, onError: handlers.onError,
  });

  // 갈래 · 레퍼런스 물음은 이제 대화 줄이다(2차 D1, `_components/ask-row.tsx`). 여기는 원고 · 손보기만 받는다.
  function take(body: { cardnews?: { rowId: string; project: Project }; photoRoles?: unknown }) {
    if (after.take(body as Parameters<typeof after.take>[0])) return true;
    if (body.cardnews) {
      // 원고를 쓰고 끝낸다. 그림을 기다리지 않는다. 만들기는 원고 카드가 따로 한다.
      add(body.cardnews.rowId, body.cardnews.project);
      handlers.onDrafted(body.photoRoles);
    } else return false;
    return true;
  }

  useCardnewsProgress({ generating, conversationId, projects, jobs, start, finish, replace });

  return {
    views,
    latestRow: latestCardnewsRow(messages, views),
    /** 만드는 중이면 단추를 잠근다(설계 §8 「두 번째 카드뉴스를 시작하는 것은 막는다」). */
    busy: acting || generating.length > 0,
    working: generating.length > 0,
    /** 원고 줄에 넘길 것. 카드뉴스 줄이 아니면 없다. `locked` 는 화면이 보내는 중인가. */
    rowProps: (rowId: string, locked: boolean) => (views[rowId] ? {
      view: views[rowId]!,
      latest: latestCardnewsRow(messages, views) === rowId,
      busy: locked || acting || generating.length > 0 || Boolean(after.working),
      // 손보기 도구(3단계 §4). 카드가 마지막 원고 줄에만 단다.
      tools: {
        tool: after.tool?.rowId === rowId ? after.tool : null,
        busy: locked || acting || generating.length > 0 || Boolean(after.working),
        redoCost: (index: number) => redoCostLabel(views[rowId]!, index, policy),
        onToggle: (index: number, mode: "edit" | "redo") => after.toggleTool({ rowId, index, mode }),
        onClose: after.closeTool,
        onEdit: (index: number, copy: CopyPatch) => void after.editCard(rowId, index, { copy }),
        onRedo: (index: number, note: string) => void after.redoCard(rowId, index, note),
        onCaption: () => void after.writeCaption(rowId),
        onDownload: () => void after.downloadAll(rowId),
      },
      redrafting: redrafting === rowId,
      starting: starting === rowId,
      onGenerate: () => void generate(rowId),
      onRedraft: (options: Partial<CardOptions>) => void redraft(rowId, options),
    } : undefined),
    after,
    take,
    generate,
    redraft,
  };
}

/**
 * **진행을 이어 부른다**(설계 §8). 이 화면에 있는 동안은 셸이 안 부르므로 여기서
 * 부른다. 앞 요청이 끝난 뒤 다음을 부른다. 화면을 떠나면 멈추고 셸이 잇는다.
 */
function useCardnewsProgress(input: {
  generating: string[];
  conversationId: string;
  projects: Record<string, Project>;
  jobs: ReadonlyArray<{ id: string; href: string }>;
  start: ReturnType<typeof useRunningJobs>["start"];
  finish: ReturnType<typeof useRunningJobs>["finish"];
  replace: (project: Project) => void;
}) {
  const { generating, conversationId, projects, jobs, start, finish, replace } = input;
  const key = generating.join(",");

  /*
   * 만드는 중이면 셸에도 **이 대화 주소로** 걸어 둔다. 떠나도 결과를 받게.
   *
   * 셸 목록이 바뀔 때마다 다시 본다. 새로 고치면 셸이 저장해 둔 목록을 이 화면보다
   * 늦게 불러와 방금 건 것을 덮고, 카드뉴스 화면에 들르면 주소가 바뀐다(독립 리뷰 3).
   */
  React.useEffect(() => {
    for (const id of jobsToRegister(generating, jobs, conversationId)) {
      const title = Object.values(projects).find((one) => one.id === id)?.title ?? "";
      start(cardnewsJob(id, conversationId, title));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, jobs]);

  React.useEffect(() => {
    if (!key) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      timer = setTimeout(async () => {
        for (const id of key.split(",")) {
          if (stopped) return;
          try {
            const body = await (await billableFetch(`/api/sns/projects/${id}/status`, {})).json();
            observeAccountResponse(body, false);
            if (stopped) return;
            if (body.ok && body.project) replace(body.project);
            if (body.ok && body.active === false) finish(jobId("sns", id));
          } catch {
            // 한 번 못 물으면 다음 차례에 다시 묻는다.
          }
        }
        if (!stopped) tick();
      }, JOB_POLL_INTERVAL_MS);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [key, finish, replace]);
}
