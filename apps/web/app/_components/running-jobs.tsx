"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
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

/**
 * 서버에도 멈췄다고 알린다.
 *
 * 안 알리면 그 화면에 돌아갔을 때 또 붙고, **예약한 장이 만료까지 묶인다** —
 * 이미지 쪽은 확정이 캐묻기 안에만 있어서 멈추면 아무도 안 닫았다
 * (2026-09-17 독립 리뷰). 두 도구 다 같은 이름의 주소를 갖는다.
 */
async function tellServerToStop(job: RunningJob): Promise<void> {
  const prefix = `${job.tool}:`;
  const projectId = job.id.startsWith(prefix) ? job.id.slice(prefix.length) : "";
  if (!projectId) return;
  const url = job.tool === "sns"
    ? `/api/sns/projects/${projectId}/stop`
    : `/api/poster/projects/${projectId}/stop`;
  try {
    await fetch(url, { method: "POST" });
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

  // 지금 보고 있지 않은 일감만 대신 물어본다.
  const away = jobs.filter((job) => job.href !== pathname);
  const awayKey = away.map((job) => job.id).join("|");

  /**
   * **앞 차례가 끝난 뒤에 다음을 쏜다.**
   *
   * 예전에는 `setInterval` 이라 앞 요청이 안 끝나도 10초마다 새로 쐈다.
   * 카드뉴스 `status` 는 fal 이미지 내려받기·합성·업로드·검수 LLM 두 번까지
   * 하는 요청이라(`maxDuration = 300`) 수십 초가 예사다. 그러면 같은 프로젝트로
   * 요청이 쌓여, 같은 프로세스에서는 잠금에 줄을 서다 타임아웃까지 가고
   * 인스턴스가 여럿인 배포에서는 잠금이 안 걸쳐 **같은 카드를 두 번 제출**할
   * 수 있었다. 화면 쪽 폴러는 이미 연쇄 호출로 겹침을 막고 있었다.
   */
  React.useEffect(() => {
    if (!awayKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
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
          // 프로젝트가 사라졌으면 유령이 남는다. 그때는 지운다.
          if (response.status === 404) { finish(job.id); continue; }
          if (jobDone(await response.json())) finish(job.id);
        } catch {
          // 한 번 못 물어봤다고 지우지 않는다. 다음 차례에 다시 물어본다.
        }
      }
      if (stopped) return;
      setJobs((current) => pruneJobs(current, Date.now()));
      timer = setTimeout(() => void tick(), JOB_POLL_INTERVAL_MS);
    };

    timer = setTimeout(() => void tick(), JOB_POLL_INTERVAL_MS);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
    // away 는 매 렌더 새 배열이라 키로 비교한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awayKey, finish]);

  return (
    <RunningJobsContext.Provider value={{ jobs, start, finish, stop }}>
      {children}
    </RunningJobsContext.Provider>
  );
}
