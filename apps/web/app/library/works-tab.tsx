"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { modelDisplayName } from "../../lib/model-name";
import { ListOrdered, Loader2, Trash2 } from "lucide-react";
import { openImageGallery } from "../_components/image-viewer";
import { CORNER_BUTTON, DELETE_CORNER_BUTTON } from "../_components/delete-work-button";
import { isShowcased, type ShowcaseAdminView } from "../api/showcase/core";
import { coverOf } from "./works-cover";
import { canOpenSteps } from "./work-steps";
import {
  isWorkShowcased, libraryWorks, showcaseKindOf, TOOL_LABEL,
  type LibraryWork, type WorkTool,
} from "./library-works";
import {
  Badge, Button, Card, CardContent,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  cn,
} from "@fixup/ui";
import { ThumbImage } from "../_components/thumb-image";

/**
 * 작업물 — **이 시스템이 만든 결과물**.
 *
 * 참고 이미지와 나누는 기준은 하나다.
 *
 *   참고 이미지   사용자가 첨부한 것
 *   작업물        시스템이 만든 것
 *
 * 전에는 도구별(새로 만들기 / 리디자인)로 나눠 보여줬는데, 사용자에게는
 * "내가 만든 것"이 하나다. 어느 도구로 만들었는지는 그 안에 적으면 된다.
 *
 * 카드뉴스처럼 여러 장이 한 벌인 것은 **묶음 하나로** 보여주고 대표 그림을
 * 세운다. 누르면 언제 만들었는지, 무슨 내용이었는지, 어떤 설정으로 만들었는지,
 * 누가 만들었는지를 편다.
 */

/**
 * 이 탭이 싣는 도구.
 *
 * 카드뉴스·포스터는 각자 표가 있고, 상세페이지·리디자인은 **한 표에 함께**
 * 있다(`library_items`). 이름표와 갤러리 갈래는 `library-works.ts` 가 정한다.
 */
type Tool = WorkTool;

/**
 * 한 장.
 *
 * `index` 는 **원본에서의 자리**다 — 카드뉴스는 카드 번호, 포스터는 변형
 * 번호. 배열 순서와 다를 수 있다(못 만든 카드는 목록에서 빠진다). 첫 화면에
 * 걸 때 이 값으로 원본을 되짚으므로 배열 순서로 대신하면 엉뚱한 장이 걸린다.
 */
interface WorkImage { url: string; label: string; index: number }

interface Work {
  id: string;
  tool: Tool;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  /** 만든 사람의 이메일. 관리자가 전체를 볼 때만 채워진다. */
  ownerEmail?: string | null;
  /**
   * 내가 만든 것인가.
   *
   * 서버가 정해서 보낸다. 화면이 스스로 판단하면 관리자가 전체를 볼 때
   * 남의 작업에 지우기 단추가 뜨고, 눌러도 아무 일이 안 일어난다.
   */
  mine: boolean;
  /**
   * 목록 표지. **사본이 있으면 사본이다.**
   *
   * 낱장 보기(`images`)와 확대·내려받기는 원본을 그대로 쓴다 — 표지만
   * 작은 것으로 바꾼다.
   */
  cover: string | null;
  /**
   * 그림이 몇 장인가. **`images` 가 비어 있어도 안다.**
   *
   * 계정 보관 작업은 낱장을 열 때 받으므로 목록에서는 늘 0장이다. 카드가
   * `images.length` 로 판단하면 그런 작업은 눌러도 뷰어가 안 열린다.
   */
  imageCount: number;
  images: WorkImage[];
  /** 무엇을 만들려던 것인가. 카드뉴스는 원본 글, 포스터는 한 줄 지시. */
  intent: string;
  /** 사용자가 정한 값들. 이름과 값 쌍으로 그대로 보여준다. */
  settings: Array<[string, string]>;
  href: string;
}

const STATUS: Record<string, { label: string; tone: "green" | "secondary" | "destructive" }> = {
  draft: { label: "쓰는 중", tone: "secondary" },
  planning: { label: "기획 중", tone: "secondary" },
  copy_ready: { label: "원고 준비됨", tone: "secondary" },
  generating: { label: "만드는 중", tone: "secondary" },
  ready: { label: "완료", tone: "green" },
  done: { label: "완료", tone: "green" },
  failed: { label: "실패", tone: "destructive" },
};

function when(value: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

/** 카드뉴스 원본 글은 종류마다 담긴 자리가 다르다. */
function snsIntent(source: Record<string, unknown> | undefined): string {
  if (!source) return "";
  if (typeof source.text === "string") return source.text;
  if (typeof source.url === "string") return source.url;
  if (typeof source.question === "string") return source.question;
  return "";
}

function toSnsWork(project: Record<string, any>): Work {
  const cards: Array<{
    index: number; assetUrl?: string | null; thumbUrl?: string | null; copy?: { headline?: string };
  }> = project.data?.flow?.cards ?? [];
  const made = cards.filter((card) => card.assetUrl);
  const images = made
    .map((card) => ({ url: card.assetUrl as string, label: `${card.index}번 카드`, index: card.index }));
  const coverCard = made[0];
  return {
    id: project.id,
    tool: "sns",
    title: project.title,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    userId: project.userId,
    ownerEmail: project.ownerEmail ?? null,
    // 회원용 목록은 자기 것만 주므로 `mine` 을 싣지 않는다. 그때는 전부 내 것이다.
    mine: project.mine ?? true,
    cover: coverOf(coverCard),
    imageCount: images.length,
    images,
    intent: snsIntent(project.data?.source),
    settings: [
      ["비율", project.ratio],
      ["언어", project.language],
      ["모델", modelDisplayName(project.modelId)],
      ["장수", project.cardCountMode === "fixed" ? `${project.cardCount}장 고정` : "AI 추천"],
      ...(project.toneNote ? ([["톤·요청", project.toneNote]] as Array<[string, string]>) : []),
      ["첨부 그림", `${(project.data?.attachments ?? []).length}장`],
    ],
    href: `/sns/${project.id}`,
  };
}

function toPosterWork(project: Record<string, any>): Work {
  const shots = (project.images ?? []).filter((image: { url?: string }) => image.url);
  const images: WorkImage[] = shots
    .map((image: { url: string; variantIndex: number }) => ({
      url: image.url, label: `변형 ${image.variantIndex + 1}`, index: image.variantIndex,
    }));
  const coverShot = shots[0];
  return {
    id: project.id,
    tool: "poster",
    title: project.title,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    userId: project.userId,
    ownerEmail: project.ownerEmail ?? null,
    mine: project.mine ?? true,
    cover: coverOf(coverShot),
    imageCount: images.length,
    images,
    intent: project.data?.instruction ?? "",
    settings: [
      ["비율", project.ratio],
      ["모델", modelDisplayName(project.modelId)],
      ["변형", `${project.data?.variants ?? 0}장`],
      ["따라 만들 그림", `${(project.data?.referenceIds ?? []).length}장`],
      ["그대로 지킬 것", `${(project.data?.preservedIds ?? []).length}장`],
    ],
    href: `/poster/${project.id}`,
  };
}

/**
 * 계정에 보관된 상세페이지·리디자인 작업.
 *
 * **관리자용 주소가 따로 없다.** 이 목록은 한 주소가 관리자에게 전부를 준다
 * (`lib/server-library.ts` 의 `readScope`). 카드뉴스·포스터처럼 길이 갈려
 * 있지 않아서, 「내 것만 보기」는 여기서 좁힌다.
 *
 * **못 읽어도 목록을 비우지 않는다.** 카드뉴스·포스터가 이미 와 있는데 이것
 * 하나 때문에 화면이 통째로 비면, 사용자는 작업이 사라진 줄 안다.
 */
async function readLibraryWorks(allMembers: boolean) {
  try {
    const body = await (await fetch("/api/library", { cache: "no-store" })).json();
    if (!body?.ok) return [];
    return libraryWorks(body.items ?? []).filter((work) => allMembers || work.mine);
  } catch {
    return [];
  }
}

/**
 * 계정 보관 작업의 낱장을 받는다. **열 때만.**
 *
 * 카드뉴스·포스터는 목록이 낱장까지 싣고 오지만, 이쪽은 표지만 온다
 * (`library-works.ts` 에 이유를 적었다).
 */
async function readWorkImages(work: LibraryWork | { id: string; title: string }) {
  try {
    const body = await (await fetch(`/api/library?id=${encodeURIComponent(work.id)}`, { cache: "no-store" })).json();
    if (!body?.ok) return [];
    const rows = (body.images ?? []) as Array<{ url?: string | null; position: number }>;
    return rows
      .filter((image): image is { url: string; position: number } => Boolean(image.url))
      .map((image) => ({
        url: image.url,
        label: `${image.position + 1}번째`,
        index: image.position,
      }));
  } catch {
    return [];
  }
}

export function WorksTab() {
  const router = useRouter();
  const [works, setWorks] = React.useState<Work[] | null>(null);
  const [message, setMessage] = React.useState("");
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  /**
   * 지금 여는 중인 작업.
   *
   * 계정 보관 작업은 낱장을 **누를 때** 받아 오므로 사이에 틈이 생긴다. 그
   * 틈에 한 번 더 누르면 같은 것을 두 번 받아 창이 두 번 열린다 — 아무 반응이
   * 없으니 사용자는 한 번 더 누르게 된다.
   */
  const [opening, setOpening] = React.useState<string | null>(null);
  /**
   * 첫 화면에 걸린 것들. **null 이면 관리자가 아니다.**
   *
   * 따로 "나는 관리자인가"를 묻지 않는다. 관리 목록을 달라고 해서 주면
   * 관리자고, 막히면 아니다 — 두 번 물으면 두 대답이 어긋날 수 있다.
   */
  const [showcase, setShowcase] = React.useState<ShowcaseAdminView[] | null>(null);
  /**
   * 관리자가 전체 회원의 작업물을 보고 있는가.
   *
   * **관리자는 켜진 채로 시작한다.** 처음에는 꺼 두었는데, 그러면 관리자가
   * 버튼을 찾아 누르기 전까지 남의 작업이 하나도 안 보인다 — 「관리자는 모두
   * 볼 수 있다」가 아니라 「안 보인다」로 읽힌다. 자기 것만 보고 싶을 때
   * 좁히는 편이, 볼 수 있다는 것을 모른 채 못 보는 것보다 낫다.
   */
  const [allMembers, setAllMembers] = React.useState(false);
  /**
   * 관리자인가. `null` 이면 아직 모른다.
   *
   * 정해지기 전에는 목록을 읽지 않는다. 모르는 채로 회원용 목록을 먼저 읽으면
   * 관리자에게 자기 것만 한 번 보였다가 전체로 바뀌어 화면이 두 번 뒤집힌다.
   */
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [featuring, setFeaturing] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState("");
  const pending = React.useMemo(
    () => (works ?? []).find((work) => work.id === confirming) ?? null,
    [works, confirming],
  );

  /**
   * 작업을 누르면 큰 창으로 연다.
   *
   * 전에는 작은 창에 썸네일을 늘어놓아, 정작 무엇을 만들었는지가 안 보였다.
   * 만들기 화면이 쓰는 그 창을 그대로 쓴다 — 크게 보면서 설명도 보고,
   * 넘기고, 내려받고, 지운다.
   */
  async function openWork(work: Work) {
    /*
      **계정 보관 작업은 낱장을 여기서 받는다.** 목록에 미리 실으면 한 작업에
      스무 장씩, 화면 한 번에 수십 MB 가 오간다 — 사용자가 「끊긴다」고 말한
      그 증상이다. 서명 주소는 수명이 있어 어차피 그때그때 받아야 한다.
    */
    if (opening) return;

    let images = work.images;
    if (!images.length) {
      setOpening(work.id);
      try {
        images = await readWorkImages(work);
      } finally {
        setOpening(null);
      }
    }
    if (!images.length) {
      setNotice("이 작업에는 볼 수 있는 그림이 없습니다.");
      return;
    }

    const meta: Array<[string, string]> = [
      ["만든 때", when(work.createdAt || work.updatedAt)],
      ["도구", TOOL_LABEL[work.tool]],
      ...(work.intent ? ([["무엇을 만들려던 것인가", work.intent]] as Array<[string, string]>) : []),
      ...work.settings.filter(([, value]) => value),
      ["만든 사람", work.ownerEmail ?? work.userId ?? "확인할 수 없음"],
    ];
    openImageGallery({
      images: images.map((image) => ({
        src: image.url,
        alt: `${work.title} · ${image.label}`,
        name: `${work.title} ${image.label}.png`,
        meta,
      })),
      deleteLabel: "이 작업 지우기",
      // 자기 것, 그리고 관리자. 잘못 올라온 것을 내릴 사람이 아무도 없으면
      // 그대로 남는다. 되돌릴 수 없는 일이라 누른 뒤 한 번 더 묻는다.
      onDelete: work.mine || isAdmin ? () => setConfirming(work.id) : undefined,
      // 관리자에게만 보인다. 넘겨보다 마음에 드는 장에서 바로 건다.
      action: showcase
        ? {
            label: "첫 화면에 걸기",
            doneLabel: "첫 화면에 걸림",
            doneAt: (position) => {
              const image = images[position];
              return image ? isShowcased(showcase, showcaseKindOf(work.tool), work.id, image.index) : false;
            },
            run: (position) => void feature(work, images, position),
          }
        : undefined,
    });
  }

  /**
   * 이 장을 첫 화면 갤러리에 건다. **관리자만.**
   *
   * 회원 작업물은 대부분 출시 전 상업용 기획물이라, 만들자마자 공개 인터넷에
   * 걸리면 사고다. 그래서 자동으로 걸지 않고 사람이 한 장씩 고른다.
   *
   * 설명은 여기서 붙이지 않는다. 작업 제목은 회원이 자기 편하려고 쓴 말이라
   * 그대로 첫 화면에 내걸 말이 아니다 — 문구는 관리자 화면에서 따로 쓴다.
   */
  async function feature(work: Work, images: WorkImage[], position: number) {
    const image = images[position];
    if (!image || featuring) return;
    setFeaturing(work.id);
    setNotice("");
    try {
      const response = await fetch("/api/showcase/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKind: showcaseKindOf(work.tool),
          sourceId: work.id,
          imageIndex: image.index,
          kindLabel: TOOL_LABEL[work.tool],
        }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!body.ok) throw new Error(body.message ?? "걸지 못했습니다.");
      // 방금 건 것을 목록에 더한다. 다시 받아오면 큰 그림을 또 내려받게 된다.
      setShowcase((current) => [
        ...(current ?? []),
        {
          id: `${work.tool}-${work.id}-${image.index}`,
          url: "",
          thumbUrl: "",
          width: null,
          height: null,
          caption: null,
          kindLabel: TOOL_LABEL[work.tool],
          sourceKind: showcaseKindOf(work.tool),
          sourceId: work.id,
          sourceIndex: image.index,
          position: 0,
          visible: true,
          createdAt: new Date().toISOString(),
        },
      ]);
      setNotice(`「${work.title}」 ${image.label}을 첫 화면에 걸었습니다. 순서와 문구는 관리자 화면에서 고칩니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "걸지 못했습니다.");
    } finally {
      setFeaturing(null);
    }
  }

  async function remove(work: Work) {
    setDeleting(work.id);
    setMessage("");
    try {
      /*
        **계정 보관 작업은 다른 표에 있다.** 도구 주소로 보내면 아무것도 안
        지워지고 사라진 것처럼 보인다 — `lib/library.ts` 가 레퍼런스에서 같은
        실수를 겪고 남긴 주석이다.
      */
      const account = work.tool === "create" || work.tool === "redesign";
      const endpoint = account
        ? "/api/library"
        : work.tool === "sns"
          ? `/api/sns/projects/${work.id}`
          : `/api/poster/projects/${work.id}`;
      const body = await (await fetch(endpoint, {
        method: "DELETE",
        ...(account
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ id: work.id }) }
          : {}),
      })).json();
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      setWorks((current) => (current ?? []).filter((entry) => entry.id !== work.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지우지 못했습니다.");
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  }

  /**
   * 관리자인지 먼저 가린다. **목록을 읽기 전에.**
   *
   * 따로 「나는 관리자인가」를 묻지 않는다. 관리 목록을 달라고 해서 주면
   * 관리자고, 막히면 아니다 — 두 번 물으면 두 대답이 어긋날 수 있다.
   *
   * 관리자면 전체 보기로 시작한다. 버튼을 찾아 누르기 전까지 남의 작업이
   * 하나도 안 보이면, 「관리자는 모두 볼 수 있다」가 아니라 「안 보인다」로
   * 읽힌다.
   */
  React.useEffect(() => {
    let alive = true;
    void fetch("/api/showcase/manage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { ok?: boolean; items?: ShowcaseAdminView[] } | null) => {
        if (!alive) return;
        if (body?.ok) {
          setShowcase(body.items ?? []);
          setAllMembers(true);
        }
        setIsAdmin(Boolean(body?.ok));
      })
      .catch(() => { if (alive) setIsAdmin(false); });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    // 관리자 여부가 정해지기 전에는 읽지 않는다. 모르는 채로 회원용 목록을
    // 먼저 읽으면 관리자에게 자기 것만 한 번 보였다가 전체로 바뀌어 화면이
    // 두 번 뒤집힌다.
    if (isAdmin === null) return;
    let alive = true;
    setWorks(null);
    void (async () => {
      try {
        // 전체를 볼 때는 관리자 전용 길로 한 번에 읽는다. 회원용 목록은 자기
        // 것만 주도록 그대로 두었다 — 한 주소에서 조건 하나로 갈리면, 언젠가
        // 그 조건이 어긋나 남의 작업이 회원에게 새 나간다.
        const merged = allMembers
          ? await (async () => {
              const [body, library] = await Promise.all([
                (await fetch("/api/admin/works", { cache: "no-store" })).json(),
                readLibraryWorks(true),
              ]);
              if (!body.ok) throw new Error(body.message ?? "작업물을 불러오지 못했습니다.");
              return [
                ...(body.sns ?? []).map(toSnsWork),
                ...(body.poster ?? []).map(toPosterWork),
                ...library,
              ];
            })()
          : await (async () => {
              // 두 도구를 함께 읽어 한 목록으로 만든다. 사용자에게는 "내가 만든 것"이 하나다.
              const [sns, poster, library] = await Promise.all([
                fetch("/api/sns/projects", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
                fetch("/api/poster/projects", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
                readLibraryWorks(false),
              ]);
              return [
                ...(sns.ok ? (sns.projects ?? []).map(toSnsWork) : []),
                ...(poster.ok ? (poster.projects ?? []).map(toPosterWork) : []),
                ...library,
              ];
            })();
        if (!alive) return;
        setWorks(merged.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")));
      } catch (error) {
        // 화면을 통째로 지우지 않는다. 전체 보기가 실패했는데 목록까지
        // 사라지면 「내 것만 보기」로 돌아갈 단추마저 없어진다.
        if (!alive) return;
        setNotice(error instanceof Error ? error.message : "작업물을 불러오지 못했습니다.");
        setWorks([]);
      }
    })();
    return () => { alive = false; };
  }, [isAdmin, allMembers]);

  if (message) return <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p>;
  if (!works) return <p className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />작업물을 불러오는 중입니다.</p>;
  if (!works.length) return <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">아직 만든 작업물이 없습니다.</p>;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">작업물</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {allMembers
              ? "모든 회원이 만든 결과물입니다. 관리자는 누가 만든 것이든 지울 수 있습니다."
              : "이 시스템으로 만든 결과물입니다. 눌러서 언제·무엇을·어떤 설정으로 만들었는지 봅니다."}
            {showcase ? " 그림을 열어 첫 화면 갤러리에 걸 수 있습니다." : ""}
          </p>
        </div>
        {/* 관리자에게만 보인다. 관리 목록이 열렸다는 것이 곧 관리자라는 뜻이다. */}
        {showcase ? (
          <Button variant={allMembers ? "default" : "outline"} size="sm" onClick={() => setAllMembers((on) => !on)}>
            {allMembers ? "내 것만 보기" : "전체 회원 보기"}
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="rounded-md border border-primary/30 bg-primary-soft px-4 py-3 text-sm">{notice}</p>
      ) : null}
      {featuring ? (
        <p role="status" className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />첫 화면에 거는 중입니다. 그림을 한 벌 떠 두느라 몇 초 걸립니다.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {works.map((work) => (
          <Card key={`${work.tool}-${work.id}`} className="relative cursor-pointer overflow-hidden" onClick={() => (work.imageCount ? void openWork(work) : router.push(work.href))}>
            {/* 지우기를 카드 모서리에 둔다.

                전에는 큰 창을 열어야만 지울 수 있었다. 그런데 **그림이 없는
                작업은 창이 안 열린다** — 누르면 도구 화면으로 간다. 그래서
                만들다 만 작업은 지울 방법이 아예 없었다.

                모서리에 두는 것은 참고 이미지와 같다. 아래에 줄로 두면 카드가
                길어지고 다른 단추와 섞여 잘못 누르게 된다. */}
            {work.mine || isAdmin ? (
              <button
                type="button"
                aria-label={`${work.title} 지우기`}
                disabled={Boolean(deleting)}
                onClick={(event) => {
                  // 카드를 누른 것으로도 읽히면 지우기 확인과 큰 창이 함께 뜬다.
                  event.stopPropagation();
                  setConfirming(work.id);
                }}
                className={cn(DELETE_CORNER_BUTTON, "disabled:opacity-50")}
              ><Trash2 className="size-3.5" /></button>
            ) : null}
            {/* 「과정 보기」 — 카드 본문 클릭은 그대로 그림 뷰어를 연다.

                완성된 작업은 그림이 있어 언제나 뷰어가 열렸고, 단계별 화면으로
                가는 길이 거기 가려져 있었다(위 `onClick` 이 「그림이 있으면
                뷰어, 없으면 이동」이다). 쓰던 동작을 뺏지 않고 길만 따로 낸다.

                지우기의 반대편에 둔다. 같은 편에 두면 여는 것과 지우는 것이
                나란히 서서 잘못 누른다. */}
            {canOpenSteps(work, isAdmin) ? (
              <button
                type="button"
                aria-label={`${work.title} 과정 보기`}
                onClick={(event) => {
                  // 카드를 누른 것으로도 읽히면 뷰어와 이동이 함께 일어난다.
                  event.stopPropagation();
                  router.push(work.href);
                }}
                className={cn(CORNER_BUTTON, "left-1.5 hover:text-foreground")}
              ><ListOrdered className="size-3.5" /></button>
            ) : null}
            {/* 칸은 참고 이미지와 같은 정사각형, 그림은 잘라 내지 않는다.
                비율이 제각각이라 잘라 놓으면 무엇을 만들었는지 모른다. */}
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted p-1">
              {work.cover ? (
                <ThumbImage src={work.cover} alt={work.title} className="h-full w-full object-contain" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">아직 그림이 없습니다</div>
              )}
            </div>
            <CardContent className="grid gap-2 p-3">
              <p className="truncate text-sm font-bold">{work.title}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{TOOL_LABEL[work.tool]}</Badge>
                {work.imageCount > 1 ? <Badge variant="secondary">{work.imageCount}장 묶음</Badge> : null}
                {showcase && isWorkShowcased(showcase, work.tool, work.id)
                  ? <Badge>첫 화면</Badge>
                  : null}
                {allMembers && !work.mine ? <Badge variant="secondary">{work.ownerEmail ?? "다른 회원"}</Badge> : null}
                {opening === work.id ? <Badge variant="secondary">여는 중…</Badge> : null}
                <Badge variant={(STATUS[work.status] ?? { tone: "secondary" as const }).tone}>
                  {(STATUS[work.status] ?? { label: work.status }).label}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 자세한 것은 큰 창이 보여준다. 여기 남는 것은 지우기 확인뿐이다.
          되돌릴 수 없는 일이라 한 번 더 묻는다. */}
      <Dialog open={Boolean(confirming)} onOpenChange={(next) => { if (!next) setConfirming(null); }}>
        <DialogContent className="max-w-md">
          {pending ? <>
            <DialogHeader>
              <DialogTitle>지울까요?</DialogTitle>
              <DialogDescription>
                「{pending.title}」{TOOL_LABEL[pending.tool]} 작업을 지웁니다.
                만들어 둔 그림도 함께 사라지고, 되돌릴 수 없습니다.
                {!pending.mine ? (
                  <>
                    <br />
                    <strong>{pending.ownerEmail ?? "다른 회원"}이 만든 것입니다.</strong> 만든 사람에게는 알리지 않습니다.
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" disabled={Boolean(deleting)} onClick={() => setConfirming(null)}>취소</Button>
              <Button variant="destructive" disabled={Boolean(deleting)} onClick={() => void remove(pending)}>
                {deleting === pending.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {deleting === pending.id ? "지우는 중…" : "지웁니다"}
              </Button>
            </DialogFooter>
          </> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
