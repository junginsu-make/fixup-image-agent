"use client";

import * as React from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StepBar, type StepDefinition } from "@fixup/ui";
import type { SnsFlowCard } from "../../api/sns/flow-service";
import type { SnsProjectRecord } from "../../api/sns/projects/project-service";
import { CopyReview } from "./copy-review";
import { ResultBoard } from "./result-board";
import { hasActiveQueuedGeneration, QUEUE_POLL_INTERVAL_MS } from "../../../lib/sns/queued-flow";
import { jobId } from "../../../lib/running-jobs";
import { useRunningJobs } from "../../_components/running-jobs";

const STEPS: StepDefinition[] = [
  { id: "content", label: "01 내용", desc: "직접 쓰거나 가져오기" },
  { id: "images", label: "02 이미지", desc: "종류·역할·자리" },
  { id: "spec", label: "03 규격", desc: "비율·장수·언어·모델" },
  { id: "copy", label: "04 원고 확인", desc: "글자 직접 수정" },
  { id: "result", label: "05 결과", desc: "검수·내려받기" },
];

type Payload = { ok?: boolean; project?: SnsProjectRecord; message?: string };
type CopyPatch = Partial<Pick<SnsFlowCard["copy"], "headline" | "body" | "accent" | "footnote">>;

async function projectRequest(url: string, init?: RequestInit): Promise<SnsProjectRecord> {
  const response = await fetch(url, init);
  const payload = await response.json() as Payload;
  if (!response.ok || !payload.project) throw new Error(payload.message ?? "프로젝트를 처리하지 못했습니다.");
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

  React.useEffect(() => {
    projectRequest(`/api/sns/projects/${projectId}/plan`)
      .then((loaded) => {
        setProject(loaded);
        if (loaded.data.flow) setView(loaded.data.flow.stage);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다."))
      .finally(() => setBusy(undefined));
  }, [projectId]);

  const generationActive = hasActiveQueuedGeneration(project?.data.flow);

  /**
   * 사이드바에 등록한다.
   *
   * 이 화면을 떠나도 셸이 대신 결과를 받아 오고, 무엇이 돌고 있는지 어디서든
   * 보인다. 이미 만드는 중인 프로젝트를 열었을 때도 같은 자리에 붙는다.
   */
  const { start, finish } = useRunningJobs();
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
    if (!generationActive) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      timer = setTimeout(async () => {
        try {
          const saved = await projectRequest(`/api/sns/projects/${projectId}/status`, { method: "POST" });
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
  }, [generationActive, projectId]);

  async function plan() {
    setBusy("planning");
    setMessage("");
    try {
      const saved = await projectRequest(`/api/sns/projects/${projectId}/plan`, { method: "POST" });
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
      const saved = await projectRequest(`/api/sns/projects/${projectId}/cards/${index}`, {
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
    setBusy("generating");
    setMessage("");
    try {
      const saved = await projectRequest(`/api/sns/projects/${projectId}/generate`, { method: "POST" });
      setProject(saved);
      setView("result");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카드를 만들지 못했습니다.");
    } finally {
      setBusy(undefined);
    }
  }

  async function writeCaption() {
    setWritingCaption(true);
    setMessage("");
    try {
      setProject(await projectRequest(`/api/sns/projects/${projectId}/caption`, { method: "POST" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "게시글 문구를 만들지 못했습니다.");
    } finally {
      setWritingCaption(false);
    }
  }

  async function regenerate(index: number) {
    setRegeneratingIndex(index);
    setMessage("");
    try {
      setProject(await projectRequest(`/api/sns/projects/${projectId}/cards/${index}`, { method: "POST" }));
      setView("result");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카드를 다시 만들지 못했습니다.");
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

      <StepBar steps={STEPS} current={view} onJump={view === "result" ? (id) => id === "copy" && setView("copy") : undefined} />

      {message ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{message}</p> : null}

      {!flow ? (
        <Card>
          <CardHeader><CardTitle>04 원고 확인 준비</CardTitle><CardDescription>기획 모델이 카드 구조를 정하고, 확인할 원고를 씁니다.</CardDescription></CardHeader>
          <CardContent><Button disabled={busy === "planning"} onClick={() => void plan()}>{busy === "planning" ? <Loader2 className="animate-spin" /> : null}{busy === "planning" ? "기획·원고 만드는 중…" : "기획·원고 만들기"}</Button></CardContent>
        </Card>
      ) : view === "copy" ? (
        <div className="grid gap-8">
          <section><h2 className="text-h2">04 원고 확인</h2><p className="mt-2 text-muted-foreground">글자수 제한 없이 직접 고치고 카드별로 저장하세요. 저장한 글자가 그림에 그대로 들어갑니다.</p></section>
          <CopyReview flow={flow} savingIndex={savingIndex} onSave={saveCopy} />
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
