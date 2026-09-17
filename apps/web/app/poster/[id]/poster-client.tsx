"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { TYPE_INTERACTIONS, previewPosterPrompt, type PosterSlots } from "@fixup/poster-core";
import { restoreAttachments, type ImageLook } from "@fixup/shared";
import { downloadImage } from "../../_components/image-viewer";
import { useRunningJobs } from "../../_components/running-jobs";
import { jobId } from "../../../lib/running-jobs";
import { currentPosterStep, posterSteps, reachableBeforeCreate } from "../steps";
import { modelDisplayName } from "../../../lib/model-name";
import { billableFetch } from "../../../lib/billable-fetch";
import {
  placeholderRatio, planSlotRows, showsTypeInteraction, splitFilledSlots, type PlanSlotRow,
} from "../poster-form-rules";
import { WorkingBanner } from "../_components/working-banner";
import { PlanWriting } from "../_components/plan-writing";
import { blockedByReadOnly, READ_ONLY_MESSAGE } from "../../_components/read-only-work";

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
    /*
     * 아래 넷은 **「모델에 보낼 프롬프트」 미리보기**가 쓴다. 전에는 이 화면이
     * 슬롯만 보면 됐다. 옛 작업에는 없을 수 있으므로 전부 선택이다 —
     * 없으면 미리보기에서 그 줄이 빠질 뿐 화면은 멀쩡히 돈다.
     */
    attachmentOrder?: string[];
    preservedIds?: string[];
    personIds?: string[];
    restyledIds?: string[];
    look?: ImageLook;
    /** 쓴 그대로 보낼지. 옛 작업에는 없다 — 없으면 지금까지대로 다듬는다. */
    promptMode?: "verbatim" | "assisted";
    /** 기획이 근거 없이 채웠다고 밝힌 칸들. 옛 작업에는 없다. */
    inventedSlots?: string[];
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
  { project, images, adEnabled = false, readOnly = false }:
  {
    project: PosterProject; images: PosterImage[]; adEnabled?: boolean;
    /**
     * 남의 작업을 **보는 중**인가. 관리자만 여기까지 온다.
     *
     * 볼 수는 있고 고치지는 못한다 — 고치려면 자기 것으로 복사한다
     * (2026-09-16 사용자 결정).
     */
    readOnly?: boolean;
  },
) {
  /**
   * 이 화면에서 나가는 모든 요청은 **이것을 지난다.**
   *
   * 단추를 하나씩 `disabled` 로 잠그지 않는다 — 이 화면은 682줄이고 단추가
   * 열둘이라 **빠뜨린 하나가 곧 구멍**이다. 길목을 막으면 새 단추가 생겨도
   * 저절로 막힌다. 카드뉴스와 같은 방식이다.
   */
  const request = React.useCallback(
    async (url: string, init?: RequestInit) => {
      if (blockedByReadOnly(readOnly, init)) throw new Error(READ_ONLY_MESSAGE);
      return fetch(url, init);
    },
    [readOnly],
  );

  /**
   * 크레딧이 깎이는 요청. **길목을 지나야 한다.**
   *
   * 처음엔 `request` 만 만들고 `billableFetch` 를 그대로 뒀는데, 그것이
   * **기본 POST** 라 보기 전용에서 기획·만들기·고치기 셋이 그냥 나갔다
   * (리뷰가 잡음). 하필 막으려던 이유가 「크레딧은 요청이 나간 시점에 이미
   * 나간다」였다.
   *
   * **길목이 둘이면 길목이 아니다.** 하나로 합친다.
   */
  const billableRequest = React.useCallback(
    async (url: string, init?: RequestInit) => {
      if (blockedByReadOnly(readOnly, { method: "POST", ...init })) {
        throw new Error(READ_ONLY_MESSAGE);
      }
      return billableFetch(url, init);
    },
    [readOnly],
  );

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

  const [copying, setCopying] = React.useState(false);

  /**
   * 남의 작업을 **내 것으로 복사한다.**
   *
   * 고치는 대신 복사한다 — 그래야 회원의 작업이 안 바뀌고, 크레딧과 소유가
   * 복사한 사람 하나로 맞아떨어진다(2026-09-16 사용자 결정).
   */
  const copyToSelf = React.useCallback(async () => {
    setCopying(true);
    try {
      const body = await (await fetch(`/api/admin/works/poster/${project.id}/copy`, {
        method: "POST",
      })).json() as { ok?: boolean; id?: string; message?: string };
      if (!body.ok || !body.id) throw new Error(body.message ?? "복사하지 못했습니다.");
      router.push(`/poster/${body.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "복사하지 못했습니다.");
    } finally {
      setCopying(false);
    }
  }, [project.id, router]);

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
    /*
      **보일 이름으로 바꿔서 싣는다.** 여기만 원본 id 를 그리고 있었다 —
      「모델: gpt-image-2.5-flare」(2026-09-16 사용자 보고). 이름을 가려 둔
      까닭이 한 자리에서 통째로 사라진다(`lib/model-name.ts` 머리말).
    */
    모델: modelDisplayName(project.modelId),
  });

  /**
   * **모델에 보낼 프롬프트.**
   *
   * 지금까지 최종 프롬프트가 무엇이었는지 아무도 못 봤다. 그래서 「AI 가 과하게
   * 부풀렸나, 모자라나」를 판단할 근거가 화면에 없었다(2026-09-16 설계 §4.2).
   *
   * **여기서 새로 짓지 않는다.** 제출 때와 같은 함수를 부른다 — 두 벌로 두면
   * 미리보기가 거짓말을 하고, 그건 안 보여 주느니만 못하다.
   *
   * 지금 화면의 슬롯을 쓴다. 저장 전에 고친 것도 바로 비쳐야 「고쳤더니 이렇게
   * 바뀐다」를 볼 수 있다.
   */
  /**
   * 기획이 **근거 없이 채웠다고 밝힌** 칸들.
   *
   * 전에는 기획이 그런 칸을 아예 비웠다. 뜻은 분명했지만 너무 잘 들어서
   * 「벚꽃 아래 교복 입은 학생」에 0칸을 채웠다(2026-09-16 실측) — 초보일수록
   * 빈 칸을 못 채우는데 그 사람이 도움을 받으러 왔다.
   *
   * 지금은 채우게 하고 **여기에 표를 붙인다.** 판단은 사람이 하되 판단할
   * 거리는 AI 가 만들어 준다(2026-09-17 사용자 결정).
   */
  const [invented, setInvented] = React.useState<string[]>(project.data.inventedSlots ?? []);

  const promptPreview = React.useMemo(() => previewPosterPrompt({
    slots,
    /*
     * **URL 은 미리보기에 필요 없다.** 프롬프트는 번호와 역할만 쓰고, 그림
     * 자체는 fal 에 따로 간다. 그래서 제출 때와 **같은 함수**로 차례를 세우되
     * 주소는 자리표시를 넣는다 — 차례를 여기서 새로 짜면 미리보기의 ①이 실제
     * ①과 달라질 수 있다.
     */
    attachments: restoreAttachments(
      project.data,
      Object.fromEntries((project.data.attachmentOrder ?? []).map((id: string) => [id, id])),
    ),
    ratioId: project.ratio,
    modelId: project.modelId,
    look: project.data.look,
    userInstruction: project.data.userInstruction,
    attachmentIntent: project.data.attachmentIntent,
    /*
     * **미리보기도 같은 값을 봐야 한다.** 안 넘기면 실제로 갈 프롬프트에는
     * 「글자를 넣지 말라」가 붙는데 미리보기에는 안 붙는다 — 「모델에 보낼
     * 프롬프트 보기」가 거짓말을 한다.
     *
     * 화면 state 를 쓴다. 사람이 방금 고친 칸이 곧바로 반영돼야 한다.
     */
    invented,
  }), [slots, project, invented]);

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
  /**
   * **새 작업 화면에서 「04 기획 확인」을 눌러 돌아온 것인가.**
   *
   * 지난 단계(01~03)로 넘어간 사람은 04·05 가 막혀 원래 작업으로 돌아올 길이
   * 없었다(2026-09-16 사용자 보고). 돌아올 때 `?view=plan` 을 달아 오면 기획을
   * 바로 연다 — 결과가 이미 있어도 연다. 05 로 왔으면 결과 화면 그대로다.
   */
  const askedForPlan = useSearchParams().get("view") === "plan";
  React.useEffect(() => {
    if (!askedForPlan || project.data.promptMode === "verbatim") return;
    openedOnce.current = true;
    setPlanOpen(true);
  }, [askedForPlan, project.data.promptMode]);

  React.useEffect(() => {
    if (openedOnce.current) return;
    if (images.length) return;
    /*
     * **쓴 그대로 보낼 작업은 기획 패널을 안 연다.** 고칠 칸이 없다 — 슬롯이
     * 비어 있고 채울 일도 없다. 열면 빈 칸만 보여 무엇을 해야 할지 더 모른다.
     */
    if (project.data.promptMode === "verbatim") return;
    openedOnce.current = true;
    setPlanOpen(true);
  }, [images.length, project.data.promptMode]);


  /**
   * **화면에 표를 붙일 수 있는 칸만 센다.**
   *
   * 기획은 열한 칸을 채우는데 이 화면이 그리는 것은 아홉이다(`SLOT_LABELS`).
   * `sideTexts`·`typeInteraction` 은 제 칸이 따로 있어 `renderSlot` 을 안 지난다.
   * 그 둘까지 세면 「적어 주신 말로 채운 칸은 -1개」가 뜬다(2026-09-17 리뷰).
   *
   * 배지·숫자·띠가 **같은 목록**을 봐야 서로 어긋나지 않는다.
   */
  const 표붙은칸 = invented.filter((name) => SLOT_LABELS.some(([field]) => field === name));

  /** 기획이 채운 칸과 안 채운 칸. 채운 것이 이 그림에 필요한 칸이다. */
  const { filled: filledFields, empty: emptyFields } = splitFilledSlots(
    SLOT_LABELS.map(([field]) => field),
    (field) => String(slots[field] ?? ""),
  );

  /**
   * **한 번 보인 칸은 그 자리에 머문다.**
   *
   * 열 때와 빈 칸을 펼칠 때만 다시 잡는다. 치는 동안 다시 잡으면 글자를 지운
   * 칸이 사라지고, 그게 바로 자리가 움직여 커서가 빠지던 일의 반대쪽이다
   * (2026-09-17 사용자 보고).
   */
  const [keptFields, setKeptFields] = React.useState<TextSlot[]>([]);

  /**
   * **값이 들어온 칸은 그때그때 더한다.**
   *
   * 열 때 한 번만 잡으면 안 된다 — 04 는 **빈 채로 열리고** 기획이 그 뒤에
   * 칸을 채운다. 그 사이에 잡아 두면 목록이 빈 채로 굳어, 채워진 칸의 글자를
   * 다 지우는 순간 그 칸이 사라진다(2026-09-17 독립 리뷰가 실증). 「초안 다시
   * 채우기」 뒤에도 같다.
   *
   * 더하기만 하므로 **자리는 안 움직인다** — 차례는 `SLOT_LABELS` 가 정한다.
   */
  React.useEffect(() => {
    if (!planOpen) return;
    setKeptFields((current) => {
      const next = new Set(current);
      for (const [field] of SLOT_LABELS) {
        if (String(slots[field] ?? "").trim()) next.add(field);
      }
      // 같은 집합이면 같은 배열을 돌려준다 — 안 그러면 효과가 자기를 다시 부른다.
      return next.size === current.length ? current : [...next];
    });
  }, [planOpen, slots]);

  /**
   * 접을 때는 **지금 빈 칸을 놓아 준다.**
   *
   * 「비어 있는 칸 N개」를 접었는데 아까 보이던 빈 칸이 남아 있으면 접은 것이
   * 아니다. 펼칠 때는 어차피 다 보이므로 아무것도 안 한다.
   */
  React.useEffect(() => {
    if (!planOpen || showEmpty) return;
    setKeptFields((current) => current.filter((field) => String(slots[field] ?? "").trim()));
    // 접는 그 순간만. slots 를 넣으면 치는 동안 칸이 사라진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planOpen, showEmpty]);

  /** 패널에 그릴 칸. **차례는 언제나 `SLOT_LABELS` 그대로다.** */
  const planRows = planSlotRows(
    SLOT_LABELS.map(([field]) => field),
    (field) => String(slots[field] ?? ""),
    { showEmpty, keep: keptFields },
  );

  /**
   * 칸 하나를 그린다.
   *
   * **빈 칸은 자리를 옮기지 않고 모양으로 가른다** — 점선 테두리와 「비어
   * 있음」. 채워지면 그 자리에서 실선이 된다(2026-09-17 사용자 보고).
   */
  function renderSlot({ field, empty }: PlanSlotRow<TextSlot>) {
    const entry = SLOT_LABELS.find(([name]) => name === field);
    if (!entry) return null;
    const [, label, kind] = entry;
    const 지어냄 = 표붙은칸.includes(field);
    const look = empty ? "border-dashed bg-muted/30" : "";
    return (
      <div key={field} className="grid gap-1.5">
        {/*
          **두 표시가 한 줄에 같이 설 수 있다.** 「비어 있음」은 값이 없다는
          것이고 「AI 가 골라 채움」은 값의 출처다 — 서로 다른 것을 말한다.
          좁은 패널이라 `flex-wrap` 으로 넘긴다.
        */}
        <Label htmlFor={`slot-${field}`} className="flex flex-wrap items-center gap-1.5">
          {label}
          {empty ? <span className="text-meta font-normal text-subtle-foreground">비어 있음</span> : null}
          {/*
            **눈에 띄게 적는다.** 이 표가 안 보이면 AI 가 지어낸 설정이 그대로
            그림에 들어가고, 사용자는 왜 그게 나왔는지 모른다. 고치면 사라진다.
          */}
          {지어냄 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              AI 가 골라 채움
            </span>
          ) : null}
        </Label>
        {kind === "area" ? (
          <Textarea
            id={`slot-${field}`}
            rows={2}
            className={look}
            value={String(slots[field] ?? "")}
            onChange={(event) => setField(field, event.target.value)}
          />
        ) : (
          <Input
            id={`slot-${field}`}
            className={look}
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
  const { jobs, start, finish, stop } = useRunningJobs();

  /**
   * 사용자가 **중지**를 눌렀나.
   *
   * 누른 순간부터 캐묻기를 끊고, 이미 날아간 요청의 응답도 버린다. 안 버리면
   * 멈춘 뒤에 결과가 도착해 화면이 되살아난다 — 「중지가 안 먹는다」로 읽힌다.
   */
  const stopped = React.useRef(false);
  const [stopping, setStopping] = React.useState(false);

  /**
   * 일을 **시작한다.** 도는 표시를 세우고 지난 중지를 푼다.
   *
   * **푸는 자리를 갈래마다 적으면 안 된다.** 기획·만들기에만 적고 고치기에
   * 빠뜨렸더니, 한 번 중지한 뒤 고치기를 누르면 요청은 나가고(돈은 나간다)
   * 캐묻기는 첫 줄에서 되돌아 나와 결과가 영영 안 들어왔다 — 화면에는
   * 「눌렀는데 아무 일도 안 일어난다」로 보인다(2026-09-17 독립 리뷰).
   * 갈래가 하나 늘 때마다 같은 구멍이 다시 생기므로 한 곳에 둔다.
   */
  function beginWork(state: { kind: "plan" | "generate" | "review"; label: string; hint?: string }) {
    stopped.current = false;
    setBusy(state);
    setError(null);
  }

  /**
   * 지금 돌고 있는 것을 **강제로 끝낸다.**
   *
   * 사이드바에 있던 목록과 중지를 여기 하나로 합쳤다(2026-09-17 사용자 결정).
   * 표시가 두 군데 나던 것을 없애고, 멈추는 자리는 표시가 있는 자리에 둔다.
   */
  async function stopNow() {
    setStopping(true);
    stopped.current = true;
    const id = jobId("poster", project.id);
    const job = jobs.find((entry) => entry.id === id);
    try {
      if (job) {
        // 셸이 서버에도 알린다(`running-jobs.tsx` 의 `tellServerToStop`).
        await stop(job);
      } else {
        finish(id);
        /*
          **일감으로 안 잡힌 것도 서버에 알린다.** 기획이나 「보내는 중」에서
          누르면 아직 목록에 안 올라 있는데, 예약은 이미 잡혀 있다. 안 닫으면
          만료(10분)까지 그 사람 한도가 묶이고 다시 만들기도 막힌다
          (2026-09-17 독립 리뷰).
        */
        await request(`/api/poster/projects/${project.id}/stop`, { method: "POST" }).catch(() => {});
      }
    } finally {
      setStopping(false);
      setBusy(null);
      /*
        **덧붙인다. 덮어쓰지 않는다.** 여기에는 기획이 남긴 경고가 들어 있는데,
        중지 한 번에 그것이 사라졌다(2026-09-17 독립 리뷰).

        **「나중에 들어올 수 있다」고 말하지 않는다.** 중지는 장부를 닫고
        예약을 지우므로 그 요청의 결과는 영영 저장되지 않는다 — 값은 나간다.
      */
      setNotes((current) => [
        ...current,
        "중지했습니다. 이미 보낸 요청은 값이 나갈 수 있고, 그 결과는 저장되지 않습니다.",
      ]);
    }
  }

  /**
   * **돌아오면 화면이 캐묻기를 이어받는다.**
   *
   * 셸은 「지금 보고 있지 않은」 일감만 캐묻는다(`running-jobs.tsx`). 그래서
   * 만들다가 다른 화면에 갔다 돌아오면 셸은 쉬고, 새로 뜬 화면은 `busy` 가
   * 없어 스스로도 안 캐물어 **아무도 안 받아 왔다.** 사이드바 칸이 없어지면서
   * 화면에 흔적조차 안 남는다(2026-09-17 독립 리뷰).
   *
   * 일감이 물어볼 곳과 몸통을 들고 있으므로(`job.poll`), 그대로 이어서 묻는다.
   */
  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (resumed.current || busy) return;
    const job = jobs.find((entry) => entry.id === jobId("poster", project.id));
    if (!job?.poll.body) return;
    resumed.current = true;
    // 이어받는 것도 「일을 시작하는」 자리다. 같은 문을 지난다.
    // **무엇이 돌던 것인지는 모른다** — 그릴 수도, 고칠 수도 있다. 아는 만큼만 말한다.
    beginWork({ kind: "generate", label: "만들던 것을 이어받는 중입니다", hint: "잠시 기다려 주세요" });
    void (async () => {
      try {
        if (await collect(job.poll.body as Record<string, unknown>)) finish(job.id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "상태를 확인하지 못했습니다.");
      } finally {
        setBusy(null);
      }
    })();
    // 한 번만 이어받는다. `jobs` 가 바뀔 때마다 돌면 캐묻기가 겹친다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, busy]);

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
    /*
     * **쓴 그대로 보낼 작업은 기획을 안 부른다.**
     *
     * 사용자가 완성된 프롬프트를 들고 왔고 그대로 보내겠다고 골랐다. 여기서
     * AI 를 돌리면 그 프롬프트를 슬롯 11칸으로 요약하게 되는데, 그것이 바로 이
     * 갈래가 막으려던 일이다(2026-09-16 사용자 보고). 서버도 막지만
     * (`plan/route.ts`), 값이 드는 부름은 **부르기 전에** 멈추는 편이 낫다.
     */
    if (project.data.promptMode === "verbatim") return;
    const empty = SLOT_LABELS.every(([field]) => !String(slots[field] ?? "").trim());
    if (!empty) return;
    planned.current = true;
    void runPlan();
    // 첫 진입에 한 번만. slots 를 넣으면 채워질 때마다 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(field: TextSlot, value: string) {
    setSlots((current: PosterSlots) => ({ ...current, [field]: value }));
    /*
     * **손댄 칸은 더 이상 「AI 가 지어낸 것」이 아니다.**
     *
     * 사람이 읽고 고쳤으면 그 값은 사람 것이다. 표를 그대로 두면 자기가 쓴
     * 글에 「확인하세요」가 붙어 있는 꼴이 된다.
     */
    setInvented((current) => current.filter((name) => name !== field));
  }

  /**
   * 고친 칸을 저장한다.
   *
   * **성공했는지 돌려준다.** 만들기가 이것을 먼저 부르는데, 실패를 삼키면
   * **틀린 값으로 그림을 만든다** — 값이 드는 일이다. 단추로 누를 때는
   * 돌려준 값을 안 봐도 된다(화면에 오류가 뜬다).
   */
  async function saveSlots(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const response = await request(`/api/poster/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(slots),
      });
      // 무엇을 표에서 뺄지는 서버가 정한다. 화면 state 와 어긋나지 않게 받는다.
      const body = await response.json();
      if (!body.ok) throw new Error(body.message ?? "슬롯을 저장하지 못했습니다.");
      setInvented(body.project?.data?.inventedSlots ?? []);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "슬롯을 저장하지 못했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** 기획을 채운다. 실패해도 빈 슬롯이 남고 사람이 직접 쓸 수 있다. */
  async function runPlan() {
    beginWork({ kind: "plan", label: "기획하는 중입니다", hint: "AI 가 칸을 채우고 있습니다" });
    try {
      const body = await (await billableRequest(`/api/poster/projects/${project.id}/plan`)).json();
      // 중지를 눌렀으면 도착한 초안을 안 쓴다 — 멈춘 뒤에 칸이 채워지면 안 된다.
      if (stopped.current) return;
      if (!body.ok) throw new Error(body.message ?? "기획하지 못했습니다.");
      setSlots(body.project.data.slots);
      // **새 목록도 받는다.** 안 받으면 방금 채운 칸에 표가 하나도 안 붙는다 —
      // 새로 만든 작업은 초기값이 늘 비어 있다(2026-09-17 리뷰).
      setInvented(body.project.data.inventedSlots ?? []);
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
    beginWork({ kind: "generate", label: "보내는 중입니다", hint: "첨부한 그림을 올리고 있습니다" });
    try {
      /*
       * **고친 칸을 먼저 저장한다.**
       *
       * 미리보기는 화면 state 를, 생성은 저장값을 본다. 전에는 그 둘이 갈려도
       * **내용**만 달랐는데, 이제 「글자를 넣지 말라」라는 **분기**까지 가른다
       * (`prompt.ts` 의 `copyLines`). 칸을 고치고 저장 안 한 채 만들면
       * 미리보기에는 글자가 보이는데 글자 하나 없는 그림이 나온다
       * (2026-09-17 리뷰).
       *
       * 고친 것을 버리는 쪽이 아니라 **살리는 쪽**으로 맞춘다 — 사람이 방금
       * 한 일이다. 저장이 실패하면 아래 `catch` 가 받아 만들기를 안 한다.
       */
      if (!await saveSlots()) return;
      const start = await (await billableRequest(`/api/poster/projects/${project.id}/generate`)).json();
      if (stopped.current) return;
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
      const response = await request(`/api/poster/projects/${project.id}/select`, {
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
    beginWork({ kind: "review", label: "검수하는 중입니다", hint: "글자가 원고대로 들어갔는지 봅니다" });
    try {
      const body = await (await request(`/api/poster/projects/${project.id}/review`, { method: "POST" })).json();
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
    beginWork({ kind: "generate", label: "보내는 중입니다", hint: "고칠 그림을 올리고 있습니다" });
    try {
      // 수정도 크레딧이 깎이는 요청이다 — 열쇠가 없으면 예약이 거절된다.
      const start = await (await billableRequest(`/api/poster/projects/${project.id}/edit`, {
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
      // 중지를 눌렀으면 더 캐묻지 않는다. 일감은 이미 목록에서 뺐다.
      if (stopped.current) return false;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      /*
        **자는 동안 누른 중지도 여기서 걸린다.** 잠들기 전에만 보면, 자는 사이에
        멈춘 사람에게 최대 10초 뒤 결과가 도착해 화면이 되살아난다
        (2026-09-17 독립 리뷰).
      */
      if (stopped.current) return false;
      const poll = await (await request(`/api/poster/projects/${project.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })).json();
      // 물어보는 사이에 눌렀을 수도 있다. 도착한 답을 화면에 쓰기 전에 본다.
      if (stopped.current) return false;
      if (!poll.ok) throw new Error(poll.message ?? "상태를 확인하지 못했습니다.");
      if (poll.done) {
        setList(poll.images);
        return true;
      }
    }
  }

  // 앞 화면(01~03)에서 이어지는 단계다. 어디쯤 왔는지 보여준다 —
  // 카드뉴스가 쓰는 것과 같은 막대다.
  //
  // **그대로 생성은 04 가 없다.** 판단은 `steps.ts` 가 한다 — 여기서 정하면
  // 새로 만드는 화면과 갈리고, 값으로 잴 수도 없다.
  const 단계 = posterSteps(project.data.promptMode);
  const current = currentPosterStep({
    hasImages: list.length > 0,
    promptMode: project.data.promptMode,
  });

  return (
    <div className="grid gap-6">
      {/*
        **남의 작업을 보는 중이라고 먼저 말한다.**

        안 적으면 자기 작업인 줄 알고 고치려다 「고칠 수 없습니다」만 본다.
        낱장이 안 보이는 까닭도 같이 적는다 — 그림 주소는 회원용 라우트가
        흘려 주는데 남의 것은 그 길이 막혀 있다.
      */}
      {readOnly ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span>
            <b>다른 회원의 작업</b>을 보는 중입니다. 설정·과정·결과는 볼 수 있고
            고칠 수는 없습니다. 고치려면 내 작업으로 복사하세요.
          </span>
          {/* 무엇을 하면 되는지 같은 자리에 둔다. 막아만 두면 길이 없다. */}
          <Button size="sm" disabled={copying} onClick={() => void copyToSelf()}>
            {copying ? "복사하는 중…" : "내 작업으로 복사"}
          </Button>
        </div>
      ) : null}

      <StepBar
        steps={단계}
        current={current}
        /*
          **못 가는 곳은 눌리지 않게 한다.** 04·05 는 이 화면 안이라 오갈 데가
          없는데, `onJump` 안에서 조용히 돌아서면 단추는 활성으로 보이고
          hover 까지 먹는다 — 눌러도 아무 일이 없어 고장으로 읽힌다
          (2026-09-16 독립 리뷰). 새로 만드는 화면도 같은 값을 쓴다.
        */
        allowJump={reachableBeforeCreate}
        onJump={(id) => {
          /*
            앞 세 단계는 새로 만드는 화면에 있다. **이 작업의 값을 들고** 간다.

            전에는 그냥 `/poster/new` 로 보냈다. 값이 지워진 것이 아니라 다른
            화면으로 간 것인데, 사용자에게는 「다 초기화됐다」로 읽혔다
            (2026-09-16 사용자 보고).

            **남의 작업이어도 간다.** 관리자는 모든 회원의 작업을 다시 만들 수
            있어야 한다(2026-09-16 사용자 결정). 거기서 만들기를 누르면 **새
            작업**이 생기고 원래 작업은 안 바뀐다 — 그래서 읽기 전용과
            어긋나지 않는다.
          */
          if (id === "plan" || id === "result") return;
          router.push(`/poster/new?from=${encodeURIComponent(project.id)}`);
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

      {/* 멈추는 자리는 여기 하나다 — 사이드바 칸은 없앴다(2026-09-17 사용자 결정). */}
      {busy ? (
        <WorkingBanner
          label={busy.label}
          hint={busy.hint}
          onStop={() => void stopNow()}
          stopping={stopping}
        />
      ) : null}

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
          <SidePanelBody className="relative grid content-start gap-5">
            {/*
              **쓰는 중에는 패널을 덮는다.** 덮지 않으면 빈 칸이 그대로 보여
              멈춘 화면으로 읽히고, 그 사이 고친 값은 도착한 초안이 덮어쓴다
              (2026-09-17 사용자 보고).
            */}
            {busy?.kind === "plan" ? (
              <PlanWriting label="AI 가 기획을 쓰는 중입니다" hint="10~30초 걸립니다" />
            ) : null}
            {/*
              **「몇 개가 지어낸 것인가」로 적지 않는다.**

              칸마다 붙은 표는 작아서 놓치기 쉽다. 그래서 맨 위에서 한 번 더
              말해 주되, 세는 방향을 뒤집는다.

              짧은 지시로 만들면 열한 칸 중 아홉에 표가 붙는다(2026-09-17 실측).
              그게 정상이다 — 한 줄만 적었으니 나머지는 AI 가 고른 것이 맞다.
              그런데 「9개가 지어낸 것」이라고 적으면 고장처럼 읽힌다.
            */}
            {표붙은칸.length ? (
              <div className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
                <span className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  표가 붙은 칸은 AI 가 골라 채운 것입니다
                </span>
                <span className="text-sm text-amber-900/80 dark:text-amber-200/80">
                  적어 주신 말로 채운 칸은 {filledFields.length - 표붙은칸.length}개이고,
                  나머지 {표붙은칸.length}개는 AI 가 어울릴 만한 것으로 골랐습니다.
                  마음에 안 들면 지우거나 고치세요. 고치면 표가 사라집니다.
                </span>
              </div>
            ) : null}
            {userWords.length ? (
              <div className="grid gap-2 rounded-md border border-border bg-muted/40 px-4 py-3">
                <span className="text-meta text-subtle-foreground">
                  내가 적은 말. 아래 칸보다 우선합니다
                </span>
                {userWords.map(([label, text]) => (
                  <p key={label} className="text-sm">
                    <span className="text-muted-foreground">{label} · </span>
                    <span className="whitespace-pre-wrap">{text}</span>
                  </p>
                ))}
              </div>
            ) : null}

            {/*
              **칸 차례는 늘 `SLOT_LABELS` 그대로다.** 채운 칸을 위로 모아
              두었더니 빈 칸에 한 글자를 넣는 순간 그 칸이 위로 올라가고 커서가
              빠졌다(2026-09-17 사용자 보고). 채웠는지는 자리가 아니라 모양이
              말한다 — 점선과 「비어 있음」.
            */}
            <div className="grid gap-4">{planRows.map(renderSlot)}</div>

            {emptyFields.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start px-0 text-muted-foreground"
                onClick={() => setShowEmpty((current) => !current)}
              >
                {showEmpty ? "▾" : "▸"} 비어 있는 칸 {emptyFields.length}개 · 필요하면 채우세요
              </Button>
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
                onChange={(event) => {
                  /*
                    **곁텍스트도 손대면 사람 것이다.**

                    이 칸은 `renderSlot` 을 안 지나서 `setField` 의 표 지우기를
                    못 탄다. 그래서 고쳐도 화면 목록에 「sideTexts」가 남아,
                    저장 전까지 미리보기가 방금 친 글을 「AI 것」으로 보고
                    금지문을 붙인다(2026-09-17 리뷰).
                  */
                  setInvented((current) => current.filter((name) => name !== "sideTexts"));
                  setSlots((current: PosterSlots) => ({
                    ...current,
                    sideTexts: event.target.value.split("\n"),
                  }));
                }}
                placeholder={"28MM F2.0\nISO 400"}
              />
              <p className="text-xs text-subtle-foreground">한 줄에 하나씩 적습니다.</p>
            </div>

            {/*
              **모델에 보낼 프롬프트를 그대로 보여 준다.**

              접어 둔다 — 늘 펼쳐 두면 고칠 칸이 밀린다. 읽기 전용이다: 여기서
              고치게 하면 첨부 번호·크기 같은 **기계적으로 정확해야 하는 부분**의
              보장이 깨진다(설계 §2.1).
            */}
            <details className="rounded-md border border-border bg-muted/40">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold">
                모델에 보낼 프롬프트 보기
              </summary>
              <div className="border-t border-border px-4 py-3">
                <p className="mb-2 text-xs text-subtle-foreground">
                  위 칸을 고치면 여기도 바뀝니다. 읽기 전용입니다.
                </p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">
                  {promptPreview}
                </pre>
              </div>
            </details>
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
