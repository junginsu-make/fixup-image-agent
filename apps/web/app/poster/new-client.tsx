"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Label, StepBar, Textarea, cn,
} from "@fixup/ui";
import { IMAGE_MODELS, MATCH_SOURCE, POSTER_RATIOS, RATIO_USES, chooseModelForRatio } from "@fixup/sns-core";
import {
  DEFAULT_VARIANTS, estimatePosterCost, MAX_VARIANTS, MIN_VARIANTS,
} from "@fixup/poster-core";
import { nextPickOrder, visibleOrder, withJosa } from "@fixup/shared";
import {
  IMAGE_LOOK_HINT, IMAGE_LOOK_LABEL, lookBlockedReason, looksFor, resolveLook, type ImageLook,
} from "@fixup/shared";
import { takeHandoff } from "../../lib/handoff";
import { ReferencePicker, type ReferenceItem, type Role } from "./_components/reference-picker";
import { POSTER_STEPS, reachableBeforeCreate } from "./steps";
import { posterSeed } from "./rerun-seed";
import { looksFinished, type PromptMode } from "./prompt-mode";
import type { AdSubmitPlan } from "./ad-mode";
import {
  adProjectBodies, canCreatePoster, effectiveRatio, posterSpecSections, projectCount } from "./poster-form-rules";

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

/**
 * 「꼭 지킬 말」 칸의 예시.
 *
 * **그림 얘기만 적는 칸이 아니다.** 이 말은 프롬프트 맨 앞과 맨 뒤에 들어가
 * 첨부한 그림보다도 세다(`userInstructionHead`). 글자 처리·구도·피할 것까지
 * 무엇이든 적을 수 있는데, 예시가 「배경은 밤」 하나뿐이라 그렇게 안 읽혔다
 * (2026-09-16 사용자 보고).
 *
 * 특히 한글은 이 프롬프트 어디에도 지시가 없어서, 사용자가 여기 적는 것이
 * 유일한 길이다.
 */
const PROMPT_NAIL_EXAMPLES = [
  "예: 한국어가 깨지지 않게",
  "예: 포스터처럼 만들어 주세요",
  "예: 사람 얼굴은 정면으로",
].join("\n");

export function PosterNewClient({ adEnabled = false }: { adEnabled?: boolean }) {
  const router = useRouter();
  /**
   * 이미 만든 작업의 **지난 단계로 돌아온 것인가.**
   *
   * `/poster/new?from={작업}` 으로 온다. 전에는 이 화면이 늘 비어 있어서,
   * 01~03 을 누른 사람은 「다 초기화됐다」고 읽었다(2026-09-16 사용자 보고).
   */
  const rerunFrom = useSearchParams().get("from") ?? "";
  /** 첫 그림에서부터 잠가야 한다 — 상태 기본값으로 쓴다. */
  const rerunFromInitial = rerunFrom;
  /** 값을 들고 왔다고 화면에 적을 것. 못 가져온 참고 이미지 수까지 말한다. */
  const [rerun, setRerun] = React.useState<
    { title: string; missing: number; adWork: boolean } | null
  >(null);
  /**
   * 지난 값을 **아직 기다리는 중인가.**
   *
   * 기다리는 동안 01 이 빈 채로 입력을 받으면, 값이 닿는 순간 친 글이
   * 덮어써진다 — 고치려던 「다 초기화됐다」와 똑같이 읽힌다(2026-09-16 독립
   * 리뷰). 그래서 닿을 때까지 화면을 안 내준다.
   */
  const [seeding, setSeeding] = React.useState(Boolean(rerunFromInitial));
  const [references, setReferences] = React.useState<ReferenceItem[]>([]);
  // 「무엇을 만들까」부터 묻는다. 까닭은 `steps.ts` 머리말에.
  const [step, setStep] = React.useState("instruction");
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
   *
   * **이미 있는 것은 자리를 안 옮긴다.** 역할만 바꾸는 것(따라 만들기 →
   * 인물 지키기)은 고르는 일이 아니다. 옮기면 ①번 드롭다운을 건드렸다는
   * 이유로 그 그림이 맨 뒤로 밀리고, 「①번을」이라고 쓴 지시가 다른 그림에
   * 붙는다.
   */
  const changeRole = React.useCallback((id: string, role: Role) => {
    setRoles((current) => ({ ...current, [id]: role }));
    // 규칙은 `@fixup/poster-core` 가 갖는다. 여기 또 적으면 둘이 갈린다.
    setPickOrder((current) => nextPickOrder(current, id, role !== "none"));
  }, []);

  /**
   * 고른 차례 그대로의 id 목록.
   *
   * **보이는 것과 보내는 것을 같게 한다.** 화면은 `references` 에 없는 id 를
   * 지우고 번호를 다시 매기는데, 여기서 안 지우면 그 뒤 번호가 전부 1씩 밀린다.
   *
   * 그런 id 가 생기는 길이 있다 — 여러 장을 올리다 중간에 실패하면 앞의 것에는
   * 역할이 붙지만 목록 다시 읽기를 건너뛴다. 그러면 화면에는 안 보이는데
   * 서버로는 가고, 「①번을」이라고 쓴 지시가 본 적도 없는 그림을 가리킨다
   * (2026-09-07 리뷰).
   */
  const orderedIds = visibleOrder(
    pickOrder,
    (id) => (roles[id] ?? "none") !== "none",
    (id) => references.some((entry) => entry.id === id),
  );
  const [ratio, setRatio] = React.useState("2:3");
  /**
   * 광고 모드인가.
   *
   * **일반 모드는 지금 그대로 둔다**(설계 §9 원칙 4). 포스터·카드뉴스 사용자에게
   * 광고 UI 를 강요하지 않는다 — 켜야 보인다.
   */
  const [adMode, setAdMode] = React.useState(false);
  /**
   * **쓴 그대로 보낼지, AI 가 다듬을지.**
   *
   * 완성된 프롬프트를 01 에 넣은 사람이 그것을 잃었다(2026-09-16 사용자
   * 보고). 알아채면 묻고(`looksFinished`), 고르는 것은 사람이 한다.
   *
   * 기본은 `assisted` 다 — 지금까지의 동작이라야 쓰던 사람이 안 깨진다.
   */
  const [promptMode, setPromptMode] = React.useState<PromptMode>("assisted");
  /** 한 번 고르면 다시 안 묻는다. 같은 것을 되풀이해 물으면 안 읽게 된다. */
  const [modeAnswered, setModeAnswered] = React.useState(false);
  /** 자식이 알려 주는 판단 결과. **규격 목록은 부모가 안 든다** — 들면 잘라 낸 뜻이 없다. */
  const [adPlan, setAdPlan] = React.useState<AdSubmitPlan>(NO_AD_PLAN);
  const [modelId, setModelId] = React.useState(
    IMAGE_MODELS.find((model) => model.isDefault)?.id ?? IMAGE_MODELS[0]!.id,
  );
  // 기본은 1장. 숫자는 `poster-core` 가 갖는다 — 화면에 박으면 둘이 갈린다.
  const [variants, setVariants] = React.useState(DEFAULT_VARIANTS);
  const [title, setTitle] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  /*
   * **미리 채워 주던 것을 걷어냈다.**
   *
   * 예전에는 01 레퍼런스에 적은 「이 그림을 어떻게 쓸까요」를 03 한 줄 지시에
   * 옮겨 적어 줬다 — 같은 말을 두 번 쓰게 만들어서 생긴 땜질이었다
   * (2026-09-08 사용자). 지시가 맨 앞으로 오면서 두 질문이 더 이상 겹치지
   * 않는다: 01은 「무엇을 만들까」, 02는 「이 그림을 어떻게 쓸까」다.
   */
  // 기본은 auto — 첨부가 있으면 그 결을 따라간다. 없으면 `resolveLook` 이 내린다.
  const [look, setLook] = React.useState<ImageLook>("auto");
  // 기획이 채운 슬롯보다 센 말. 비워 두면 프롬프트에 들어가지 않는다.
  const [userInstruction, setUserInstruction] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 세 목록도 고른 차례를 따른다. 서버가 옛 작업을 읽을 때 이 차례로 이어 붙인다.
  const styleIds = orderedIds.filter((id) => roles[id] === "style");
  const preservedIds = orderedIds.filter((id) => roles[id]?.startsWith("preserve"));
  /**
   * 따라 만들 그림이 있는가. **이 하나로 전부 갈린다** — 고를 수 있는 결
   * (`looksFor`), 값 계산의 모드(t2i·i2i), 그리고 서버가 부를 엔드포인트
   * (`pickEndpoint`)까지.
   */
  const hasReferences = styleIds.length + preservedIds.length > 0;
  /**
   * 화면에 켜 보일 결.
   *
   * 첨부가 없으면 `auto` 가 목록에서 빠지는데(`looksFor`), 상태에는 `auto` 가
   * 남아 있을 수 있다 — 붙였다 뺀 경우다. 그때 아무 칸도 안 켜지면 「아무것도
   * 안 골랐다」로 읽힌다. 실제로 갈 값을 그대로 켠다.
   */
  const shownLook = resolveLook(look, hasReferences);
  // 사람은 지키는 방법이 다르고, 얼굴이 둘이면 제3의 인물이 나온다.
  //
  // **그림 느낌만 바꾸는 사람도 사람 목록에 넣는다**(설계 §4-3). 얼굴을 지키는
  // 것은 같고, 「인물은 한 명만」도 함께 걸려야 한다. 다른 점은 그림 느낌을
  // 바꿔도 되느냐 하나뿐이라 그것만 따로 든다.
  const personIds = orderedIds.filter(
    (id) => roles[id] === "preserve_person" || roles[id] === "preserve_person_restyled",
  );
  const restyledIds = orderedIds.filter((id) => roles[id] === "preserve_person_restyled");

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
    hasReferences,
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

  /*
    **지난 단계로 돌아온 길이면 여기서 안 읽는다.** 아래 효과가 어차피 읽는데,
    둘 다 읽으면 화면 한 번에 같은 목록을 두 번 받아 온다 — 사용자가
    「끊긴다」고 말한 그 무게를 이 화면에 다시 얹는 셈이다.
  */
  React.useEffect(() => {
    if (rerunFrom) return;
    void loadReferences();
  }, [loadReferences, rerunFrom]);

  /**
   * 지난 단계로 돌아왔으면 **그때 쓰던 값을 심는다.**
   *
   * **참고 이미지를 먼저 읽는다.** 무엇을 볼 수 있는지 알아야 못 가져오는 것을
   * 가려낼 수 있다 — 골라 둔 채로 두면 화면에는 ①②③ 이 서는데 실제로는 아무
   * 그림도 없다.
   *
   * **회원용 길이 404 면 관리자 통로에 한 번 더 묻는다.** 관리자는 모든 회원의
   * 작업을 다시 만들 수 있어야 한다(2026-09-16 사용자 결정). 회원용 길에
   * 관리자 예외를 심지 않는 것은 이 저장소의 규칙이다.
   */
  React.useEffect(() => {
    if (!rerunFrom) return;
    let alive = true;
    void (async () => {
      const visible = new Set((await loadReferences()).map((item) => item.id));
      if (!alive) return;

      const read = async (url: string) => {
        try {
          const response = await fetch(url, { cache: "no-store" });
          return { status: response.status, body: await response.json().catch(() => null) };
        } catch {
          return { status: 0, body: null };
        }
      };

      let found = await read(`/api/poster/projects/${encodeURIComponent(rerunFrom)}`);
      if (!found.body?.ok && found.status === 404) {
        found = await read(`/api/admin/works/poster/${encodeURIComponent(rerunFrom)}`);
      }
      const project = found.body?.project ?? found.body?.work;
      if (!alive) return;
      if (!project) {
        setError("지난 단계의 값을 불러오지 못했습니다. 처음부터 채워 주세요.");
        // 못 불러와도 화면은 내준다 — 잠긴 채로 두면 아무것도 못 한다.
        setSeeding(false);
        return;
      }

      const seed = posterSeed(project, visible);
      setTitle(seed.title);
      setInstruction(seed.instruction);
      setRatio(seed.ratio);
      if (seed.modelId) setModelId(seed.modelId);
      setVariants(seed.variants);
      setLook(seed.look);
      setPromptMode(seed.promptMode);
      // 한 번 고른 것으로 친다. 값을 들고 왔는데 또 물으면 성가시다.
      setModeAnswered(true);
      setUserInstruction(seed.userInstruction);
      setAttachmentIntent(seed.attachmentIntent);
      setRoles(seed.roles);
      setPickOrder(seed.pickOrder);
      setRerun({
        title: seed.title,
        missing: seed.missingReferences,
        // 광고 작업은 비율이 `match-source` 고 마스터 픽셀을 따로 든다.
        adWork: seed.ratio === "match-source",
      });
      setSeeding(false);
    })();
    return () => { alive = false; };
  }, [rerunFrom, loadReferences]);

  /** 한 벌의 공통 값. 광고 모드는 여기에 마스터만 얹는다. */
  function projectBody(extra: Record<string, unknown> = {}) {
    return {
      title: title.trim() || "이름 없는 이미지",
      // 기획을 돌릴지가 여기서 갈린다. 서버도 이 값으로 판단한다.
      promptMode,
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
      restyledIds,
      // **고른 차례 그대로.** 이것이 프롬프트의 Image 번호가 된다.
      attachmentOrder: orderedIds,
      attachmentIntent: attachmentIntent.trim(),
      // **화면에 켜 보인 것을 그대로 보낸다.** `auto` 는 따라갈 첨부가 있어야
      // 뜻이 있어서, 첨부가 없으면 여기서 실사로 내려간다(`resolveLook`).
      look: shownLook,
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

      {/*
        **값을 들고 왔다고 말한다.** 안 적으면 사용자는 이 화면이 원래 작업을
        고치는 곳인 줄 안다 — 만들기를 누르면 새 작업이 하나 더 생긴다.
      */}
      {/*
        **기다리는 동안 칸을 안 내준다.** 빈 채로 입력을 받으면 값이 닿는
        순간 친 글이 덮어써진다 — 고치려던 「다 초기화됐다」와 똑같이 읽힌다
        (2026-09-16 독립 리뷰). 아래 단계 내용도 이 값으로 함께 막는다.
      */}
      {seeding ? (
        <div role="status" className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          지난 값을 불러오는 중입니다…
        </div>
      ) : null}

      {rerun ? (
        <div role="status" className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <b>「{rerun.title || "이름 없는 이미지"}」</b> 의 값을 가져왔습니다. 고쳐서 만들면
          <b> 새 작업</b>이 하나 더 생기고 원래 작업은 그대로 남습니다.
          {rerun.missing ? (
            <span className="mt-1 block text-muted-foreground">
              {/*
                **원인을 단정하지 않는다.** 이 수는 「지금 내 목록에 없는 것」일
                뿐이다 — 내가 그 그림을 지웠거나 팀을 옮겨 범위 밖으로 나간
                경우에도 여기에 센다(2026-09-16 독립 리뷰).
              */}
              참고 이미지 {rerun.missing}장은 지금 내 목록에 없어 가져오지 못했습니다.
              다른 회원의 것이거나, 지운 그림일 수 있습니다.
            </span>
          ) : null}
          {/*
            **광고 작업은 규격을 못 들고 온다.** 광고는 `ratio: "match-source"` 와
            마스터 픽셀(`data.adMaster`)로 저장되는데 씨앗은 비율만 들고 온다.
            말 안 하면 「값을 가져왔습니다」를 믿고 그대로 만들어, 마스터 크기가
            아니라 첨부 그림 크기로 나온다(2026-09-16 독립 리뷰).
          */}
          {rerun.adWork ? (
            <span className="mt-1 block text-muted-foreground">
              이 작업은 <b>광고 규격</b>으로 만든 것입니다. 규격은 가져오지 못했으니
              03에서 다시 골라 주세요.
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!seeding && step === "reference" ? (
        <Card>
          <CardHeader>
            <CardTitle>쓸 이미지를 고르세요</CardTitle>
            <CardDescription>
              새로 올리거나 라이브러리에서 불러온 뒤, 그림마다 역할을 고르세요.
              <strong className="text-foreground">따라 만들기</strong>는 레이아웃·서체·색만 가져오고,
              <strong className="text-foreground">제품/인물 그대로 지키기</strong>는 그 대상이 결과 그림에
              그대로 들어갑니다. <strong className="text-foreground">안 붙여도 됩니다</strong>. 그때는
              01에 적은 글만 보고 그립니다. 인물은 한 명만 쓸 수 있습니다.
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
                지금 {referenceCount}장입니다. 빼거나 02 규격에서 다른 모델을 고르세요.
              </div>
            ) : null}
            {/*
              **결은 여기서 고른다.** 「레퍼런스 따라가기」가 뜻을 가지려면 따라갈
              그림이 있어야 하는데, 그것이 정해지는 자리가 바로 여기다. 01에 두면
              아직 모르는 것을 묻게 된다. 첨부가 없으면 목록에서 그 칸이 빠진다
              (`looksFor`).
            */}
            <fieldset className="grid gap-2">
              <legend className="text-meta text-subtle-foreground">그림체 · 무엇으로 그릴까</legend>
              <div className="flex flex-wrap gap-2">
                {looksFor().map((entry) => {
                  /*
                    **빼지 않고 흐리게 둔다.**

                    처음에는 첨부가 없으면 「레퍼런스 스타일」을 목록에서 뺐다.
                    그랬더니 그런 기능이 있다는 것을 알 길이 없었다 — 사용자가
                    화면을 보며 「auto 가 어디 있냐」고 물었다(2026-09-16).
                    못 누르게만 막으면 배울 수 있다.
                  */
                  const blocked = lookBlockedReason(entry, hasReferences);
                  return (
                    <Button
                      key={entry}
                      type="button"
                      size="sm"
                      variant={shownLook === entry ? "default" : "secondary"}
                      disabled={Boolean(blocked)}
                      title={blocked || IMAGE_LOOK_HINT[entry]}
                      onClick={() => setLook(entry)}
                    >
                      {IMAGE_LOOK_LABEL[entry]}
                    </Button>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">{IMAGE_LOOK_HINT[shownLook]}</p>
              {/* 회색 버튼만 두면 고장으로 읽힌다. 무엇을 하면 눌리는지 적는다. */}
              {lookBlockedReason("auto", hasReferences) ? (
                <p className="text-xs text-subtle-foreground">
                  {/* 받침에 따라 은/는이 갈린다. 저장소에 이미 도구가 있다. */}
                  「{IMAGE_LOOK_LABEL.auto}」{withJosa(IMAGE_LOOK_LABEL.auto, "은는").slice(-1)}{" "}
                  {lookBlockedReason("auto", hasReferences)}
                </p>
              ) : null}
            </fieldset>

            <div className="flex justify-end">
              {/* 첨부는 선택이다. 넘치는 것만 막는다. */}
              <Button onClick={() => setStep("spec")} disabled={overReferenceLimit}>
                다음
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!seeding && step === "spec" ? (
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
                {/*
                  **버튼을 늘리지 않고 길잡이만 단다.**

                  유튜브 썸네일은 1280x720 = 정확히 16:9 라 이미 만들 수 있는데,
                  버튼이 「가로 배너 16:9」라 그게 그거인 줄 몰랐다(2026-09-16
                  사용자 보고). 같은 픽셀을 새 항목으로 두면 목록에 같은 것이
                  둘 생긴다 — `ratio-uses.ts` 머리말 참조.
                */}
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle-foreground">
                  {RATIO_USES.map((use) => (
                    <span key={use.ratioId}>
                      {use.label} → <strong className="font-bold text-muted-foreground">{use.ratioId}</strong>
                    </span>
                  ))}
                </p>
              </fieldset>
            )}

            {sections.includes("ad-specs") && (
              <div className="grid gap-3">
                {/*
                  **여기는 규격마다 새로 그린다.** 옆의 「광고 규격으로
                  내보내기」는 이미 만든 그림에서 잘라 뽑아 거의 값이 안 든다.
                  화면이 장수는 적었지만 싼 길이 있다는 것은 안 적었다
                  (2026-09-16 사용자 보고).
                */}
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  여기서는 <strong className="text-foreground">규격마다 새로 그립니다</strong>. 고른 수만큼 값이 듭니다.
                  이미 만들어 둔 그림이 있으면{" "}
                  <Link href="/ad" className="font-bold text-primary underline-offset-2 hover:underline">
                    광고 규격으로 내보내기
                  </Link>
                  가 거의 값이 안 듭니다.
                </p>
                <AdSpecPicker onPlanChange={(plan) => setAdPlan(plan)} />
              </div>
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
              {/* 마지막 칸이다. 값을 보여 준 자리에서 바로 만든다. */}
              <Button onClick={() => void submit()} disabled={!canSubmit || busy}>
                {busy ? "만드는 중…" : "만들기"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!seeding && step === "instruction" ? (
        <Card>
          <CardHeader>
            <CardTitle>무엇을 만들까</CardTitle>
            <CardDescription>한두 줄이면 됩니다. 완성된 프롬프트가 있으면 아래 칸에 그대로 넣으세요.</CardDescription>
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
              <Label htmlFor="poster-instruction">무엇을 만들까 · 한두 줄</Label>
              <Textarea
                id="poster-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={6}
                placeholder="필름 카메라 감성의 사진전 포스터"
              />
              {/*
                **두 칸이 정반대로 동작한다는 것을 적는다.**

                이 칸은 AI 가 읽고 다시 쓰고, 아래 칸은 손 안 대고 그대로 간다.
                이름만으로는 알 길이 없어서 완성된 프롬프트를 여기 넣은 사람이
                그것을 잃었다(2026-09-16 사용자 보고).
              */}
              <p className="text-xs text-subtle-foreground">
                편하게 쓰세요. AI 가 구도·색·문구를 정해 04 기획 확인에서 보여드립니다.
                <br />
                <strong className="text-muted-foreground">완성된 프롬프트가 있으면 여기에 그대로 넣으세요.</strong>
                {" "}알아보고 여쭤봅니다.
              </p>

              {/*
                **알아채면 묻는다. 대신 정하지 않는다.**

                오판해도 사용자가 고르므로 손해가 없다. 한 번 고르면 다시 안
                묻는다 — 같은 것을 되풀이해 물으면 알림을 안 읽게 된다
                (설계 §3.1).
              */}
              {!modeAnswered && looksFinished(instruction) ? (
                <div
                  role="status"
                  className="grid gap-2 rounded-md border border-primary/30 bg-primary-soft/30 px-4 py-3"
                >
                  <p className="text-sm">
                    <strong className="text-foreground">완성된 프롬프트로 보입니다.</strong>{" "}
                    AI 가 다듬으면 세부 지시가 사라질 수 있습니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => { setPromptMode("verbatim"); setModeAnswered(true); }}
                    >
                      그대로 생성
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => { setPromptMode("assisted"); setModeAnswered(true); }}
                    >
                      AI가 다듬어서 생성
                    </Button>
                  </div>
                </div>
              ) : null}

              {/*
                고른 뒤에도 무엇을 골랐는지 보인다. 바꿀 수도 있다 — 되돌릴 길이
                없으면 잘못 누른 사람이 작업을 새로 만들어야 한다.
              */}
              {modeAnswered ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {promptMode === "verbatim"
                    ? "쓴 글을 그대로 모델에 보냅니다. AI 가 고치지 않습니다."
                    : "AI 가 다듬어 04 기획 확인에서 보여드립니다."}
                  <button
                    type="button"
                    className="font-bold text-primary underline-offset-2 hover:underline"
                    onClick={() => setModeAnswered(false)}
                  >
                    바꾸기
                  </button>
                </p>
              ) : null}
            </div>

            {/*
              01에서 적은 말을 여기서 다시 보여준다.

              **여기가 우선순위를 정하는 자리이기 때문이다.** 바로 아래 「추가
              지시」가 다른 모든 지시보다 세다고 적어 두었는데, 정작 01에 무엇을
              적었는지는 이 화면에서 볼 수 없었다. 그러면 같은 말을 두 번 쓰거나
              서로 반대되는 말을 적어 놓고 모른다.

              **여기서 고치게 하지는 않는다.** 입력 칸은 01 하나뿐이어야 한다 —
              두 곳에 두면 어느 쪽이 진짜인지 사람이 판단해야 한다.
            */}
            {attachmentIntent.trim() ? (
              <div className="grid gap-1.5 rounded-md border border-border bg-muted/40 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-meta text-subtle-foreground">01에서 첨부한 그림에 대해 적은 말</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setStep("reference")}>
                    고치기
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-sm">{attachmentIntent.trim()}</p>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              {/*
                **접어 둔다.** 칸 둘이 나란히 펼쳐져 있으니 「둘 다 써야 하나」로
                읽혔다(2026-09-16 사용자 보고). 이건 선택이고, 대부분은 위 칸
                하나로 끝난다.

                **이름도 바로잡는다.** 「직접 쓴 프롬프트」는 4번(쓴 그대로
                생성)이 생기기 전 이름이다. 지금 완성 프롬프트의 자리는 위
                칸이고, 이 칸은 프롬프트 **맨 앞과 맨 뒤 두 곳**에 들어가는
                짧은 못이다(2026-09-04 실측. 긴 프롬프트에서 중간은 힘을
                잃는다). 200자를 넣으면 400자가 실린다.
              */}
              <details className="rounded-md border border-border bg-muted/30">
                <summary className="cursor-pointer px-4 py-2.5 text-sm">
                  <span className="font-bold">꼭 지킬 말이 있나요?</span>{" "}
                  <span className="text-muted-foreground">선택 · 눌러서 펼치기</span>
                </summary>
                <div className="grid gap-1.5 border-t border-border px-4 py-3">
                  <Label htmlFor="poster-user-instruction">꼭 지킬 말</Label>
                  <Textarea
                    id="poster-user-instruction"
                    value={userInstruction}
                    onChange={(event) => setUserInstruction(event.target.value)}
                    rows={4}
                    placeholder={PROMPT_NAIL_EXAMPLES}
                  />
                  <p className="text-xs leading-5 text-subtle-foreground">
                    무엇이든 적을 수 있습니다. 그림의 결, 글자 처리, 구도, 피해야 할 것.
                    이 말은 프롬프트 <strong className="text-muted-foreground">맨 앞과 맨 뒤에 두 번</strong>{" "}
                    들어가 첨부한 그림보다도 셉니다.
                    <br />
                    한두 줄만 적으세요. 길게 쓰면 두 번 다 길어집니다.
                    완성된 프롬프트는 위 칸에 넣으세요.
                  </p>
                </div>
              </details>
            </div>

            <div className="flex justify-end">
              {/* 제목과 지시가 있어야 다음이 뜻이 있다. 나머지는 다음 칸에서 정한다. */}
              <Button
                onClick={() => setStep("reference")}
                disabled={!title.trim() || !instruction.trim()}
              >
                다음
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
