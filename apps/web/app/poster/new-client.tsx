"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
import type { AdSubmitPlan } from "./ad-mode";
import {
  adProjectBodies, canCreatePoster, effectiveRatio, posterSpecSections, projectCount,
} from "./poster-form-rules";

/**
 * **광고 규격 칸은 켜졌을 때만 내려받는다.**
 *
 * 정적으로 들이면 `AD_SPECS`(249줄)·`derive`·`export-rules` 가 스위치와 무관하게
 * **모든 포스터 사용자의 번들**에 실린다. 광고와 상관없는 사람이 이 화면의
 * 대부분인데 「기존 시스템에 영향 없음」이라고 말할 수 없다.
 */
const AdSpecPicker = dynamic(() => import("./ad-spec-picker"), {
  ssr: false,
  loading: () => <p className="text-meta text-subtle-foreground">규격을 불러오는 중…</p>,
});

/** 아직 아무것도 못 만드는 상태. **닫힌 쪽으로 시작한다.** */
const NO_AD_PLAN: AdSubmitPlan = { masters: [], ready: false };

export function PosterNewClient({ adEnabled = false }: { adEnabled?: boolean }) {
  const router = useRouter();
  const [references, setReferences] = React.useState<ReferenceItem[]>([]);
  const [step, setStep] = React.useState("reference");
  const [roles, setRoles] = React.useState<Record<string, Role>>({});
  /**
   * **고른 차례.** 이것이 화면의 ①②③ 이고 프롬프트의 `Image N` 이다.
   *
   * `roles` 는 객체라 차례를 못 담고, 화면에 그려지는 차례는 라이브러리 목록
   * 순서(최신순)라 먼저 고른 것이 뒤에 놓인다. 「①번 사람들을 ②번 느낌으로」가
   * 생각한 대로 동작하려면 **고른 차례**를 따로 들어야 한다.
   */
  const [pickOrder, setPickOrder] = React.useState<string[]>([]);
  /** 첨부한 그림들을 어떻게 쓸지. 비워 두면 프롬프트에 안 들어간다. */
  const [attachmentIntent, setAttachmentIntent] = React.useState("");

  /**
   * 역할을 바꾸면서 차례도 함께 손본다.
   *
   * 고르면 뒤에 붙이고, 빼면(`none`) 목록에서 지운다. 뺐다가 다시 고르면
   * 맨 뒤로 간다 — 그게 화면에서 보이는 것과 같다.
   */
  const changeRole = React.useCallback((id: string, role: Role) => {
    setRoles((current) => ({ ...current, [id]: role }));
    setPickOrder((current) => {
      const without = current.filter((entry) => entry !== id);
      return role === "none" ? without : [...without, id];
    });
  }, []);

  /** 고른 차례 그대로의 id 목록. 역할이 풀린 것은 뺀다. */
  const orderedIds = pickOrder.filter((id) => (roles[id] ?? "none") !== "none");
  const [ratio, setRatio] = React.useState("2:3");
  /**
   * 광고 모드인가.
   *
   * **일반 모드는 지금 그대로 둔다**(설계 §9 원칙 4). 포스터·카드뉴스 사용자에게
   * 광고 UI 를 강요하지 않는다 — 켜야 보인다.
   */
  const [adMode, setAdMode] = React.useState(false);
  /** 자식이 알려 주는 판단 결과. **규격 목록은 부모가 안 든다** — 들면 잘라 낸 뜻이 없다. */
  const [adPlan, setAdPlan] = React.useState<AdSubmitPlan>(NO_AD_PLAN);
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

  // 세 목록도 고른 차례를 따른다. 서버가 옛 작업을 읽을 때 이 차례로 이어 붙인다.
  const styleIds = orderedIds.filter((id) => roles[id] === "style");
  const preservedIds = orderedIds.filter((id) => roles[id]?.startsWith("preserve"));
  // 사람은 지키는 방법이 다르고, 얼굴이 둘이면 제3의 인물이 나온다.
  const personIds = orderedIds.filter((id) => roles[id] === "preserve_person");

  /**
   * 비율이 모델보다 우선한다.
   *
   * 고른 모델이 그 비율을 못 만들면 서버가 만들 수 있는 모델로 바꾼다.
   * 화면도 같은 판단을 미리 해서, 바뀔 거라는 것과 그때의 값을 먼저 보여준다 —
   * 만들고 나서 "왜 다른 모델로 만들어졌지" 가 되면 안 된다.
   */
  /**
   * **가드가 보는 값과 본문에 싣는 값이 같아야 한다.**
   *
   * 초판은 이 둘을 화면 상태(`ratio`, 광고 모드에서도 `"2:3"`)로 돌리고 본문에는
   * `match-source` 를 실었다. `match-source` 는 `gpt-image-2` 로만 되는데 화면이
   * `"2:3"` 로 재서 nano 계열도 통과시켰고, **모델 넷 중 셋에서 광고 모드가
   * 죽어 있었다** — 사용자는 광고와 상관없어 보이는 문구만 봤다.
   */
  const submitRatio = effectiveRatio(adMode, ratio);
  const choice = chooseModelForRatio(submitRatio, modelId, IMAGE_MODELS);
  const estimate = estimatePosterCost({
    modelId: choice.model.id, ratioId: submitRatio, variants,
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
      const ids = handoff.images.map((image) => image.id);
      setRoles(Object.fromEntries(ids.map((id) => [id, "style" as Role])));
      // 넘어온 차례가 곧 고른 차례다. 안 담으면 번호가 안 붙는다.
      setPickOrder(ids);
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
      ratio: submitRatio,
      // **화면이 「GPT Image 2 로 만듭니다」라고 말했으면 그 모델을 보낸다.**
      // 초판은 사용자가 고른 모델을 실어서, 화면의 안내와 서버가 받는 값이
      // 어긋났다 — 서버는 그 비율을 못 만드는 모델을 받아 거절했다.
      modelId: choice.model.id,
      variants,
      instruction: instruction.trim(),
      referenceIds: styleIds,
      preservedIds,
      personIds,
      // **고른 차례 그대로.** 이것이 프롬프트의 Image 번호가 된다.
      attachmentOrder: orderedIds,
      attachmentIntent: attachmentIntent.trim(),
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
        const bodies = adProjectBodies(projectBody(), adPlan.masters, title);
        const made: string[] = [];
        try {
          for (const body of bodies) made.push(await createProject(body));
        } catch (cause) {
          /**
           * **몇 개가 만들어졌는지 말해 준다.**
           *
           * 초판은 `made` 를 담아 놓고 실패하면 그냥 버렸다. 사용자는 「만들지
           * 못했습니다」만 보고 **초안이 이미 생긴 줄 모른 채** 다시 누른다 —
           * 그러면 성공했던 마스터의 초안이 하나 더 생기고, 둘 다 생성하면
           * 그때 진짜 이중 과금이다.
           */
          if (made.length > 0) {
            setError(`${bodies.length}개 중 ${made.length}개를 만들었습니다. `
              + "라이브러리에서 확인한 뒤 나머지를 다시 만들어 주세요.");
            setBusy(false);
            return;
          }
          throw cause;
        }
        // **빈 목록으로 여기 오면 `/poster/undefined` 로 보낸다.** 지금은
        // `canSubmit` 이 막지만, 그 가드 하나가 바뀌면 바로 터진다.
        const first = made[0];
        if (!first) throw new Error("만들 그림이 없습니다. 규격을 골라 주세요.");
        // 첫 작업으로 보낸다. 나머지는 라이브러리에 쌓이고 `/ad` 가 거기서 뽑는다.
        router.push(`/poster/${first}`);
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
   *
   * 광고 모드가 아니면 언제나 닫힌 값이라 `canCreatePoster` 가 무시한다.
   */
  const projects = projectCount(adMode, adPlan.masters.length);
  // 무엇을 그릴지는 순수 규칙이 정한다 — 컴포넌트 안에 두면 시험이 못 간다.
  const sections = posterSpecSections({ adEnabled, adMode });

  const canSubmit = canCreatePoster({
    styleCount: styleIds.length,
    instruction,
    estimateRejected: Boolean(estimate.rejected),
    overReferenceLimit,
    adMode,
    adReady: adPlan.ready,
  });

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
              order={orderedIds}
              onRoleChange={changeRole}
              onUploaded={loadReferences}
              intent={attachmentIntent}
              onIntentChange={setAttachmentIntent}
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
            <CardDescription>
              {/* 광고 모드에서는 비율이 아니라 **고른 규격**에서 정해진다. */}
              {adMode
                ? "픽셀은 묻지 않습니다. 고른 규격에서 백엔드가 정합니다."
                : "픽셀은 묻지 않습니다. 비율에서 백엔드가 정합니다."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {/*
              **스위치가 꺼져 있으면 아예 안 그린다**(계약 5). 서버가 이미
              `poster-service.ts` 에서 `adMaster` 를 버리므로 두 겹이다.
            */}
            {sections.includes("mode-toggle") && (
              <fieldset className="grid gap-2">
                <legend className="text-meta text-subtle-foreground">만들 것</legend>
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
            {sections.includes("ratio") && (
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

            {sections.includes("ad-specs") && (
              <AdSpecPicker onPlanChange={(plan) => setAdPlan(plan)} />
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
              adMode && adPlan.masters.length === 0 ? (
              /*
                **「0장 만드는데 $0.657」을 보이면 안 된다.** `projectCount` 가
                0 을 곱하지 않는 것은 「무료로 보이면 안 된다」는 이유인데, 만들
                것이 없을 때 금액만 남기면 그 판단이 화면에서 거꾸로 읽힌다.

                **까닭은 여기서 되풀이하지 않는다.** 규격 칸이 이미 같은 문장을
                말하고 있고(`ad-spec-picker.tsx`), 두 곳에 다른 크기로 적으면
                한 화면에서 같은 말이 두 번 보인다. 고칠 수 있는 자리는 규격
                칸이므로 사유는 거기 맡기고 여기서는 금액이 없는 이유만 말한다.
              */
              <p className="text-sm text-muted-foreground">
                고른 규격으로는 아직 만들 그림이 없습니다. 위에서 규격을 확인해 주세요.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {/*
                  **프로젝트 수를 곱한다.** 광고 모드의 한 번 클릭은 마스터마다
                  프로젝트를 만든다(설계 3-0). 안 곱하면 「만들 그림 2장」 바로
                  아래에서 한 장 값을 보여 주게 된다 — §9 원칙 2 가 「10배 과금을
                  걱정하지 않게 하려고」 넣은 자리에서 **실제보다 낮은 금액**을
                  보여 주는 셈이다.

                  모델도 **실제로 쓸 모델**을 적는다. 고른 모델을 적으면 화면이
                  「GPT Image 2 로 만듭니다」라고 말해 놓고 그 옆에서 다른 이름을
                  보여 준다.
                */}
                예상 비용 ${((estimate.totalUsd ?? 0) * projects).toFixed(3)} · {choice.model.label}
                {adMode
                  ? ` · 그림 ${adPlan.masters.length}장 × 변형 ${variants}장 = ${adPlan.masters.length * variants}장`
                  : ` · ${variants}장`}
                {estimate.approximate ? " (공표 가격표에 없는 크기라 넉넉히 잡은 값입니다)" : ""}
              </p>
            )
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
