"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Textarea,
  cn,
} from "@fixup/ui";

/**
 * 캐릭터 만들기.
 *
 * 상세페이지에 사람이 나오면 지금은 섹션마다 다른 사람이다. 여기서 인물을
 * 먼저 만들어 고정하면 그 사람이 페이지 내내 나온다.
 *
 * 세 단계다 — 묘사 입력 → 후보 2장 중 선택 → 앞·좌·우·뒤 4종 고정.
 * 사이에 사용자의 선택이 들어가서 한 번에 끝낼 수 없다.
 *
 * 화면 규격은 도구 화면(/create·/redesign)과 맞춘다. 이전에는 max-w-4xl 로
 * 가운데 좁게 뒀는데, 도구 화면은 셸 너비를 그대로 쓰고 좌우 2단으로 나눈다.
 * 그래서 캐릭터 화면만 여백이 다르게 보였다.
 */

const ANGLE_LABEL: Record<string, string> = {
  front: "정면",
  left: "좌측",
  right: "우측",
  back: "뒷모습",
};

interface CharacterView {
  angle: string;
  url: string | null;
}

interface Character {
  id: string;
  name: string;
  sourcePrompt: string;
  createdAt: string;
  views: CharacterView[];
}

type Candidate = { base64: string; mimeType: string };

/** 크게 보기. 라이브러리 뷰어와 같은 조작(좌우 이동, Esc 닫기)을 쓴다. */
interface ViewerState {
  title: string;
  images: Array<{ label: string; src: string }>;
  index: number;
}

export function CharacterStudio() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [creditCost, setCreditCost] = useState(0);
  const [loading, setLoading] = useState(true);

  const [description, setDescription] = useState("");
  const [photoreal, setPhotoreal] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState<"" | "candidates" | "create">("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/characters", { cache: "no-store" });
      const body = (await response.json()) as {
        ok?: boolean;
        characters?: Character[];
        creditCost?: number;
      };
      setCharacters(body.ok ? (body.characters ?? []) : []);
      setCreditCost(body.creditCost ?? 0);
    } catch {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 모달에서 좌우·Esc 를 쓴다. 라이브러리 뷰어와 조작을 맞춘다.
  useEffect(() => {
    if (!viewer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewer(null);
      if (event.key === "ArrowLeft") {
        setViewer((current) =>
          current
            ? { ...current, index: Math.max(0, current.index - 1) }
            : current,
        );
      }
      if (event.key === "ArrowRight") {
        setViewer((current) =>
          current
            ? {
                ...current,
                index: Math.min(current.images.length - 1, current.index + 1),
              }
            : current,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  const handleCandidates = async () => {
    if (!description.trim()) {
      setMessage("어떤 인물인지 적어주세요.");
      return;
    }
    setBusy("candidates");
    setMessage("");
    setCandidates([]);
    try {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "candidates",
          description,
          photoreal,
          aspectRatio: "3:4",
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        candidates?: Candidate[];
        message?: string;
      };
      if (body.ok && body.candidates?.length) setCandidates(body.candidates);
      else setMessage(body.message ?? "후보를 만들지 못했습니다.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "후보를 만들지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  };

  const handleChoose = async (candidate: Candidate) => {
    setBusy("create");
    setMessage("고른 인물로 다른 각도를 만드는 중입니다…");
    try {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "create",
          description,
          photoreal,
          aspectRatio: "3:4",
          name: description.slice(0, 40),
          chosenBase64: candidate.base64,
          chosenMimeType: candidate.mimeType,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      if (body.ok) {
        setMessage("캐릭터를 만들었습니다. 라이브러리에도 저장했습니다.");
        setCandidates([]);
        setDescription("");
        await load();
      } else {
        setMessage(body.message ?? "캐릭터를 만들지 못했습니다.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "캐릭터를 만들지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  };

  const handleDelete = async (character: Character) => {
    if (!window.confirm(`'${character.name}' 캐릭터를 삭제할까요?`)) return;
    setDeletingId(character.id);
    try {
      await fetch("/api/characters", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: character.id }),
      });
      setCharacters((current) =>
        current.filter((item) => item.id !== character.id),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const current = viewer?.images[viewer.index];

  return (
    <div className="min-w-0">
      {/* 도구 화면의 Topbar 규격 — 눈썹줄 + 제목 좌측, 상태는 우측. */}
      <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col">
        <div>
          <p className="mb-1 text-xs font-bold text-muted-foreground">
            부가 기능
          </p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-normal max-md:text-2xl">
            캐릭터 만들기
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            상세페이지에 사람을 넣고 싶은데 마땅한 사진이 없을 때 씁니다. 인물을
            만들어 두면 섹션마다 <strong>같은 사람</strong>이 나옵니다. 그냥
            생성하면 섹션마다 다른 사람이 나옵니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={characters.length ? "green" : "default"}>
            내 캐릭터 {characters.length}명
          </Badge>
          {creditCost ? (
            <Badge variant="outline">1명당 약 {creditCost}장 차감</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-4 max-xl:grid-cols-1">
        <Card>
          {/* CardHeader 는 세로 배치가 기본이라 뱃지가 한 줄을 다 먹는다.
              도구 화면처럼 제목 왼쪽·뱃지 오른쪽으로 눕힌다. */}
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 space-y-1.5">
              <CardTitle>새 인물 만들기</CardTitle>
              <CardDescription>
                후보 두 장 중 하나를 고르면, 그 인물의 정면·좌측·우측·뒷모습을
                만들어 고정합니다.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="flex-none">
              4종 고정
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="grid gap-1.5">
              <span className="text-meta text-subtle-foreground">
                어떤 인물인가요
              </span>
              <Textarea
                rows={3}
                value={description}
                disabled={Boolean(busy)}
                placeholder="예: 30대 후반 한국인 여성, 단발머리, 베이지색 니트, 차분한 표정"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={photoreal}
                disabled={Boolean(busy)}
                onChange={(event) => setPhotoreal(event.target.checked)}
              />
              실사 사진처럼 만들기
              <span className="text-xs text-muted-foreground">
                (끄면 일러스트 느낌으로 만듭니다)
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={Boolean(busy)}
                onClick={() => void handleCandidates()}
              >
                {busy === "candidates" ? (
                  <Loader2 size={16} className="mr-1.5 animate-spin" />
                ) : (
                  <Sparkles size={16} className="mr-1.5" />
                )}
                {busy === "candidates"
                  ? "후보를 만드는 중…"
                  : "후보 2장 만들기"}
              </Button>
              {message ? (
                <span className="text-xs text-muted-foreground">{message}</span>
              ) : null}
            </div>

            {candidates.length ? (
              <div>
                <p className="mb-2 text-sm font-medium">
                  마음에 드는 인물을 고르세요
                </p>
                <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                  {candidates.map((candidate, index) => {
                    const src = `data:${candidate.mimeType};base64,${candidate.base64}`;
                    return (
                      <div key={index} className="space-y-2">
                        <button
                          type="button"
                          aria-label={`후보 ${index + 1} 크게 보기`}
                          onClick={() =>
                            setViewer({
                              title: "후보",
                              images: candidates.map((entry, position) => ({
                                label: `후보 ${position + 1}`,
                                src: `data:${entry.mimeType};base64,${entry.base64}`,
                              })),
                              index,
                            })
                          }
                          className="block aspect-[3/4] w-full overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-90"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={`후보 ${index + 1}`}
                            src={src}
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={Boolean(busy)}
                          onClick={() => void handleChoose(candidate)}
                        >
                          {busy === "create" ? (
                            <Loader2
                              size={14}
                              className="mr-1.5 animate-spin"
                            />
                          ) : null}
                          이 인물로 정하기
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  이미지를 누르면 크게 볼 수 있습니다.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          {/* CardHeader 는 세로 배치가 기본이라 뱃지가 한 줄을 다 먹는다.
              도구 화면처럼 제목 왼쪽·뱃지 오른쪽으로 눕힌다. */}
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 space-y-1.5">
              <CardTitle>내 캐릭터</CardTitle>
              <CardDescription>
                상세페이지를 만들 때 등장인물로 고를 수 있습니다. 라이브러리에도
                함께 보관됩니다.
              </CardDescription>
            </div>
            <Badge variant="green" className="flex-none">
              {characters.length}명
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                불러오는 중입니다.
              </div>
            ) : characters.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                아직 만든 캐릭터가 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {characters.map((character) => (
                  <div key={character.id} className="rounded-md border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <strong className="min-w-0 truncate text-sm">
                        {character.name}
                      </strong>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        disabled={deletingId === character.id}
                        aria-label={`${character.name} 삭제`}
                        onClick={() => void handleDelete(character)}
                      >
                        {deletingId === character.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    {/* 4종이라 좁은 단에서도 접히지 않게 격자로 둔다. */}
                    <div className="grid grid-cols-4 gap-2">
                      {character.views.map((view, index) => (
                        <button
                          key={view.angle}
                          type="button"
                          aria-label={`${character.name} ${ANGLE_LABEL[view.angle] ?? view.angle} 크게 보기`}
                          onClick={() =>
                            setViewer({
                              title: character.name,
                              images: character.views
                                .filter((entry) => entry.url)
                                .map((entry) => ({
                                  label:
                                    ANGLE_LABEL[entry.angle] ?? entry.angle,
                                  src: entry.url as string,
                                })),
                              index,
                            })
                          }
                          className="min-w-0 text-left transition-opacity hover:opacity-90"
                        >
                          <span className="block aspect-[3/4] overflow-hidden rounded bg-muted">
                            {view.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                alt={view.angle}
                                src={view.url}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </span>
                          <span className="mt-1 block text-center text-meta text-subtle-foreground">
                            {ANGLE_LABEL[view.angle] ?? view.angle}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {viewer && current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${viewer.title} 크게 보기`}
          className="fixed inset-0 z-[60] flex flex-col bg-foreground/80 p-4 backdrop-blur-sm"
          onClick={() => setViewer(null)}
        >
          <div className="mx-auto flex w-full max-w-5xl flex-none items-center gap-3 pb-3 text-background">
            <div className="min-w-0">
              <strong className="block truncate text-sm">{viewer.title}</strong>
              <span className="block text-xs opacity-80">
                {current.label} · {viewer.index + 1} / {viewer.images.length}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="닫기"
              className="ml-auto text-background hover:bg-background/15"
              onClick={() => setViewer(null)}
            >
              <X size={18} />
            </Button>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="이전"
              disabled={viewer.index === 0}
              onClick={() => setViewer({ ...viewer, index: viewer.index - 1 })}
              className={cn(
                "grid h-11 w-11 flex-none place-items-center rounded-full",
                "bg-background/15 text-background hover:bg-background/25 disabled:opacity-30",
              )}
            >
              <ChevronLeft size={22} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* 여기는 화면에 맞춘 크기다. 한 번 더 누르면 원본 크기로 본다. */}
            <img
              alt={current.label}
              src={current.src}
              data-zoomable
              className="max-h-full max-w-full cursor-zoom-in rounded-md object-contain shadow-[var(--shadow-elevate)]"
            />
            <button
              type="button"
              aria-label="다음"
              disabled={viewer.index === viewer.images.length - 1}
              onClick={() => setViewer({ ...viewer, index: viewer.index + 1 })}
              className={cn(
                "grid h-11 w-11 flex-none place-items-center rounded-full",
                "bg-background/15 text-background hover:bg-background/25 disabled:opacity-30",
              )}
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div
            className="mx-auto flex w-full max-w-5xl flex-none justify-center pt-3"
            onClick={(event) => event.stopPropagation()}
          >
            <Button variant="outline" size="sm" asChild>
              <a
                href={current.src}
                download={`${viewer.title}-${current.label}.png`}
              >
                <Download size={14} className="mr-1.5" />이 이미지 저장
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
