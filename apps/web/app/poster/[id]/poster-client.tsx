"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Loader2, Megaphone, Wand2 } from "lucide-react";
// 잎 모듈이다 — 규격 목록을 이 화면 번들로 끌고 오지 않는다.
import { adExportHref } from "../../ad/href";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Label, StepBar, Textarea, cn,
  SidePanel, SidePanelBody, SidePanelContent, SidePanelDescription,
  SidePanelFooter, SidePanelHeader, SidePanelTitle,
} from "@fixup/ui";
import { TYPE_INTERACTIONS, type PosterSlots } from "@fixup/poster-core";
import { downloadImage } from "../../_components/image-viewer";
import { useRunningJobs } from "../../_components/running-jobs";
import { jobId } from "../../../lib/running-jobs";
import { POSTER_STEPS } from "../steps";
import { billableFetch } from "../../../lib/billable-fetch";
import { placeholderRatio, showsTypeInteraction, splitFilledSlots } from "../poster-form-rules";
import { WorkingBanner } from "../_components/working-banner";

interface PosterImage {
  id: string;
  variantIndex: number;
  selected: boolean;
  url?: string;
  /** 목록에 거는 사본. 확대·내려받기는 원본을 쓴다. */
  thumbUrl?: string;
  review?: { decision: string; summary: string; issues: string[] } | null;
}

interface PosterProject {
  id: string;
  title: string;
  status: string;
  ratio: string;
  modelId: string;
  data: {
    instruction: string;
    variants: number;
    slots: PosterSlots;
    grammarIssues?: string[];
    /** 01에서 첨부한 그림에 대해 적은 말. 옛 작업에는 없다. */
    attachmentIntent?: string;
    /** 03에서 결과물에 대해 적은 말. 옛 작업에는 없다. */
    userInstruction?: string;
  };
}

type TextSlot = "kind" | "headline" | "subline" | "scene" | "subject" | "action"
  | "dominantColor" | "accentColor" | "forbidden";

/**
 * 다섯 단계를 **늘 다 보여준다.**
 *
 * 전에는 이 화면에서 04·05 만 보였다. 앞 세 단계는 다른 주소(`/poster/new`)라
 * 사라진 것인데, 사용자에게는 한 흐름이라 "왜 1~3 이 없지" 가 된다.
 * 어디쯤 왔는지 알려면 전체가 보여야 한다.
 *
 * 앞 세 단계를 누르면 그 단계로 돌아간다. 이미 만든 작업이라도 레퍼런스나
 * 규격을 다시 고르고 싶을 수 있다.
 */
const SLOT_LABELS: Array<[TextSlot, string, "line" | "area"]> = [
  ["kind", "유형", "line"],
  ["headline", "헤드라인", "line"],
  ["subline", "받침 문구", "line"],
  ["scene", "장면", "area"],
  ["subject", "피사체", "area"],
  ["action", "동작", "area"],
  ["dominantColor", "지배색", "line"],
  ["accentColor", "강조색", "line"],
  ["forbidden", "넣지 말 것", "line"],
];

export function PosterClient(
  { project, images, adEnabled = false }:
  { project: PosterProject; images: PosterImage[]; adEnabled?: boolean },
) {
  const [slots, setSlots] = React.useState(project.data.slots);
  const [saving, setSaving] = React.useState(false);
  /**
   * 지금 무엇을 하는 중인가. `null` 이면 아무것도 안 한다.
   *
   * **`kind` 를 따로 든다.** 「그리는 중」일 때만 결과 자리에 빈 칸을 깔아야
   * 하는데, 글자만으로 판단하면 문구를 고칠 때마다 그 조건이 깨진다.
   */
  const [busy, setBusy] = React.useState<{ kind: "plan" | "generate" | "review"; label: string; hint?: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<string[]>(project.data.grammarIssues ?? []);
  const [list, setList] = React.useState(images);
  const [editText, setEditText] = React.useState("");
  const router = useRouter();
  /** 지금 고치는 중인 변형. 한 번에 한 장만 고친다. */
  const [editing, setEditing] = React.useState<string | null>(null);

  /**
   * 기획 확인을 오른쪽 패널로 연다.
   *
   * **한 페이지를 통째로 쓸 내용이 아니었다**(2026-09-08 사용자). 칸 열한 개가
   * 늘 다 보였고, 글자가 없는 그림인데 「글자와 피사체의 관계」까지 있었다.
   *
   * 페이지는 **05 결과**가 갖는다 — 만든 것을 보고 고르고 다시 만드는 자리라
   * 넓어야 한다. 기획은 만들기 전에 한 번 훑는 자리이므로 패널이 맞다.
   */
  const [planOpen, setPlanOpen] = React.useState(false);
  /** 저절로 연 적이 있나. 닫은 것을 다시 열면 성가시다. */
  const openedOnce = React.useRef(false);
  /** 빈 칸을 펼쳤나. 기본은 접힘. */
  const [showEmpty, setShowEmpty] = React.useState(false);

  /**
   * 크게 볼 때 그림 옆에 같이 보여줄 것.
   *
   * 그림에 붙여 둔다 — 모달은 화면 전체에서 하나뿐이라 화면마다 넘겨받게
   * 하면 어딘가는 빠진다. 슬롯은 지금 화면의 값을 쓴다(저장 전에 고친 것도
   * 그대로 보이는 편이 맞다).
   */
  const viewerMeta = JSON.stringify({
    "무엇을 만들려던 것인가": project.data.instruction,
    유형: slots.kind,
    헤드라인: slots.headline,
    "받침 문구": slots.subline,
    장면: slots.scene,
    피사체: slots.subject,
    동작: slots.action,
    지배색: slots.dominantColor,
    강조색: slots.accentColor,
    "넣지 말 것": slots.forbidden,
    비율: project.ratio,
    모델: project.modelId,
  });

  /**
   * 사용자가 직접 친 말 — 있는 것만.
   *
   * 둘 다 없으면 빈 배열이라 화면에 아무것도 안 나온다. 옛 작업이 그렇다.
   */
  const userWords: Array<[string, string]> = [
    ["첨부한 그림에 대해", project.data.attachmentIntent?.trim() ?? ""],
    ["결과물에 대해", project.data.userInstruction?.trim() ?? ""],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  /**
   * 아직 아무것도 안 만들었으면 기획을 저절로 연다.
   *
   * 03에서 만들기를 누르면 여기로 오는데, 패널이 안 열리면 「빈 결과 화면」만
   * 보이고 다음에 뭘 해야 할지 알 수 없다. 한 번만 연다 — 닫은 것을 다시 열면
   * 성가시다.
   */
  React.useEffect(() => {
    if (openedOnce.current) return;
    if (images.length) return;
    openedOnce.current = true;
    setPlanOpen(true);
  }, [images.length]);

  /** 기획이 채운 칸과 안 채운 칸. 채운 것이 이 그림에 필요한 칸이다. */
  const { filled: filledFields, empty: emptyFields } = splitFilledSlots(
    SLOT_LABELS.map(([field]) => field),
    (field) => String(slots[field] ?? ""),
  );

  /** 칸 하나를 그린다. 채운 칸과 접힌 칸이 같은 모양이어야 한다. */
  function renderSlot(field: TextSlot) {
    const entry = SLOT_LABELS.find(([name]) => name === field);
    if (!entry) return null;
    const [, label, kind] = entry;
    return (
      <div key={field} className="grid gap-1.5">
        <Label htmlFor={`slot-${field}`}>{label}</Label>
        {kind === "area" ? (
          <Textarea
            id={`slot-${field}`}
            rows={2}
            value={String(slots[field] ?? "")}
            onChange={(event) => setField(field, event.target.value)}
          />
        ) : (
          <Input
            id={`slot-${field}`}
            value={String(slots[field] ?? "")}
            onChange={(event) => setField(field, event.target.value)}
          />
        )}
      </div>
    );
  }

  function downloadVariant(image: PosterImage) {
    const src = `/api/poster/projects/${project.id}/images/${image.variantIndex}/file`;
    void downloadImage({ src, name: `${project.title} 변형 ${image.variantIndex + 1}.png` });
  }
  const { start, finish } = useRunningJobs();

  // 화면을 떠나면 여기서 물어보기를 그만둔다. 셸이 이어받으므로 결과는 안 놓친다.
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /**
   * 열자마자 초안을 채운다.
   *
   * 앞 화면이 "나머지 칸은 AI 가 초안으로 채웁니다" 라고 약속하고, 이 화면은
   * "AI 가 채운 초안입니다" 라고 말한다. 그런데 실제로는 사람이 버튼을 눌러야
   * 채워졌다 — 빈 칸만 보고 무엇을 해야 할지 알 수 없었다.
   *
   * 이미 채워진 것이 있으면 부르지 않는다. 다시 채우고 싶으면 버튼이 있다.
   */
  const planned = React.useRef(false);
  React.useEffect(() => {
    if (planned.current) return;
    const empty = SLOT_LABELS.every(([field]) => !String(slots[field] ?? "").trim());
    if (!empty) return;
    planned.current = true;
    void runPlan();
    // 첫 진입에 한 번만. slots 를 넣으면 채워질 때마다 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(field: TextSlot, value: string) {
    setSlots((current: PosterSlots) => ({ ...current, [field]: value }));
  }

  async function saveSlots() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/poster/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(slots),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.message ?? "슬롯을 저장하지 못했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "슬롯을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  /** 기획을 채운다. 실패해도 빈 슬롯이 남고 사람이 직접 쓸 수 있다. */
  async function runPlan() {
    setBusy({ kind: "plan", label: "기획하는 중입니다", hint: "AI 가 칸을 채우고 있습니다" });
    setError(null);
    try {
      const body = await (await billableFetch(`/api/poster/projects/${project.id}/plan`)).json();
      if (!body.ok) throw new Error(body.message ?? "기획하지 못했습니다.");
      setSlots(body.project.data.slots);
      setNotes(body.issues ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "기획하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * 만든다.
   *
   * 제출하고 나서 상태를 물어본다. 모델 호출에 시간 제한을 두지 않는다 —
   * GPT Image 2 는 2분을 넘긴다.
   */
  async function generate() {
    setBusy({ kind: "generate", label: "보내는 중입니다", hint: "첨부한 그림을 올리고 있습니다" });
    setError(null);
    try {
      const start = await (await billableFetch(`/api/poster/projects/${project.id}/generate`)).json();
      if (!start.ok) throw new Error(start.message ?? "생성을 시작하지 못했습니다.");
      const submission = start.submission;
      setBusy({ kind: "generate", label: "그리는 중입니다", hint: "2~3분 걸립니다. 이 화면을 닫아도 계속됩니다" });
      await pollUntilDone(submission, project.data.variants);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "생성하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function select(imageId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/poster/projects/${project.id}/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.message ?? "변형을 고르지 못했습니다.");
      setList(body.images);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "변형을 고르지 못했습니다.");
    }
  }

  /** 고른 것만 검수한다. 반려해도 이미지는 남고 다시 만들지는 사람이 누른다. */
  async function review() {
    setBusy({ kind: "review", label: "검수하는 중입니다", hint: "글자가 원고대로 들어갔는지 봅니다" });
    setError(null);
    try {
      const body = await (await fetch(`/api/poster/projects/${project.id}/review`, { method: "POST" })).json();
      if (!body.ok) throw new Error(body.message ?? "검수하지 못했습니다.");
      setList(body.images);
      if (body.issues?.length) setNotes(body.issues);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "검수하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  /** 고른 것을 기준으로 고친다. 처음부터 다시 만들지 않는다. */
  async function edit() {
    const instruction = editText.trim();
    if (!instruction) {
      setError("무엇을 고칠지 적어 주세요. 비어 있으면 같은 것을 또 만듭니다.");
      return;
    }
    setBusy({ kind: "generate", label: "보내는 중입니다", hint: "고칠 그림을 올리고 있습니다" });
    setError(null);
    try {
      // 수정도 크레딧이 깎이는 요청이다 — 열쇠가 없으면 예약이 거절된다.
      const start = await (await billableFetch(`/api/poster/projects/${project.id}/edit`, {
        body: JSON.stringify({ instruction }),
      })).json();
      if (!start.ok) throw new Error(start.message ?? "고치지 못했습니다.");
      setBusy({ kind: "generate", label: "고치는 중입니다", hint: "2~3분 걸립니다. 이 화면을 닫아도 계속됩니다" });
      await pollUntilDone(start.submission, 1);
      setEditText("");
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "고치지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function pollUntilDone(submission: {
    requestRowId: string; falRequestId: string; endpoint: string; estimatedUsd?: number;
  }, variants: number) {
    const body = {
      requestRowId: submission.requestRowId,
      falRequestId: submission.falRequestId,
      endpoint: submission.endpoint,
      unitCostUsd: (submission.estimatedUsd ?? 0) / variants,
    };
    // 다른 화면으로 가도 셸이 대신 받아 온다. 어떤 요청인지 함께 넘긴다.
    const id = jobId("poster", project.id);
    start({
      id, tool: "poster", title: project.title, href: `/poster/${project.id}`,
      startedAt: Date.now(),
      poll: { url: `/api/poster/projects/${project.id}/status`, body },
    });
    // 화면을 떠나 중간에 그만둔 것이라면 목록에 남겨 둔다. 셸이 이어받는다.
    if (await collect(body)) finish(id);
  }

  /** 이 화면에 있는 동안에는 화면이 직접 물어본다. 떠나면 셸이 이어받는다. */
  async function collect(body: Record<string, unknown>): Promise<boolean> {
    for (;;) {
      if (!alive.current) return false;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      const poll = await (await fetch(`/api/poster/projects/${project.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })).json();
      if (!poll.ok) throw new Error(poll.message ?? "상태를 확인하지 못했습니다.");
      if (poll.done) {
        setList(poll.images);
        return true;
      }
    }
  }

  // 앞 화면(01~03)에서 이어지는 단계다. 어디쯤 왔는지 보여준다 —
  // 카드뉴스가 쓰는 것과 같은 막대다.
  const current = list.length ? "result" : "plan";

  return (
    <div className="grid gap-6">
      <StepBar
        steps={POSTER_STEPS}
        current={current}
        onJump={(id) => {
          // 앞 세 단계는 새로 만드는 화면에 있다. 거기로 보낸다.
          if (id === "plan" || id === "result") return;
          router.push("/poster/new");
        }}
      />

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {notes.length ? (
        <div role="status" className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <strong className="block">알아 두실 것</strong>
          <ul className="mt-1 list-disc pl-5">
            {notes.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      ) : null}

      {busy ? <WorkingBanner label={busy.label} hint={busy.hint} /> : null}

      {/*
        **기획은 패널, 결과는 페이지.**

        페이지는 05 결과가 갖는다 — 만든 것을 보고 고르고 다시 만드는 자리라
        넓어야 한다. 기획은 만들기 전에 한 번 훑는 자리이므로 옆에서 나온다
        (2026-09-08 사용자 결정).
      */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {images.length ? "기획을 고치고 다시 만들 수 있습니다." : "기획을 확인한 뒤 만듭니다."}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setPlanOpen(true)} disabled={Boolean(busy)}>
          기획 확인
        </Button>
      </div>

      <SidePanel open={planOpen} onOpenChange={setPlanOpen}>
        <SidePanelContent>
          <SidePanelHeader>
            <SidePanelTitle>기획 확인</SidePanelTitle>
            <SidePanelDescription>
              AI 가 채운 초안입니다. 틀린 칸만 고치세요.
            </SidePanelDescription>
          </SidePanelHeader>
          {/*
            **`content-start` 가 있어야 한다.** 없으면 내용이 패널보다 짧을 때
            grid 가 남는 높이를 줄마다 나눠 늘려, 칸 사이가 제멋대로 벌어진다
            (2026-09-08 화면에서 138px 벌어짐).
          */}
          <SidePanelBody className="grid content-start gap-5">
            {userWords.length ? (
              <div className="grid gap-2 rounded-md border border-border bg-muted/40 px-4 py-3">
                <span className="text-meta text-subtle-foreground">
                  내가 적은 말 — 아래 칸보다 우선합니다
                </span>
                {userWords.map(([label, text]) => (
                  <p key={label} className="text-sm">
                    <span className="text-muted-foreground">{label} · </span>
                    <span className="whitespace-pre-wrap">{text}</span>
                  </p>
                ))}
              </div>
            ) : null}

            {/* 기획이 값을 넣은 칸이 이 그림에 필요한 칸이다. */}
            <div className="grid gap-4">{filledFields.map(renderSlot)}</div>

            {emptyFields.length ? (
              <div className="grid gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start px-0 text-muted-foreground"
                  onClick={() => setShowEmpty((current) => !current)}
                >
                  {showEmpty ? "▾" : "▸"} 비어 있는 칸 {emptyFields.length}개 · 필요하면 채우세요
                </Button>
                {showEmpty ? <div className="grid gap-4">{emptyFields.map(renderSlot)}</div> : null}
              </div>
            ) : null}

            {/* **글자가 없으면 관계도 없다.** 판단이 아니라 규칙이다. */}
            {showsTypeInteraction(slots) ? (
              <fieldset className="grid gap-2">
                <legend className="text-meta text-subtle-foreground">글자와 피사체의 관계</legend>
                <div className="flex flex-wrap gap-2">
                  {TYPE_INTERACTIONS.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={slots.typeInteraction === value ? "default" : "secondary"}
                      onClick={() => setSlots((current: PosterSlots) => ({
                        ...current,
                        typeInteraction: current.typeInteraction === value ? null : value,
                      }))}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="slot-side">곁텍스트</Label>
              <Textarea
                id="slot-side"
                rows={2}
                value={slots.sideTexts.join("\n")}
                onChange={(event) => setSlots((current: PosterSlots) => ({
                  ...current,
                  sideTexts: event.target.value.split("\n"),
                }))}
                placeholder={"28MM F2.0\nISO 400"}
              />
              <p className="text-xs text-subtle-foreground">한 줄에 하나씩 적습니다.</p>
            </div>
          </SidePanelBody>
          <SidePanelFooter className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => void runPlan()} disabled={Boolean(busy)}>
              {busy?.kind === "plan" ? <><Loader2 className="mr-1.5 size-4 animate-spin" />기획하는 중…</> : "초안 다시 채우기"}
            </Button>
            <Button variant="secondary" onClick={() => void saveSlots()} disabled={saving || Boolean(busy)}>
              {saving ? "저장하는 중…" : "기획 저장"}
            </Button>
            <Button
              onClick={() => { setPlanOpen(false); void generate(); }}
              disabled={Boolean(busy)}
            >
              {busy?.kind === "generate"
                ? <><Loader2 className="mr-1.5 size-4 animate-spin" />만드는 중…</>
                : `${project.data.variants}장 만들기`}
            </Button>
          </SidePanelFooter>
        </SidePanelContent>
      </SidePanel>

      <Card>
        <CardHeader>
          <CardTitle>결과</CardTitle>
          <CardDescription>
            변형 중 하나를 고르면 그것을 기준으로 고쳐 나갑니다. 고른 것만 검수합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.some((image) => image.selected) ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-4">
              <p className="text-sm">고른 변형만 검수합니다. 글자가 원고대로 들어갔는지 봅니다.</p>
              <Button size="sm" variant="secondary" onClick={() => void review()} disabled={Boolean(busy)}>
                검수하기
              </Button>
            </div>
          ) : null}

          {/*
            **그리는 동안 결과 자리가 비어 있으면 안 된다.**

            전에는 「아직 만든 변형이 없습니다」가 그대로 있었다. 만들기를 눌러도
            대시보드는 아무 변화가 없어, 눌린 건지 아닌지 알 수 없었다
            (2026-09-08 사용자). 만들 장수만큼 빈 칸을 미리 깔면 **몇 장이 올
            자리인지**까지 함께 말한다.
          */}
          {busy?.kind === "generate" && !list.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: project.data.variants }, (_unused, index) => (
                <div
                  key={index}
                  /* **고를 비율 그대로 잡는다.** 다른 모양으로 두면 그림이 도착할 때
                     화면이 튀고, 몇 대 몇으로 나오는지도 거짓말이 된다. */
                  style={{ aspectRatio: placeholderRatio(project.ratio) }}
                  className="flex animate-pulse flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary-soft"
                >
                  <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
                  <span className="text-xs text-primary">{index + 1}번째 그림</span>
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 만든 변형이 없습니다.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((image) => (
                <figure key={image.id} className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => void select(image.id)}
                    aria-pressed={image.selected}
                    className={cn(
                      "overflow-hidden rounded-lg border-2 transition-colors",
                      image.selected ? "border-primary" : "border-transparent hover:border-border",
                    )}
                  >
                    {image.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        // 목록은 사본을 쓴다. 확대는 `data-viewer-src`, 내려받기는
                        // 아래 `downloadVariant` 가 원본 주소를 쓰므로 품질이 깎이지 않는다.
                        src={image.thumbUrl ?? image.url}
                        alt={`${project.title} · 변형 ${image.variantIndex + 1}`}
                        data-zoomable
                        data-viewer-src={image.url}
                        data-viewer-meta={viewerMeta}
                        className="w-full cursor-zoom-in"
                      />
                    ) : (
                      <div className="grid aspect-[2/3] place-items-center bg-muted text-xs text-muted-foreground">
                        미리보기 없음
                      </div>
                    )}
                  </button>
                  <figcaption className="grid gap-2 text-xs">
                    <span className={cn("font-bold", image.selected && "text-primary")}>
                      변형 {image.variantIndex + 1}{image.selected ? " · 선택됨" : ""}
                    </span>
                    {/* 만든 것은 이미 작업물로 저장돼 있다. 여기서 따로 보관할
                        일이 없다. 대신 이 한 장만 고치는 길을 둔다. */}
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void downloadVariant(image)}
                      >
                        <Download />내려받기
                      </Button>
                      <Button
                        size="sm"
                        variant={editing === image.id ? "default" : "outline"}
                        onClick={() => { void select(image.id); setEditing(editing === image.id ? null : image.id); }}
                        disabled={Boolean(busy)}
                      >
                        <Wand2 />이 장만 고치기
                      </Button>
                      {/*
                        **광고는 묻고 간다**(설계 §1 ①). 리사이징이 자동으로
                        따라붙으면 「한 장만 받고 끝내려는」 사람에게는 강요다.
                        여기서 눌러야만 그 길로 간다.

                        스위치가 꺼져 있으면 아예 안 그린다 — 눌러도 404 인
                        버튼을 보여 주면 그게 더 나쁘다.
                      */}
                      {adEnabled && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={adExportHref(project.id, image.variantIndex)}>
                            <Megaphone />광고 소재로 뽑기
                          </Link>
                        </Button>
                      )}
                    </div>
                    {editing === image.id ? (
                      <div className="grid gap-1.5 rounded-md border border-border p-2.5">
                        <Label htmlFor={`poster-edit-${image.id}`} className="text-xs">무엇을 고칠까요</Label>
                        <Textarea
                          id={`poster-edit-${image.id}`}
                          rows={2}
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          placeholder="배경을 밤으로 바꿔 주세요"
                        />
                        <p className="text-meta text-subtle-foreground">
                          이 장을 기준으로 한 장만 다시 만듭니다. 처음부터 만들지 않습니다.
                        </p>
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>취소</Button>
                          <Button size="sm" onClick={() => void edit()} disabled={Boolean(busy)}>고치기</Button>
                        </div>
                      </div>
                    ) : null}
                    {image.review ? (
                      <span
                        role={image.review.decision === "pass" ? undefined : "alert"}
                        className={cn(
                          "mt-1 block",
                          image.review.decision === "pass" ? "text-muted-foreground" : "text-destructive",
                        )}
                      >
                        {image.review.summary}
                      </span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
