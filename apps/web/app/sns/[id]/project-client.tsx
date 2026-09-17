"use client";

import * as React from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StepBar, type StepDefinition } from "@fixup/ui";
import type { SnsFlowCard } from "../../api/sns/flow-service";
import type { SnsProjectRecord } from "../../api/sns/projects/project-service";
import { CopyReview } from "./copy-review";
import { ResultBoard } from "./result-board";
import { hasActiveQueuedGeneration, QUEUE_POLL_INTERVAL_MS } from "../../../lib/sns/queued-flow";
import { afterGenerateFailure } from "../generate-recovery";
// 이미지 만들기가 같은 문제를 이미 풀었다 — 새 조각을 만들지 않는다.
import { WorkingBanner } from "../../poster/_components/working-banner";
import { rerunHref } from "../../_components/rerun-step";
import { billableHeaders } from "../../../lib/billable-fetch";
import { jobId } from "../../../lib/running-jobs";
import { useRunningJobs } from "../../_components/running-jobs";
import { blockedByReadOnly, READ_ONLY_MESSAGE } from "../../_components/read-only-work";
import { useRouter } from "next/navigation";

const STEPS: StepDefinition[] = [
  { id: "content", label: "01 내용", desc: "직접 쓰거나 가져오기" },
  { id: "images", label: "02 이미지", desc: "종류·역할·자리" },
  { id: "spec", label: "03 규격", desc: "비율·장수·언어·모델" },
  { id: "copy", label: "04 원고 확인", desc: "글자 직접 수정" },
  { id: "result", label: "05 결과", desc: "검수·내려받기" },
];

type Payload = { ok?: boolean; project?: SnsProjectRecord; message?: string };
type CopyPatch = Partial<Pick<SnsFlowCard["copy"], "headline" | "body" | "accent" | "footnote">>;

/**
 * **상태 코드를 들고 던진다.**
 *
 * 지금까지는 문구만 남기고 코드를 버렸다. 그래서 「이미 생성 중입니다」(409)와
 * 진짜 실패를 화면이 구분하지 못했고, 서버가 「이미 돌고 있다」고 말해도
 * 화면은 그냥 오류로 적고 04 에 머물렀다.
 */
class ProjectRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ProjectRequestError";
  }
}

async function projectRequest(
  url: string,
  init?: RequestInit,
  readOnly = false,
): Promise<SnsProjectRecord> {
  /*
    **남의 작업을 보는 중이면 쓰는 요청을 여기서 막는다.**

    단추를 하나씩 잠그지 않는 이유는 빠뜨린 단추가 곧 구멍이기 때문이다.
    요청이 나가는 길목이 이 함수 하나라, 새 단추가 생겨도 저절로 막힌다.
  */
  if (blockedByReadOnly(readOnly, init)) {
    throw new ProjectRequestError(READ_ONLY_MESSAGE, 403);
  }
  const response = await fetch(url, init);
  const payload = await response.json() as Payload;
  if (!response.ok || !payload.project) {
    throw new ProjectRequestError(payload.message ?? "프로젝트를 처리하지 못했습니다.", response.status);
  }
  return payload.project;
}

export function SnsProjectClient({ projectId }: { projectId: string }) {
  const [project, setProject] = React.useState<SnsProjectRecord>();
  const [view, setView] = React.useState<"copy" | "result">("copy");
  const [busy, setBusy] = React.useState<"loading" | "planning" | "generating" | undefined>("loading");
  const [savingIndex, setSavingIndex] = React.useState<number>();
  const [regeneratingIndex, setRegeneratingIndex] = React.useState<number>();
  const [writingCaption, setWritingCaption] = React.useState(false);
  const [message, setMessage] = React.useState("");
  /**
   * **남의 작업을 보는 중인가.**
   *
   * 회원용 경로가 404 를 주면 관리자 통로로 한 번 더 물어본다. 거기서 오면
   * 남의 작업이다 — 볼 수는 있고 고치지는 못한다.
   *
   * 따로 「나는 관리자인가」를 묻지 않는다. 관리자 통로가 주면 관리자고,
   * 막히면 아니다 — 두 번 물으면 두 대답이 어긋날 수 있다(`works-tab` 과 같은 판단).
   */
  const [readOnly, setReadOnly] = React.useState(false);

  /**
   * 이 화면에서 나가는 모든 요청은 **이것을 지난다.**
   *
   * 부르는 자리마다 `readOnly` 를 손으로 넘기면 언젠가 한 곳을 빠뜨리고,
   * 그 한 곳이 곧 구멍이다. 감싸개를 하나 두면 빠뜨릴 자리가 없다.
   */
  const router = useRouter();
  const [copying, setCopying] = React.useState(false);

  /**
   * 남의 작업을 **내 것으로 복사한다.**
   *
   * 고치는 대신 복사한다 — 그래야 회원의 작업이 안 바뀌고, 크레딧과 소유가
   * 복사한 사람 하나로 맞아떨어진다(2026-09-16 사용자 결정).
   *
   * 복사가 끝나면 그 작업으로 옮겨 간다. 자기 것이므로 그때부터는 전부
   * 기존 동작이다.
   */
  const copyToSelf = React.useCallback(async () => {
    setCopying(true);
    setMessage("");
    try {
      const body = await (await fetch(`/api/admin/works/sns/${projectId}/copy`, {
        method: "POST",
      })).json() as { ok?: boolean; id?: string; message?: string };
      if (!body.ok || !body.id) throw new Error(body.message ?? "복사하지 못했습니다.");
      router.push(`/sns/${body.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "복사하지 못했습니다.");
    } finally {
      setCopying(false);
    }
  }, [projectId, router]);

  const request = React.useCallback(
    (url: string, init?: RequestInit) => projectRequest(url, init, readOnly),
    [readOnly],
  );

  /** 뼈대를 바꾸면 서버가 고친 카드를 다시 받아 온다. */
  const reload = React.useCallback(async () => {
    try {
      const loaded = await request(`/api/sns/projects/${projectId}/plan`);
      setProject(loaded);
      // **첫 적재와 같은 규칙을 쓴다.** 다시 읽고도 화면 단계를 안 맞추면,
      // 서버가 「생성 중」이라고 알려 줘도 사용자는 04 에 그대로 남는다.
      if (loaded.data.flow) setView(loaded.data.flow.stage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다.");
    }
  }, [projectId, request]);

  React.useEffect(() => {
    projectRequest(`/api/sns/projects/${projectId}/plan`)
      .then((loaded) => {
        setProject(loaded);
        if (loaded.data.flow) setView(loaded.data.flow.stage);
      })
      .catch(async (error) => {
        /*
          **404 면 남의 작업일 수 있다.** 회원용 경로는 RLS 를 타서 내 것과
          같은 팀 것만 준다. 관리자에게는 별도 통로가 있으므로 한 번 더 묻는다.
          거기서도 막히면 관리자가 아니거나 정말 없는 작업이다.
        */
        if (error instanceof ProjectRequestError && error.status === 404) {
          const response = await fetch(`/api/admin/works/sns/${projectId}`, { cache: "no-store" });
          const body = await response.json().catch(() => null) as { ok?: boolean; work?: SnsProjectRecord } | null;
          if (body?.ok && body.work) {
            setReadOnly(true);
            setProject(body.work);
            if (body.work.data.flow) setView(body.work.data.flow.stage);
            return;
          }
        }
        setMessage(error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다.");
      })
      .finally(() => setBusy(undefined));
  }, [projectId]);

  const generationActive = hasActiveQueuedGeneration(project?.data.flow);

  /**
   * 사이드바에 등록한다.
   *
   * 이 화면을 떠나도 셸이 대신 결과를 받아 오고, 무엇이 돌고 있는지 어디서든
   * 보인다. 이미 만드는 중인 프로젝트를 열었을 때도 같은 자리에 붙는다.
   */
  const { jobs, start, finish, stop } = useRunningJobs();

  /**
   * 지금 돌고 있는 것을 **강제로 끝낸다.**
   *
   * 사이드바에 있던 목록과 중지를 상단 표시 하나로 합쳤다(2026-09-17 사용자
   * 결정). 카드뉴스는 서버에도 멈췄다고 알린다 — 안 그러면 다시 열었을 때
   * 그 흐름에 또 붙는다(`running-jobs.tsx` 의 `tellServerToStop`).
   */
  const [stopping, setStopping] = React.useState(false);
  /**
   * 사용자가 **중지**를 눌렀나.
   *
   * 기획 단계에는 일감이 목록에 없어 멈출 것도 없었다 — 그런데 그사이 기획
   * 응답이 도착하면 화면이 혼자 다음 단계로 넘어갔다(2026-09-17 독립 리뷰).
   * 이미지 쪽과 같은 방식으로, 누른 뒤에 도착한 답을 버린다.
   */
  const stopped = React.useRef(false);

  /** 일을 시작한다. 지난 중지를 여기서 푼다 — 갈래마다 적으면 하나를 빠뜨린다. */
  function beginWork(state: "planning" | "generating") {
    stopped.current = false;
    setBusy(state);
    setMessage("");
  }

  async function stopNow() {
    setStopping(true);
    stopped.current = true;
    const id = jobId("sns", projectId);
    const job = jobs.find((entry) => entry.id === id);
    try {
      if (job) {
        await stop(job);
      } else {
        finish(id);
        /*
          **일감으로 안 잡힌 것도 서버에 알린다.** 기획 중에는 아직 목록에
          없는데, 흐름과 예약은 서버에 있다. 안 알리면 그대로 남는다.
        */
        await request(`/api/sns/projects/${projectId}/stop`, { method: "POST" }).catch(() => {});
      }
      // 서버가 멈춘 것을 화면에도 반영한다. 안 하면 「만드는 중」이 그대로 남는다.
      await reload();
    } catch {
      setMessage("중지했지만 상태를 다시 읽지 못했습니다. 새로고침해 주세요.");
    } finally {
      setStopping(false);
      setBusy(undefined);
    }
  }
  const startedAt = project?.data.flow?.generation?.startedAt;
  const title = project?.title;
  React.useEffect(() => {
    const id = jobId("sns", projectId);
    if (!generationActive) {
      finish(id);
      return;
    }
    start({
      id,
      tool: "sns",
      title: title ?? "카드뉴스",
      href: `/sns/${projectId}`,
      startedAt: startedAt ? Date.parse(startedAt) : Date.now(),
      poll: { url: `/api/sns/projects/${projectId}/status` },
    });
  }, [generationActive, projectId, startedAt, title, start, finish]);

  React.useEffect(() => {
    /*
      **남의 작업을 보는 중이면 캐지 않는다.**

      이 캐묻기는 `POST /status` 다 — 쓰는 요청이라 막이 걸린다. 그런데 아래
      `catch` 가 실패하면 다시 캐묻으므로, 막힌 채로 두면 **오류 → 재시도 →
      오류**가 끝없이 돈다. 화면에는 빨간 글씨만 계속 뜬다.

      남의 작업이 지금 만들어지는 중이어도 그것을 지켜보는 것은 그 주인의
      화면이 할 일이다.
    */
    if (!generationActive || readOnly) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      timer = setTimeout(async () => {
        try {
          const saved = await request(`/api/sns/projects/${projectId}/status`, { method: "POST" });
          if (stopped) return;
          setProject(saved);
          setView("result");
          setMessage("");
          if (hasActiveQueuedGeneration(saved.data.flow)) await poll();
        } catch (error) {
          if (stopped) return;
          setMessage(error instanceof Error ? error.message : "생성 상태를 확인하지 못했습니다.");
          await poll();
        }
      }, QUEUE_POLL_INTERVAL_MS);
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [generationActive, projectId, readOnly, request]);

  async function plan() {
    beginWork("planning");
    try {
      const saved = await request(`/api/sns/projects/${projectId}/plan`, { method: "POST" });
      // 중지를 눌렀으면 도착한 기획을 안 쓴다 — 멈춘 화면이 혼자 넘어가면 안 된다.
      if (stopped.current) return;
      setProject(saved);
      setView("copy");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "기획과 원고를 만들지 못했습니다.");
    } finally {
      setBusy(undefined);
    }
  }

  async function saveCopy(index: number, patch: CopyPatch) {
    setSavingIndex(index);
    setMessage("");
    try {
      const saved = await request(`/api/sns/projects/${projectId}/cards/${index}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      setProject(saved);
      setView("copy");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "원고를 저장하지 못했습니다.");
    } finally {
      setSavingIndex(undefined);
    }
  }

  async function generate() {
    beginWork("generating");
    try {
      // 크레딧이 깎이는 요청이다 — 열쇠 없이 보내면 서버가 예약을 거절한다.
      const saved = await request(`/api/sns/projects/${projectId}/generate`, {
        method: "POST",
        headers: billableHeaders(),
      });
      if (stopped.current) return;
      setProject(saved);
      setView("result");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카드를 만들지 못했습니다.");
      /**
       * **409 는 「이미 돌고 있다」는 통보다.**
       *
       * 만들기 요청이 서버에는 닿았는데 응답이 화면까지 못 온 경우(배포
       * 재시작·네트워크·탭 닫힘) 화면만 그 사실을 모른다. 그대로 두면 사용자는
       * **영원히 안 되는 버튼**을 계속 누른다 — 운영에서 실제로 그랬다.
       *
       * 다시 읽으면 진행 중인 흐름이 보이고, 그때부터 결과를 받아 오기 시작한다.
       */
      const status = error instanceof ProjectRequestError ? error.status : undefined;
      if (afterGenerateFailure(status) === "resync") await reload();
    } finally {
      setBusy(undefined);
    }
  }

  async function writeCaption() {
    setWritingCaption(true);
    setMessage("");
    try {
      setProject(await request(`/api/sns/projects/${projectId}/caption`, { method: "POST" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "게시글 문구를 만들지 못했습니다.");
    } finally {
      setWritingCaption(false);
    }
  }

  /**
   * 낱장을 다시 만든다. **성공 여부를 돌려준다.**
   *
   * 실패했는데 화면이 그것을 모르면, 적은 말을 지우고 입력칸을 닫아 버린다 —
   * 아무것도 안 나갔는데 사람은 다시 적어야 한다. 카드는 한 장씩 돌기 때문에
   * 「다른 카드가 생성 중입니다」(409)는 정상 흐름에서 자주 난다.
   */
  async function regenerate(index: number, note?: string): Promise<boolean> {
    setRegeneratingIndex(index);
    setMessage("");
    try {
      // 다시 만들기도 크레딧이 깎인다 — 열쇠가 없으면 예약이 거절된다.
      // 적은 말은 이번 한 번만 쓴다. 안 적으면 지금까지와 똑같이 돈다.
      setProject(await request(`/api/sns/projects/${projectId}/cards/${index}`, {
        method: "POST",
        headers: billableHeaders(),
        body: JSON.stringify({ note }),
      }));
      setView("result");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카드를 다시 만들지 못했습니다.");
      // 「다른 카드가 생성 중입니다」(409)도 같은 통보다 — 화면만 모르고 있다.
      const status = error instanceof ProjectRequestError ? error.status : undefined;
      if (afterGenerateFailure(status) === "resync") await reload();
      return false;
    } finally {
      setRegeneratingIndex(undefined);
    }
  }

  if (busy === "loading") return <div className="flex items-center gap-3 py-16 text-muted-foreground"><Loader2 className="animate-spin" />프로젝트를 불러오는 중입니다.</div>;
  if (!project) return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-destructive">{message || "프로젝트를 찾을 수 없습니다."}</p>;

  const flow = project.data.flow;
  return (
    <div className="grid gap-8">
      <header>
        <p className="text-meta text-subtle-foreground">CARD NEWS STUDIO</p>
        <h1 className="mt-1 text-h1">{project.title}</h1>
        <p className="mt-2 max-w-3xl text-body text-muted-foreground">원고를 직접 확인한 뒤 이미지를 만들고, 검수 결과를 보고 사람이 다시 만들지 결정합니다.</p>
      </header>

      {/*
        **남의 작업을 보는 중이라고 먼저 말한다.**

        안 적으면 자기 작업인 줄 알고 고치려다 「고칠 수 없습니다」만 본다.
        무엇을 하면 되는지(복사)까지 같은 자리에 적는다.
      */}
      {readOnly ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span>
            <b>다른 회원의 작업</b>을 보는 중입니다. 원고·설정·결과는 볼 수 있고
            고칠 수는 없습니다. 고치려면 내 작업으로 복사하세요.
          </span>
          {/* 무엇을 하면 되는지 같은 자리에 둔다. 막아만 두면 길이 없다. */}
          <Button size="sm" disabled={copying} onClick={() => void copyToSelf()}>
            {copying ? <Loader2 className="animate-spin" /> : null}
            {copying ? "복사하는 중…" : "내 작업으로 복사"}
          </Button>
        </div>
      ) : null}

      {/*
        **돌고 있다는 것을 눈에 띄게 말한다**(사용자 요청 2026-09-09).
        버튼 글자만 바뀌면 화면이 멈춘 것으로 읽힌다 — 이미지 만들기가 같은
        지적을 받고 이 띠를 만들었다(`working-banner.tsx` 머리말).
      */}
      {busy === "planning" ? (
        <WorkingBanner
          label="기획과 원고를 만드는 중입니다"
          hint="1~2분 걸립니다. 이 화면을 닫아도 계속됩니다"
          onStop={() => void stopNow()}
          stopping={stopping}
        />
      ) : null}
      {busy === "generating" ? (
        <WorkingBanner
          label="그림을 만드는 중입니다"
          hint="장수만큼 차례로 만듭니다. 이 화면을 닫아도 계속됩니다"
          onStop={() => void stopNow()}
          stopping={stopping}
        />
      ) : null}
      {generationActive && busy !== "generating" ? (
        <WorkingBanner
          label="그림을 만드는 중입니다"
          hint="한 장씩 만들고 있습니다. 이 화면을 닫아도 계속됩니다"
          onStop={() => void stopNow()}
          stopping={stopping}
        />
      ) : null}

      {/*
        **앞 세 단계는 새로 만드는 화면에 있다.** 이 작업의 값을 들고 간다.

        전에는 아예 못 누르게 막아 두어서, 지난 단계를 보려면 길이 없었다
        (2026-09-16 사용자 보고). 04 는 이 화면 안이라 그대로 오간다.

        **남의 작업이어도 간다.** 관리자는 모든 회원의 작업을 다시 만들 수
        있어야 한다. 거기서 만들기를 누르면 **새 작업**이 생기고 원래 작업은
        안 바뀐다 — 그래서 읽기 전용과 어긋나지 않는다.
      */}
      <StepBar
        steps={STEPS}
        current={view}
        /*
          **못 가는 곳은 눌리지 않게 한다.** `onJump` 안에서 조용히 돌아서면
          단추는 활성으로 보이고 hover 까지 먹는데 눌러도 아무 일이 없다 —
          원고를 다 고친 사람이 「05 결과」를 누르고 고장으로 읽는다
          (2026-09-16 독립 리뷰). 전에는 `onJump` 자체가 없어서 다섯 단추가
          전부 비활성이었다. 이미지 쪽도 `allowJump` 로 막는다.
        */
        allowJump={(id) => id !== "result" || view === "result"}
        onJump={(id) => {
          if (id === "copy") return view === "result" ? setView("copy") : undefined;
          if (id === "result") return undefined;
          // **누른 단계도 함께 싣는다.** 안 실으면 03 을 눌러도 01 이 열린다
          // (2026-09-17 사용자 보고).
          router.push(rerunHref("/sns/new", projectId, id));
        }}
      />

      {message ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{message}</p> : null}

      {!flow ? (
        <Card>
          <CardHeader><CardTitle>04 원고 확인 준비</CardTitle><CardDescription>기획 모델이 카드 구조를 정하고, 확인할 원고를 씁니다.</CardDescription></CardHeader>
          <CardContent><Button disabled={busy === "planning"} onClick={() => void plan()}>{busy === "planning" ? <Loader2 className="animate-spin" /> : null}{busy === "planning" ? "기획·원고 만드는 중…" : "기획·원고 만들기"}</Button></CardContent>
        </Card>
      ) : view === "copy" ? (
        <div className="grid gap-8">
          <section><h2 className="text-h2">04 원고 확인</h2><p className="mt-2 text-muted-foreground">글자수 제한 없이 직접 고치고 카드별로 저장하세요. 저장한 글자가 그림에 그대로 들어갑니다.</p></section>
          <CopyReview flow={flow} savingIndex={savingIndex} projectId={projectId} ratioId={project.ratio} onSave={saveCopy} onLayoutChanged={() => void reload()} />
          <div className="flex justify-end border-t pt-6"><Button disabled={busy === "generating" || flow.cards.length === 0} onClick={() => void generate()}>{busy === "generating" ? <Loader2 className="animate-spin" /> : <ArrowRight />}{busy === "generating" ? "프롬프트·레퍼런스 준비 중…" : "이 원고로 그림 만들기"}</Button></div>
        </div>
      ) : (
        <div className="grid gap-8">
          <section><h2 className="text-h2">05 결과</h2><p className="mt-2 text-muted-foreground">검수에서 걸린 카드는 이유를 확인한 뒤 필요한 카드만 직접 다시 만드세요. 자동 재생성은 하지 않습니다.</p></section>
          <ResultBoard
            title={project.title}
            flow={flow}
            regeneratingIndex={regeneratingIndex}
            onRegenerate={regenerate}
            writingCaption={writingCaption}
            onWriteCaption={writeCaption}
          />
        </div>
      )}
    </div>
  );
}
