"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Label, StepBar, Textarea, cn, type StepDefinition,
} from "@fixup/ui";
import { IMAGE_MODELS, POSTER_RATIOS, chooseModelForRatio } from "@fixup/sns-core";
import { estimatePosterCost, MAX_VARIANTS, MIN_VARIANTS } from "@fixup/poster-core";
import { takeHandoff } from "../../lib/handoff";
import { ReferencePicker, type ReferenceItem, type Role } from "./_components/reference-picker";

const STEPS: StepDefinition[] = [
  { id: "reference", label: "01 레퍼런스", desc: "따라 만들 이미지" },
  { id: "spec", label: "02 규격", desc: "비율 · 모델 · 장수" },
  { id: "instruction", label: "03 지시", desc: "한 줄만" },
];

export function PosterNewClient() {
  const router = useRouter();
  const [references, setReferences] = React.useState<ReferenceItem[]>([]);
  const [step, setStep] = React.useState("reference");
  const [roles, setRoles] = React.useState<Record<string, Role>>({});
  const [ratio, setRatio] = React.useState("2:3");
  const [modelId, setModelId] = React.useState(
    IMAGE_MODELS.find((model) => model.isDefault)?.id ?? IMAGE_MODELS[0]!.id,
  );
  const [variants, setVariants] = React.useState(3);
  const [title, setTitle] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const styleIds = Object.keys(roles).filter((id) => roles[id] === "style");
  const preservedIds = Object.keys(roles).filter((id) => roles[id]?.startsWith("preserve"));
  // 사람은 지키는 방법이 다르고, 얼굴이 둘이면 제3의 인물이 나온다.
  const personIds = Object.keys(roles).filter((id) => roles[id] === "preserve_person");

  /**
   * 비율이 모델보다 우선한다.
   *
   * 고른 모델이 그 비율을 못 만들면 서버가 만들 수 있는 모델로 바꾼다.
   * 화면도 같은 판단을 미리 해서, 바뀔 거라는 것과 그때의 값을 먼저 보여준다 —
   * 만들고 나서 "왜 다른 모델로 만들어졌지" 가 되면 안 된다.
   */
  const choice = chooseModelForRatio(ratio, modelId, IMAGE_MODELS);
  const estimate = estimatePosterCost({
    modelId: choice.model.id, ratioId: ratio, variants,
    hasReferences: styleIds.length + preservedIds.length > 0,
  });

  // 라이브러리에서 「이미지로」를 눌러 왔으면 지시가 이미 들어가 있어야 한다.
  React.useEffect(() => {
    const handoff = takeHandoff();
    if (!handoff) return;
    setTitle(handoff.title);
    // 포스터는 한 줄로 시작한다. 긴 글을 그대로 넣으면 오히려 방해가 된다.
    const firstSentence = handoff.text.split(/[.\n]/)[0]?.trim();
    setInstruction(firstSentence || handoff.title);
    // 라이브러리에서 그림을 골라 왔으면 「따라 만들기」로 켜 둔다.
    // 제품·인물을 지키려는 것이면 그림을 눌러 바꾼다.
    if (handoff.images?.length) {
      setRoles(Object.fromEntries(handoff.images.map((image) => [image.id, "style" as Role])));
    }
  }, []);

  const loadReferences = React.useCallback(async () => {
    try {
      const body = await (await fetch("/api/poster/references", { cache: "no-store" })).json();
      if (body.ok) setReferences(body.references);
      else setError(body.message ?? "참고 이미지를 불러오지 못했습니다.");
    } catch {
      setError("참고 이미지를 불러오지 못했습니다.");
    }
  }, []);

  React.useEffect(() => { void loadReferences(); }, [loadReferences]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/poster/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "이름 없는 이미지",
          ratio, modelId, variants,
          instruction: instruction.trim(),
          referenceIds: styleIds,
          preservedIds,
          personIds,
        }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.message ?? "이미지 작업을 만들지 못했습니다.");
      router.push(`/poster/${body.project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이미지 작업을 만들지 못했습니다.");
      setBusy(false);
    }
  }

  const canSubmit = styleIds.length > 0 && instruction.trim().length > 0 && !estimate.rejected;

  return (
    <div className="grid gap-6">
      <div className="mb-4">
        <StepBar steps={STEPS} current={step} onJump={setStep} />
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {step === "reference" ? (
        <Card>
          <CardHeader>
            <CardTitle>쓸 이미지를 고르세요</CardTitle>
            <CardDescription>
              새로 올리거나 라이브러리에서 불러온 뒤, 그림마다 역할을 고르세요 —
              <strong className="text-foreground">따라 만들기</strong>는 레이아웃·서체·색만 가져오고,
              <strong className="text-foreground">제품/인물 그대로 지키기</strong>는 그 대상이 결과 그림에
              그대로 들어갑니다. 따라 만들 그림이 최소 한 장 필요하고, 인물은 한 명만 쓸 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ReferencePicker
              references={references}
              roles={roles}
              onRoleChange={(id, role) => setRoles((current) => ({ ...current, [id]: role }))}
              onUploaded={() => void loadReferences()}
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep("spec")} disabled={styleIds.length === 0}>다음</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "spec" ? (
        <Card>
          <CardHeader>
            <CardTitle>규격</CardTitle>
            <CardDescription>픽셀은 묻지 않습니다. 비율에서 백엔드가 정합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <fieldset className="grid gap-2">
              <legend className="text-meta text-subtle-foreground">비율</legend>
              <div className="flex flex-wrap gap-2">
                {POSTER_RATIOS.map((entry) => (
                  <Button
                    key={entry.id}
                    type="button"
                    size="sm"
                    variant={ratio === entry.id ? "default" : "secondary"}
                    onClick={() => setRatio(entry.id)}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="text-meta text-subtle-foreground">모델</legend>
              <div className="flex flex-wrap gap-2">
                {IMAGE_MODELS.map((model) => (
                  <Button
                    key={model.id}
                    type="button"
                    size="sm"
                    variant={modelId === model.id ? "default" : "secondary"}
                    onClick={() => setModelId(model.id)}
                  >
                    {model.label}
                  </Button>
                ))}
              </div>
              {/* 조용히 바꾸면 사용자는 자기가 고른 모델로 만든 줄 안다. */}
              {choice.switched ? (
                <p role="status" className="text-sm text-amber-700">{choice.reason}</p>
              ) : null}
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="text-meta text-subtle-foreground">변형 장수</legend>
              <div className="flex gap-2">
                {Array.from({ length: MAX_VARIANTS - MIN_VARIANTS + 1 }, (_unused, index) => index + MIN_VARIANTS)
                  .map((count) => (
                    <Button
                      key={count}
                      type="button"
                      size="sm"
                      variant={variants === count ? "default" : "secondary"}
                      onClick={() => setVariants(count)}
                    >
                      {count}장
                    </Button>
                  ))}
              </div>
            </fieldset>

            {estimate.rejected ? (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {estimate.rejected}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                예상 비용 ${estimate.totalUsd?.toFixed(3)} · {IMAGE_MODELS.find((model) => model.id === modelId)?.label} · {variants}장
                {estimate.approximate ? " (공표 가격표에 없는 크기라 넉넉히 잡은 값입니다)" : ""}
              </p>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setStep("instruction")} disabled={Boolean(estimate.rejected)}>다음</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "instruction" ? (
        <Card>
          <CardHeader>
            <CardTitle>무엇을 만들지 한 줄로</CardTitle>
            <CardDescription>나머지 칸은 AI 가 초안으로 채웁니다. 다음 화면에서 고칩니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="poster-title">작업 이름</Label>
              <Input
                id="poster-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="가을 사진전"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="poster-instruction">한 줄 지시</Label>
              <Textarea
                id="poster-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={3}
                placeholder="필름 카메라 감성의 사진전 포스터"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void submit()} disabled={!canSubmit || busy}>
                {busy ? "만드는 중…" : "만들기"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
