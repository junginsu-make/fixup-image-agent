"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { openImageGallery } from "../_components/image-viewer";
import { isShowcased, type ShowcaseAdminView } from "../api/showcase/core";
import {
  Badge, Button, Card, CardContent,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@fixup/ui";

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

type Tool = "sns" | "poster";

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
  cover: string | null;
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

const TOOL_LABEL: Record<Tool, string> = { sns: "카드뉴스", poster: "이미지" };

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
  const cards: Array<{ index: number; assetUrl?: string | null; copy?: { headline?: string } }> =
    project.data?.flow?.cards ?? [];
  const images = cards
    .filter((card) => card.assetUrl)
    .map((card) => ({ url: card.assetUrl as string, label: `${card.index}번 카드`, index: card.index }));
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
    cover: images[0]?.url ?? null,
    images,
    intent: snsIntent(project.data?.source),
    settings: [
      ["비율", project.ratio],
      ["언어", project.language],
      ["모델", project.modelId],
      ["장수", project.cardCountMode === "fixed" ? `${project.cardCount}장 고정` : "AI 추천"],
      ...(project.toneNote ? ([["톤·요청", project.toneNote]] as Array<[string, string]>) : []),
      ["첨부 그림", `${(project.data?.attachments ?? []).length}장`],
    ],
    href: `/sns/${project.id}`,
  };
}

function toPosterWork(project: Record<string, any>): Work {
  const images: WorkImage[] = (project.images ?? [])
    .filter((image: { url?: string }) => image.url)
    .map((image: { url: string; variantIndex: number }) => ({
      url: image.url, label: `변형 ${image.variantIndex + 1}`, index: image.variantIndex,
    }));
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
    cover: images[0]?.url ?? null,
    images,
    intent: project.data?.instruction ?? "",
    settings: [
      ["비율", project.ratio],
      ["모델", project.modelId],
      ["변형", `${project.data?.variants ?? 0}장`],
      ["따라 만들 그림", `${(project.data?.referenceIds ?? []).length}장`],
      ["그대로 지킬 것", `${(project.data?.preservedIds ?? []).length}장`],
    ],
    href: `/poster/${project.id}`,
  };
}

export function WorksTab() {
  const router = useRouter();
  const [works, setWorks] = React.useState<Work[] | null>(null);
  const [message, setMessage] = React.useState("");
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
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
  function openWork(work: Work) {
    const meta: Array<[string, string]> = [
      ["만든 때", when(work.createdAt || work.updatedAt)],
      ["도구", TOOL_LABEL[work.tool]],
      ...(work.intent ? ([["무엇을 만들려던 것인가", work.intent]] as Array<[string, string]>) : []),
      ...work.settings.filter(([, value]) => value),
      ["만든 사람", work.ownerEmail ?? work.userId ?? "확인할 수 없음"],
    ];
    openImageGallery({
      images: work.images.map((image) => ({
        src: image.url,
        alt: `${work.title} · ${image.label}`,
        name: `${work.title} ${image.label}.png`,
        meta,
      })),
      deleteLabel: "이 작업 지우기",
      // 지우기는 자기 것만이다. 관리자라도 남이 크레딧을 써서 만든 결과를
      // 되돌릴 수 없게 없애지는 못한다 — 보려고 목록을 여는 일과 무게가 다르다.
      onDelete: work.mine ? () => setConfirming(work.id) : undefined,
      // 관리자에게만 보인다. 넘겨보다 마음에 드는 장에서 바로 건다.
      action: showcase
        ? {
            label: "첫 화면에 걸기",
            doneLabel: "첫 화면에 걸림",
            doneAt: (position) => {
              const image = work.images[position];
              return image ? isShowcased(showcase, work.tool, work.id, image.index) : false;
            },
            run: (position) => void feature(work, position),
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
  async function feature(work: Work, position: number) {
    const image = work.images[position];
    if (!image || featuring) return;
    setFeaturing(work.id);
    setNotice("");
    try {
      const response = await fetch("/api/showcase/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKind: work.tool,
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
          width: null,
          height: null,
          caption: null,
          kindLabel: TOOL_LABEL[work.tool],
          sourceKind: work.tool,
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
      const endpoint = work.tool === "sns"
        ? `/api/sns/projects/${work.id}`
        : `/api/poster/projects/${work.id}`;
      const body = await (await fetch(endpoint, { method: "DELETE" })).json();
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
              const body = await (await fetch("/api/admin/works", { cache: "no-store" })).json();
              if (!body.ok) throw new Error(body.message ?? "작업물을 불러오지 못했습니다.");
              return [
                ...(body.sns ?? []).map(toSnsWork),
                ...(body.poster ?? []).map(toPosterWork),
              ];
            })()
          : await (async () => {
              // 두 도구를 함께 읽어 한 목록으로 만든다. 사용자에게는 "내가 만든 것"이 하나다.
              const [sns, poster] = await Promise.all([
                fetch("/api/sns/projects", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
                fetch("/api/poster/projects", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
              ]);
              return [
                ...(sns.ok ? (sns.projects ?? []).map(toSnsWork) : []),
                ...(poster.ok ? (poster.projects ?? []).map(toPosterWork) : []),
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
              ? "모든 회원이 만든 결과물입니다. 지우기는 자기 것에만 열립니다."
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
          <Card key={`${work.tool}-${work.id}`} className="cursor-pointer overflow-hidden" onClick={() => (work.images.length ? openWork(work) : router.push(work.href))}>
            {/* 칸은 참고 이미지와 같은 정사각형, 그림은 잘라 내지 않는다.
                비율이 제각각이라 잘라 놓으면 무엇을 만들었는지 모른다. */}
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted p-1">
              {work.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={work.cover} alt={work.title} className="h-full w-full object-contain" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">아직 그림이 없습니다</div>
              )}
            </div>
            <CardContent className="grid gap-2 p-3">
              <p className="truncate text-sm font-bold">{work.title}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{TOOL_LABEL[work.tool]}</Badge>
                {work.images.length > 1 ? <Badge variant="secondary">{work.images.length}장 묶음</Badge> : null}
                {showcase && work.images.some((image) => isShowcased(showcase, work.tool, work.id, image.index))
                  ? <Badge>첫 화면</Badge>
                  : null}
                {allMembers && !work.mine ? <Badge variant="secondary">{work.ownerEmail ?? "다른 회원"}</Badge> : null}
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
