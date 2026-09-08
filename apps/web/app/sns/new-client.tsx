"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { MAX_CARDS, groupAttachments, modelById, planSlots, validateAttachments, type Attachment } from "@fixup/sns-core";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StepBar, type StepDefinition } from "@fixup/ui";
import { AttachmentPicker } from "./_components/attachment-picker";
import type { SlotIntents } from "./_components/slot-intents";
import { visibleIntents } from "./_components/slot-rows";
import { SourceInput, sourceDraftValid, type SourceDraft } from "./_components/source-input";
import { estimateCostLabel, SpecPicker, type SnsSpec } from "./_components/spec-picker";
import { takeHandoff } from "../../lib/handoff";

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
  /**
   * 자리마다 「이 그림들을 어떻게 쓸까요」 (표지/속지/엔딩).
   *
   * **한 칸으로 안 묶는다.** 표지와 속지는 원하는 것이 다르다
   * (2026-09-08 사용자 결정).
   */
  const [intents, setIntents] = React.useState<SlotIntents>({ cover: "", body: "", ending: "" });
  const [spec, setSpec] = React.useState<SnsSpec>({
    ratio: "4:5",
    cardCountMode: "auto",
    cardCount: undefined,
    language: "ko",
    modelId: "gpt-image-2",
    look: "auto",
    userInstruction: "",
  });
  const [message, setMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [fromLibrary, setFromLibrary] = React.useState<string | null>(null);

  // 라이브러리에서 「카드뉴스로」를 눌러 왔으면 내용이 이미 들어가 있어야 한다.
  // 복사해 붙이게 만들면 라이브러리에 모아 둔 뜻이 없다.
  React.useEffect(() => {
    const handoff = takeHandoff();
    if (!handoff) return;
    setTitle(handoff.title);
    if (handoff.text.trim()) setSource({ kind: "text", text: handoff.text });
    // 라이브러리에서 그림을 골라 왔으면 첨부로 이미 들어가 있어야 한다.
    // 역할은 비워 둔다 — 02 에서 사용자가 정한다.
    if (handoff.images?.length) {
      setAttachments(handoff.images.map((image) => ({
        id: image.id,
        kind: "style_reference" as const,
        // 묶음 세트에서 왔으면 그 자리를 그대로 쓴다. 낱장은 속지로 둔다.
        role: image.slot ?? ("body" as const),
        assetPath: image.assetPath,
        url: image.url,
      })));
      setStep("images");
    }
    setFromLibrary(handoff.title);
  }, []);

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
      // 화면에 없는 자리의 글은 지우고 보낸다 — 못 보는 값이 남으면 나중에 물린다.
      attachmentIntents: visibleIntents(groupAttachments(attachments), intents),
          ratio: spec.ratio,
          cardCountMode: spec.cardCountMode,
          cardCount: spec.cardCountMode === "fixed" ? spec.cardCount : undefined,
          language: spec.language,
          modelId: spec.modelId,
          look: spec.look,
          userInstruction: spec.userInstruction.trim() || undefined,
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
          {step === "content" && fromLibrary ? (
            <p role="status" className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              라이브러리의 <strong className="text-foreground">{fromLibrary}</strong> 을(를) 가져왔습니다. 고쳐서 쓰셔도 됩니다.
            </p>
          ) : null}
          {step === "content" ? <SourceInput title={title} onTitleChange={setTitle} source={source} onSourceChange={setSource} toneNote={toneNote} onToneNoteChange={setToneNote} /> : null}
          {step === "images" ? <AttachmentPicker attachments={attachments} onChange={setAttachments} modelId={spec.modelId} totalCards={totalCards} intents={intents} onIntentsChange={setIntents} /> : null}
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
