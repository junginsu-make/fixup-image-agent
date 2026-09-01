"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { MAX_CARDS, modelById, planSlots, validateAttachments, type Attachment } from "@fixup/sns-core";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StepBar, type StepDefinition } from "@fixup/ui";
import { AttachmentPicker } from "./_components/attachment-picker";
import { SourceInput, sourceDraftValid, type SourceDraft } from "./_components/source-input";
import { estimateCostLabel, SpecPicker, type SnsSpec } from "./_components/spec-picker";

const STEPS: StepDefinition[] = [
  { id: "content", label: "01 내용", desc: "직접 쓰거나 가져오기" },
  { id: "images", label: "02 이미지", desc: "종류·역할·자리" },
  { id: "spec", label: "03 규격", desc: "비율·장수·언어·모델" },
  { id: "copy", label: "04 원고 확인", desc: "Task 13" },
  { id: "result", label: "05 결과", desc: "Task 13" },
];

type Step = "content" | "images" | "spec";

export function NewSnsClient() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("content");
  const [title, setTitle] = React.useState("");
  const [source, setSource] = React.useState<SourceDraft>({ kind: "text", text: "" });
  const [toneNote, setToneNote] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [spec, setSpec] = React.useState<SnsSpec>({
    ratio: "4:5",
    cardCountMode: "auto",
    cardCount: undefined,
    language: "ko",
    modelId: "gpt-image-2",
  });
  const [message, setMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const totalCards = spec.cardCountMode === "fixed" ? spec.cardCount! : MAX_CARDS;
  const attachmentIssues = validateAttachments(attachments, modelById(spec.modelId).maxReferenceImages, totalCards);
  const slotPlan = planSlots({
    requested: spec.cardCountMode === "fixed" ? spec.cardCount : "auto",
    placeAsIsCount: attachments.filter((attachment) => attachment.kind === "place_as_is").length,
    hasEndingImage: attachments.some((attachment) => attachment.kind === "ending"),
  });

  function nextFromContent() {
    if (!title.trim()) return setMessage("프로젝트 제목을 적어 주세요.");
    if (!sourceDraftValid(source)) return setMessage("내용 입력을 확인해 주세요.");
    setMessage("");
    setStep("images");
  }

  function nextFromImages() {
    if (attachmentIssues.length) return setMessage(attachmentIssues.join("\n"));
    setMessage("");
    setStep("spec");
  }

  async function createProject() {
    const issues = [...attachmentIssues, ...slotPlan.issues];
    if (issues.length) return setMessage(issues.join("\n"));
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/sns/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          source,
          toneNote: toneNote.trim() || undefined,
          attachments,
          ratio: spec.ratio,
          cardCountMode: spec.cardCountMode,
          cardCount: spec.cardCountMode === "fixed" ? spec.cardCount : undefined,
          language: spec.language,
          modelId: spec.modelId,
        }),
      });
      const payload = await response.json() as { ok?: boolean; project?: { id: string }; message?: string };
      if (!response.ok || !payload.project) throw new Error(payload.message ?? "프로젝트를 만들지 못했습니다.");
      const planned = await fetch(`/api/sns/projects/${payload.project.id}/plan`, { method: "POST" });
      await planned.json();
      router.push(`/sns/${payload.project.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "프로젝트를 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8">
      <header>
        <p className="text-meta text-subtle-foreground">CARD NEWS STUDIO</p>
        <h1 className="mt-1 text-h1">카드뉴스 만들기</h1>
        <p className="mt-2 max-w-3xl text-body text-muted-foreground">내용을 정하고, 레퍼런스와 원본 장의 역할·자리를 고른 뒤 게시 규격을 선택합니다.</p>
      </header>

      <StepBar steps={STEPS} current={step} onJump={(id) => setStep(id as Step)} />

      <Card>
        <CardHeader>
          <CardTitle>{step === "content" ? "01 내용" : step === "images" ? "02 이미지" : "03 규격"}</CardTitle>
          <CardDescription>{step === "content" ? "내용을 넣는 네 가지 길 중 하나를 고릅니다." : step === "images" ? "이미지를 고르고 생성 모델이 다룰 방법을 지정합니다." : "해상도 대신 게시 비율과 장수·언어·모델만 고릅니다."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8">
          {step === "content" ? <SourceInput title={title} onTitleChange={setTitle} source={source} onSourceChange={setSource} toneNote={toneNote} onToneNoteChange={setToneNote} /> : null}
          {step === "images" ? <AttachmentPicker attachments={attachments} onChange={setAttachments} modelId={spec.modelId} totalCards={totalCards} /> : null}
          {step === "spec" ? <SpecPicker spec={spec} onChange={setSpec} attachments={attachments} /> : null}

          {message ? <p role="alert" className="whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{message}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-6">
            <div>{step !== "content" ? <Button variant="secondary" onClick={() => setStep(step === "spec" ? "images" : "content")}><ArrowLeft className="size-4" />이전</Button> : null}</div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {step === "spec" ? <span className="text-sm font-semibold text-primary">{estimateCostLabel(spec, attachments)}</span> : null}
              {step === "content" ? <Button onClick={nextFromContent}>이미지 고르기<ArrowRight className="size-4" /></Button> : null}
              {step === "images" ? <Button onClick={nextFromImages}>규격 고르기<ArrowRight className="size-4" /></Button> : null}
              {step === "spec" ? <Button onClick={() => void createProject()} disabled={saving}>{saving ? "저장 중…" : "기획 시작"}</Button> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
