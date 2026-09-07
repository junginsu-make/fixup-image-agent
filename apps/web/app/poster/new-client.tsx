"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Label, StepBar, Textarea, cn,
} from "@fixup/ui";
import { IMAGE_MODELS, MATCH_SOURCE, POSTER_RATIOS, chooseModelForRatio } from "@fixup/sns-core";
import { estimatePosterCost, MAX_VARIANTS, MIN_VARIANTS } from "@fixup/poster-core";
import { IMAGE_LOOKS, IMAGE_LOOK_HINT, IMAGE_LOOK_LABEL, type ImageLook } from "@fixup/shared";
import { takeHandoff } from "../../lib/handoff";
import { ReferencePicker, type ReferenceItem, type Role } from "./_components/reference-picker";
import { POSTER_STEPS, reachableBeforeCreate } from "./steps";
import { adSubmitPlan } from "./ad-mode";
import { planDerivation } from "../../lib/ad/derive";
import {
  PORTAL_LABEL, defaultSelection, missingRequiredCount, specRows,
} from "../ad/export-rules";

/** 규격 목록은 상수에서 나온다. 화면을 그릴 때마다 다시 셀 이유가 없다. */
const AD_ROWS = specRows(planDerivation);

export function PosterNewClient({ adEnabled = false }: { adEnabled?: boolean }) {
  const router = useRouter();
  const [references, setReferences] = React.useState<ReferenceItem[]>([]);
  const [step, setStep] = React.useState("reference");
  const [roles, setRoles] = React.useState<Record<string, Role>>({});
  const [ratio, setRatio] = React.useState("2:3");
  /**
   * 광고 모드인가.
   *
   * **일반 모드는 지금 그대로 둔다**(설계 §9 원칙 4). 포스터·카드뉴스 사용자에게
   * 광고 UI 를 강요하지 않는다 — 켜야 보인다.
   */
  const [adMode, setAdMode] = React.useState(false);
  const [adPicked, setAdPicked] = React.useState<string[]>(() => defaultSelection(AD_ROWS));
  const [modelId, setModelId] = React.useState(
    IMAGE_MODELS.find((model) => model.isDefault)?.id ?? IMAGE_MODELS[0]!.id,
  );
  const [variants, setVariants] = React.useState(3);
  const [title, setTitle] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  // 기본은 auto — 지금까지처럼 첨부한 그림의 결을 따라간다.
  const [look, setLook] = React.useState<ImageLook>("auto");
  // 기획이 채운 슬롯보다 센 말. 비워 두면 프롬프트에 들어가지 않는다.
  const [userInstruction, setUserInstruction] = React.useState("");
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

  /**
   * 읽은 목록을 **돌려준다.**
   *
   * 방금 올린 그림을 화면에 세우려면 그 줄이 필요하다. 상태로만 넘기면 부르는
   * 쪽은 자기가 올린 것이 목록에 들어왔는지 알 수 없다 — 카드뉴스 쪽
   * (attachment-picker 의 load)이 같은 이유로 이렇게 한다.
   */
  const loadReferences = React.useCallback(async (): Promise<ReferenceItem[]> => {
    try {
      const body = await (await fetch("/api/poster/references", { cache: "no-store" })).json();
      if (body.ok) {
        const fresh = (body.references ?? []) as ReferenceItem[];
        setReferences(fresh);
        return fresh;
      }
      setError(body.message ?? "참고 이미지를 불러오지 못했습니다.");
    } catch {
      setError("참고 이미지를 불러오지 못했습니다.");
    }
    return [];
  }, []);

  React.useEffect(() => { void loadReferences(); }, [loadReferences]);

  /** 한 벌의 공통 값. 광고 모드는 여기에 마스터만 얹는다. */
  function projectBody(extra: Record<string, unknown> = {}) {
    return {
      title: title.trim() || "이름 없는 이미지",
      ratio, modelId, variants,
      instruction: instruction.trim(),
      referenceIds: styleIds,
      preservedIds,
      personIds,
      look,
      userInstruction: userInstruction.trim(),
      ...extra,
    };
  }

  async function createProject(body: Record<string, unknown>): Promise<string> {
    const response = await fetch("/api/poster/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = await response.json();
    if (!parsed.ok) throw new Error(parsed.message ?? "이미지 작업을 만들지 못했습니다.");
    return parsed.project.id as string;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (adMode) {
        /**
         * **마스터마다 프로젝트를 따로 만든다**(설계 §10 3-0).
         *
         * 한 프로젝트에 마스터 둘을 넣으면 저장 경로가 겹쳐 **두 번째가 첫 번째
         * 파일을 덮고**(`{projectId}/{variantIndex}.png` + `upsert`), DB 의
         * `poster_images_one_selected` 때문에 **둘 다 고를 수도 없다.**
         *
         * **하나씩 순서대로 만든다.** 한꺼번에 보내면 실패했을 때 몇 개가
         * 만들어졌는지 알 수 없다.
         */
        const made: string[] = [];
        for (const master of adPlan.masters) {
          made.push(await createProject(projectBody({
            ratio: MATCH_SOURCE,
            adMasterId: master.id,
            title: `${title.trim() || "이름 없는 이미지"} (${master.width}×${master.height})`,
          })));
        }
        // 첫 작업으로 보낸다. 나머지는 라이브러리에 쌓이고 `/ad` 가 거기서 뽑는다.
        router.push(`/poster/${made[0]}`);
        return;
      }
      router.push(`/poster/${await createProject(projectBody())}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이미지 작업을 만들지 못했습니다.");
      setBusy(false);
    }
  }

  /**
   * 붙인 그림이 모델 상한을 넘는가.
   *
   * 서버도 막지만 거기서 막히면 만들기를 누른 뒤에야 안다. 고르는 자리에서
   * 바로 말한다 — 여기가 그림을 빼거나 모델을 바꿀 수 있는 자리다.
   */
  const referenceCount = styleIds.length + preservedIds.length;
  const overReferenceLimit = referenceCount > choice.model.maxReferenceImages;

  /**
   * **생성 전에 막는다**(설계 §4.4). 3단계는 생성이 **먼저**라, 만들 수 없는
   * 규격을 그냥 두면 돈을 쓰고 나서 「이건 못 뽑습니다」를 보게 된다.
   */
  const adPlan = adSubmitPlan(adMode ? adPicked : []);
  const adMissingRequired = missingRequiredCount(AD_ROWS, adPicked);

  const canSubmit =
    styleIds.length > 0 && instruction.trim().length > 0 && !estimate.rejected
    && !overReferenceLimit && (!adMode || adPlan.ready);

  return (
    <div className="grid gap-6">
      <div className="mb-4">
        <StepBar steps={POSTER_STEPS} current={step} onJump={setStep} allowJump={reachableBeforeCreate} />
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
              onUploaded={loadReferences}
            />
            {overReferenceLimit ? (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {choice.model.label} 은 참고 이미지를 {choice.model.maxReferenceImages}장까지 받습니다.
                지금 {referenceCount}장입니다 — 빼거나 02 규격에서 다른 모델을 고르세요.
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={() => setStep("spec")} disabled={styleIds.length === 0 || overReferenceLimit}>
                다음
              </Button>
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
            {/*
              **스위치가 꺼져 있으면 아예 안 그린다**(계약 5). 서버가 이미
              `poster-service.ts` 에서 `adMaster` 를 버리므로 두 겹이다.
            */}
            {adEnabled && (
              <fieldset className="grid gap-2">
                <legend className="text-meta text-subtle-foreground">무엇을 만드나</legend>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button" size="sm"
                    variant={adMode ? "secondary" : "default"}
                    aria-pressed={!adMode}
                    onClick={() => setAdMode(false)}
                  >
                    일반
                  </Button>
                  <Button
                    type="button" size="sm"
                    variant={adMode ? "default" : "secondary"}
                    aria-pressed={adMode}
                    onClick={() => setAdMode(true)}
                  >
                    광고 소재
                  </Button>
                </div>
              </fieldset>
            )}

            {/* **일반 모드는 지금 그대로 둔다**(설계 §9 원칙 4). */}
            {!adMode && (
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
            )}

            {adMode && (
              <fieldset className="grid gap-2">
                <legend className="text-meta text-subtle-foreground">광고 규격</legend>
                <ul className="grid gap-1">
                  {AD_ROWS.map((row) => (
                    <li key={row.spec.id}>
                      <label
                        className={cn(
                          "flex items-center gap-2 rounded px-2 py-1.5 text-sm",
                          row.supported ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed opacity-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={adPicked.includes(row.spec.id)}
                          disabled={!row.supported}
                          onChange={() => setAdPicked((current) => current.includes(row.spec.id)
                            ? current.filter((id) => id !== row.spec.id)
                            : [...current, row.spec.id])}
                        />
                        <span className="text-subtle-foreground">{PORTAL_LABEL[row.spec.portal]}</span>
                        <span>{row.spec.label}</span>
                        {row.spec.required && <span className="text-meta text-subtle-foreground">필수</span>}
                        {/* 미검증 규격임을 데이터가 말한다(설계 §11). 화면이 감추면 안 된다. */}
                        {row.spec.sourceKind === "reference" && (
                          <span className="text-meta text-subtle-foreground">참고</span>
                        )}
                        {!row.supported && (
                          <span className="text-meta text-subtle-foreground">— {row.unsupportedReason}</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>

                {/*
                  **「만들 그림 N장」을 항상 보여 준다**(설계 §9 원칙 2).
                  규격을 10개 골라도 생성은 두세 장이라는 것이 이 기능의 핵심인데,
                  안 보여 주면 사용자는 10배 과금을 걱정한다.
                */}
                <p className="text-meta">
                  <strong>만들 그림 {adPlan.masters.length}장</strong>
                  {" · "}내보낼 규격 {adPicked.length}개
                </p>

                {adMissingRequired > 0 && (
                  <p className="text-meta text-destructive" role="alert">
                    필수 규격 {adMissingRequired}개가 꺼져 있습니다. 빠지면 포털이 반려할 수 있습니다.
                  </p>
                )}
                {!adPlan.ready && adPicked.length > 0 && (
                  <p className="text-meta text-destructive" role="alert">{adPlan.reason}</p>
                )}
                <p className="text-meta text-subtle-foreground">
                  만든 뒤 <a href="/ad" className="underline">광고 규격으로 내보내기</a>에서 규격을 뽑습니다.
                </p>
              </fieldset>
            )}

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

            <fieldset className="grid gap-2">
              <legend className="text-meta text-subtle-foreground">결</legend>
              <div className="flex flex-wrap gap-2">
                {IMAGE_LOOKS.map((entry) => (
                  <Button
                    key={entry}
                    type="button"
                    size="sm"
                    variant={look === entry ? "default" : "secondary"}
                    onClick={() => setLook(entry)}
                  >
                    {IMAGE_LOOK_LABEL[entry]}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{IMAGE_LOOK_HINT[look]}</p>
            </fieldset>

            <div className="grid gap-1.5">
              <Label htmlFor="poster-user-instruction">추가 지시 · 선택</Label>
              <Textarea
                id="poster-user-instruction"
                value={userInstruction}
                onChange={(event) => setUserInstruction(event.target.value)}
                rows={3}
                placeholder="예: 배경은 밤, 창밖에 네온"
              />
              {/*
                우선순위를 화면에서 말해 둔다. 여기 적은 말은 프롬프트의 맨 앞과
                맨 뒤 두 곳에 들어가고, 첨부한 레퍼런스보다 세다.
              */}
              <p className="text-sm text-muted-foreground">
                여기 적은 말이 다른 모든 지시보다 우선합니다.
              </p>
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
