"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Square, Trash2 } from "lucide-react";
import { Button } from "@fixup/ui";
import {
  JOB_POLL_INTERVAL_MS,
  RUNNING_JOBS_KEY,
  jobDone,
  parseJobs,
  pruneJobs,
  removeJob,
  upsertJob,
  type RunningJob,
} from "../../lib/running-jobs";
import { ElapsedTime } from "./elapsed-time";

/**
 * 만드는 중인 것들을 셸이 들고 있는다.
 *
 * 생성은 브라우저가 이끈다. 화면이 fal 에 상태를 물어보고 결과를 받아 온다.
 * 그래서 만드는 도중에 다른 화면으로 가면 받아 오는 일이 멈췄다. **셸은
 * 화면을 옮겨도 살아 있으므로**, 목록을 여기 두면 계속 받아 올 수 있다.
 *
 * 그 화면에 있는 동안에는 쉰다. 화면이 이미 스스로 물어보고 있고, 받아 온
 * 것을 그려야 하는 쪽도 그 화면이다. 둘이 같이 물어볼 이유가 없다.
 */

interface RunningJobsValue {
  jobs: RunningJob[];
  start(job: RunningJob): void;
  finish(id: string): void;
  stop(job: RunningJob): Promise<void>;
  stopAll(): Promise<void>;
}

const RunningJobsContext = React.createContext<RunningJobsValue | undefined>(undefined);

export function useRunningJobs(): RunningJobsValue {
  const value = React.useContext(RunningJobsContext);
  if (!value) throw new Error("RunningJobsProvider 안에서만 쓸 수 있습니다.");
  return value;
}

function read(): RunningJob[] {
  try {
    return parseJobs(JSON.parse(window.localStorage.getItem(RUNNING_JOBS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** 카드뉴스는 서버에도 멈췄다고 알린다. 안 그러면 그 화면에 돌아갔을 때 또 붙는다. */
async function tellServerToStop(job: RunningJob): Promise<void> {
  if (job.tool !== "sns") return;
  const projectId = job.id.slice("sns:".length);
  try {
    await fetch(`/api/sns/projects/${projectId}/stop`, { method: "POST" });
  } catch {
    // 못 알려도 목록에서는 뺀다. 화면이 멈춘 것이 사용자가 원한 결과다.
  }
}

export function RunningJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = React.useState<RunningJob[]>([]);
  const pathname = usePathname();

  // 새로고침을 넘긴다. 브라우저에만 두므로 다른 기기에서는 안 보인다.
  React.useEffect(() => { setJobs(pruneJobs(read(), Date.now())); }, []);
  React.useEffect(() => {
    try { window.localStorage.setItem(RUNNING_JOBS_KEY, JSON.stringify(jobs)); } catch { /* 저장 못 해도 이번 세션은 돈다 */ }
  }, [jobs]);

  const start = React.useCallback((job: RunningJob) => {
    setJobs((current) => upsertJob(pruneJobs(current, Date.now()), job));
  }, []);

  const finish = React.useCallback((id: string) => {
    setJobs((current) => removeJob(current, id));
  }, []);

  const stop = React.useCallback(async (job: RunningJob) => {
    setJobs((current) => removeJob(current, job.id));
    await tellServerToStop(job);
  }, []);

  const stopAll = React.useCallback(async () => {
    const stopping = jobs;
    setJobs([]);
    await Promise.all(stopping.map(tellServerToStop));
  }, [jobs]);

  // 지금 보고 있지 않은 일감만 대신 물어본다.
  const away = jobs.filter((job) => job.href !== pathname);
  const awayKey = away.map((job) => job.id).join("|");

  React.useEffect(() => {
    if (!awayKey) return;
    let stopped = false;
    const timer = setInterval(() => {
      void (async () => {
        for (const job of away) {
          if (stopped) return;
          try {
            const response = await fetch(job.poll.url, {
              method: "POST",
              ...(job.poll.body === undefined ? {} : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(job.poll.body),
              }),
            });
            // 프로젝트가 사라졌으면 유령이 30분간 남는다. 그때는 지운다.
            if (response.status === 404) { finish(job.id); continue; }
            if (jobDone(await response.json())) finish(job.id);
          } catch {
            // 한 번 못 물어봤다고 지우지 않는다. 다음 차례에 다시 물어본다.
          }
        }
        setJobs((current) => pruneJobs(current, Date.now()));
      })();
    }, JOB_POLL_INTERVAL_MS);
    return () => { stopped = true; clearInterval(timer); };
    // away 는 매 렌더 새 배열이라 키로 비교한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awayKey, finish]);

  return (
    <RunningJobsContext.Provider value={{ jobs, start, finish, stop, stopAll }}>
      {children}
    </RunningJobsContext.Provider>
  );
}

const TOOL_LABEL: Record<RunningJob["tool"], string> = { sns: "카드뉴스", poster: "포스터" };

/** 사이드바 아래 칸. 만드는 중인 것이 없으면 아무것도 안 보인다. */
export function RunningJobsPanel() {
  const { jobs, stop, stopAll } = useRunningJobs();
  if (!jobs.length) return null;

  return (
    <section aria-label="만드는 중" className="grid gap-2 rounded-lg border bg-background p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-meta text-subtle-foreground">
          <Loader2 className="size-3 animate-spin" />만드는 중 {jobs.length}
        </p>
        <button
          type="button"
          onClick={() => void stopAll()}
          className="flex items-center gap-1 text-meta text-subtle-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />전체 중지
        </button>
      </div>

      <ul className="grid gap-1.5">
        {jobs.map((job) => (
          <li key={job.id} className="grid gap-1 rounded-md bg-muted/60 p-2">
            <Link href={job.href} className="block truncate text-xs font-bold hover:underline">
              {job.title || TOOL_LABEL[job.tool]}
            </Link>
            <div className="flex items-center justify-between gap-2">
              <span className="text-meta text-subtle-foreground">
                {TOOL_LABEL[job.tool]} · <ElapsedTime startedAt={job.startedAt} prefix="" />
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-meta"
                onClick={() => void stop(job)}
              >
                <Square className="size-3" />중지
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* fal 에 이미 보낸 요청은 취소하지 못한다. 숨기면 사용자가 오해한다. */}
      <p className="text-meta leading-5 text-subtle-foreground">
        중지하면 결과를 더 받지 않습니다. 이미 보낸 요청의 비용은 나갈 수 있습니다.
      </p>
    </section>
  );
}
