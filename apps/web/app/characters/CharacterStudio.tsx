"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Textarea, cn,
} from "@fixup/ui";
import { openImageGallery, openImageViewer } from "../_components/image-viewer";
import { LibraryPickerButton } from "../_components/library-picker";
import { randomId } from "../../lib/browser-safe";
import { billableFetch } from "../../lib/billable-fetch";

/**
 * 캐릭터 만들기.
 *
 * 사람만 만들던 기능이었다. 지금은 **종류와 결을 따로 고른다** — 「애니풍
 * 사람」과 「실사 동물」이 둘 다 자연스러운 요구라 하나로 묶을 수 없다.
 *
 * **화면이 두 단계로 갈려 있다.** 1단계는 정면 후보를 만들고 하나를 고르는 데까지,
 * 2단계는 고른 정면을 기준으로 각도를 만드는 데까지다.
 *
 * 전에는 「이것으로 정하기」 한 번에 각도까지 만들어 버렸다. 그래서 각도 선택이
 * 후보 만들기 옵션 사이에 끼어 있었고 — 후보 생성 설정처럼 읽혔다 — 만들어진
 * 각도는 화면 반대편 「내 캐릭터」 카드에 조용히 들어가서, 사용자 눈에는 폼이
 * 비워지기만 하고 아무 일도 안 일어난 것으로 보였다.
 *
 * 크게 보기는 공용 뷰어를 쓴다. 전에는 이 화면만 자기 모달을 들고 있어서
 * 다른 화면과 조작이 달랐다.
 */

const KINDS = [
  { id: "person", label: "사람", hint: "실제 사람 같은 인물" },
  { id: "animal", label: "동물", hint: "강아지·고양이 등" },
  { id: "character", label: "캐릭터", hint: "등신 비율이 자유로운 창작물" },
  { id: "object", label: "사물", hint: "제품·소품" },
] as const;

const LOOKS = [
  { id: "photoreal", label: "실사", hint: "사진처럼" },
  { id: "anime", label: "애니", hint: "셀 셰이딩·굵은 선" },
  { id: "3d", label: "3D", hint: "3D 렌더" },
  { id: "illustration", label: "그림", hint: "손그림 질감" },
] as const;

type Kind = (typeof KINDS)[number]["id"];
type Look = (typeof LOOKS)[number]["id"];

/** 서버가 목록을 내려 주지만, 못 받았을 때도 화면이 서야 한다. */
const ANGLE_FALLBACK = [
  { id: "front", label: "정면" },
  { id: "left_45", label: "왼쪽 45°" },
  { id: "right_45", label: "오른쪽 45°" },
  { id: "left_90", label: "왼쪽" },
  { id: "right_90", label: "오른쪽" },
  { id: "back", label: "뒷면" },
];

/** 첨부한 그림의 쓸모. 둘은 정반대라 반드시 골라야 한다. */
const REFERENCE_ROLES = [
  { id: "style", label: "결만 따라 만들기", hint: "화풍·색·질감만 가져오고 캐릭터는 새로 만듭니다" },
  { id: "extract", label: "이 캐릭터 뽑아내기", hint: "그림 속 그 캐릭터를 그대로 살려 각도를 만듭니다" },
] as const;

type ReferenceRole = (typeof REFERENCE_ROLES)[number]["id"];

interface CharacterView { angle: string; url: string | null }

interface Character {
  id: string;
  name: string;
  sourcePrompt: string;
  kind: Kind;
  look: Look;
  createdAt: string;
  views: CharacterView[];
}

interface ImageModel { id: string; label: string; description: string; untested?: boolean }
interface LibraryImage { id: string; title: string | null; signedUrl: string | null }

type Candidate = { base64: string; mimeType: string };
type Attached = { url: string; base64: string; mimeType: string; role: ReferenceRole };

export function CharacterStudio() {
  /** 모르는 각도는 이름을 그대로 보여 준다. 조용히 감추면 그 장을 잃는다. */
  const angleLabel = (id: string) =>
    ANGLE_FALLBACK.find((angle) => angle.id === id)?.label ?? id;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [creditCost, setCreditCost] = useState(0);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<Kind>("person");
  const [look, setLook] = useState<Look>("photoreal");
  const [modelId, setModelId] = useState("");
  const [attached, setAttached] = useState<Attached | null>(null);
  const [library, setLibrary] = useState<LibraryImage[]>([]);

  const [candidateCount, setCandidateCount] = useState(2);
  const [angleList, setAngleList] = useState(ANGLE_FALLBACK);
  const [pickedAngles, setPickedAngles] = useState<string[]>(["left_45", "right_45", "back"]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  /**
   * 고른 정면 컷. 여기 값이 있으면 2단계다.
   *
   * **고를 때 만들지 않는다.** 예전에는 「이것으로 정하기」가 곧바로 각도까지
   * 만들어 버려서, 각도를 고르는 자리가 1단계에 있어야 했다. 그러니 후보를
   * 만드는 옵션처럼 읽혔고, 만들어진 각도는 화면 반대편 카드에 조용히 들어가
   * 아무 일도 안 일어난 것처럼 보였다.
   *
   * 만들 때 쓸 값을 함께 얼려 둔다 — 고른 뒤에 위 칸을 건드려도 이미 고른 그림과
   * 어긋나지 않아야 한다.
   */
  const [chosen, setChosen] = useState<
    (Candidate & { description: string; name: string; kind: Kind; look: Look; modelId: string }) | null
  >(null);
  const [busy, setBusy] = useState<"" | "candidates" | "create">("");
  /** 각도를 만드는 동안 자리를 잡아 둘 칸. 비면 만드는 중이 아니다. */
  const [pending, setPending] = useState<string[]>([]);
  const stepTwoRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const [redoing, setRedoing] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const body = await (await fetch("/api/characters", { cache: "no-store" })).json() as {
        ok?: boolean; characters?: Character[]; creditCost?: number; models?: ImageModel[];
        angles?: Array<{ id: string; label: string }>; defaultAngles?: string[];
      };
      setCharacters(body.ok ? (body.characters ?? []) : []);
      setModels(body.models ?? []);
      setCreditCost(body.creditCost ?? 0);
      if (body.angles?.length) setAngleList(body.angles);
      if (body.defaultAngles?.length) setPickedAngles(body.defaultAngles);
    } catch {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLibrary = useCallback(async () => {
    try {
      const body = await (await fetch("/api/reference-images", { cache: "no-store" })).json() as {
        ok?: boolean; images?: LibraryImage[];
      };
      setLibrary(body.ok ? (body.images ?? []) : []);
    } catch {
      // 라이브러리를 못 불러와도 새로 올리기는 그대로 된다.
    }
  }, []);

  useEffect(() => { void load(); void loadLibrary(); }, [load, loadLibrary]);

  /** 그림 한 장을 base64 로 읽는다. 서버는 본문을 그대로 fal 에 넘긴다. */
  async function readAsAttached(source: Blob, role: ReferenceRole): Promise<Attached> {
    const buffer = await source.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
    const base64 = btoa(binary);
    const mimeType = source.type || "image/png";
    return { url: `data:${mimeType};base64,${base64}`, base64, mimeType, role };
  }

  async function attachFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setMessage("");
    try {
      setAttached(await readAsAttached(file, attached?.role ?? "style"));
      // 올린 그림은 라이브러리에도 넣는다. 다음에 다시 쓸 수 있어야 한다.
      const form = new FormData();
      form.set("id", randomId());
      form.set("title", file.name.replace(/\.[^.]+$/, ""));
      form.set("purpose", "both");
      form.set("file", file);
      await fetch("/api/reference-images", { method: "POST", body: form });
      await loadLibrary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "그림을 읽지 못했습니다.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function attachFromLibrary(image: { id: string; url: string | null }) {
    if (!image.url) return setMessage("이 그림은 미리보기가 없어 쓸 수 없습니다.");
    if (attached && library.find((entry) => entry.id === image.id)?.signedUrl === attached.url) {
      return setAttached(null);
    }
    try {
      const response = await fetch(image.url);
      setAttached(await readAsAttached(await response.blob(), attached?.role ?? "style"));
    } catch {
      setMessage("그림을 불러오지 못했습니다.");
    }
  }

  const handleCandidates = async (append = false) => {
    if (!description.trim()) return setMessage("무엇을 만들지 적어 주세요.");
    setBusy("candidates");
    setMessage("");
    if (!append) setCandidates([]);
    try {
      const body = await (await billableFetch("/api/characters", {
        body: JSON.stringify({
          step: "candidates", description, kind, look, aspectRatio: "3:4",
          candidates: candidateCount,
          modelId: modelId || undefined,
          reference: attached
            ? { role: attached.role, base64: attached.base64, mimeType: attached.mimeType }
            : undefined,
        }),
      })).json() as { ok?: boolean; candidates?: Candidate[]; message?: string };

      // 앞의 후보를 지우지 않는다 — 먼저 것이 나았던 일이 생긴다.
      if (body.ok && body.candidates?.length) {
        setCandidates((current) => append ? [...current, ...body.candidates!] : body.candidates!);
      } else {
        setMessage(body.message ?? "후보를 만들지 못했습니다.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "후보를 만들지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  /** 1단계의 끝. 만들지 않고 고르기만 한다 — 만드는 것은 2단계다. */
  const handleChoose = (candidate: Candidate) => {
    setChosen({ ...candidate, description, name, kind, look, modelId });
    setMessage("");
    // 2단계가 화면 밖에 있으면 고른 것이 사라진 것처럼 보인다.
    requestAnimationFrame(() =>
      stepTwoRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  /** 2단계. 고른 정면을 기준으로 나머지 각도를 만들고 저장한다. */
  const handleCreate = async () => {
    if (!chosen) return;
    const angles = pickedAngles.filter((angle) => angle !== "front");
    setBusy("create");
    setPending(angles);
    setMessage(angles.length
      ? `고른 정면을 기준으로 각도 ${angles.length}장을 만드는 중입니다…`
      : "정면 한 장으로 저장하는 중입니다…");
    try {
      const body = await (await billableFetch("/api/characters", {
        body: JSON.stringify({
          step: "create",
          description: chosen.description, kind: chosen.kind, look: chosen.look,
          aspectRatio: "3:4",
          angles,
          modelId: chosen.modelId || undefined,
          name: (chosen.name.trim() || chosen.description).slice(0, 40),
          chosenBase64: chosen.base64,
          chosenMimeType: chosen.mimeType,
        }),
      })).json() as { ok?: boolean; message?: string; missingAngles?: number; referenceIssue?: string };

      if (!body.ok) return setMessage(body.message ?? "만들지 못했습니다.");

      // 조용히 넘어가지 않는다. 빠진 각도도 라이브러리 실패도 알린다.
      setMessage([
        "만들었습니다. 아래 「내 캐릭터」에 넣었습니다.",
        body.missingAngles ? `각도 ${body.missingAngles}개가 실패했습니다 — 거기서 다시 만드세요.` : "",
        body.referenceIssue ?? "",
      ].filter(Boolean).join(" "));
      setChosen(null);
      setCandidates([]);
      setDescription("");
      setName("");
      setAttached(null);
      await load();
      // 결과가 다른 카드에 들어간다. 데려다주지 않으면 못 찾는다.
      requestAnimationFrame(() =>
        libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "만들지 못했습니다.");
    } finally {
      setPending([]);
      setBusy("");
    }
  };

  const handleRedo = async (character: Character, angle: string) => {
    setRedoing(`${character.id}:${angle}`);
    setMessage("");
    try {
      const body = await (await billableFetch("/api/characters/views", {
        body: JSON.stringify({ characterId: character.id, angle }),
      })).json() as { ok?: boolean; message?: string };
      if (!body.ok) setMessage(body.message ?? "다시 만들지 못했습니다.");
      else await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "다시 만들지 못했습니다.");
    } finally {
      setRedoing("");
    }
  };

  const handleDelete = async (character: Character) => {
    if (!window.confirm(`'${character.name}' 를 지울까요? 라이브러리에 넣은 각도도 같이 지웁니다.`)) return;
    setDeletingId(character.id);
    try {
      await fetch("/api/characters", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: character.id }),
      });
      setCharacters((current) => current.filter((item) => item.id !== character.id));
    } finally {
      setDeletingId(null);
    }
  };

  // 서버의 selectCharacterModel 과 같은 표다. 결을 바꾸면 모델도 따라온다.
  const MODEL_BY_LOOK: Record<Look, string> = {
    photoreal: "nano-banana-pro",
    anime: "gpt-image-2",
    "3d": "gpt-image-2",
    illustration: "gpt-image-2",
  };
  const autoModel = MODEL_BY_LOOK[look];
  const activeModel = modelId || autoModel;
  const chosenModel = models.find((model) => model.id === activeModel);

  /**
   * 2단계에 들어가면 1단계 칸을 잠근다.
   *
   * 만들 때 쓰는 값은 고를 때 얼려 둔 것이라 여기를 고쳐도 결과가 바뀌지 않는다.
   * 고칠 수 있게 두면 바뀐 줄 알고 있다가 다른 것이 나온다.
   */
  const locked = Boolean(busy) || Boolean(chosen);
  const chosenSrc = chosen ? `data:${chosen.mimeType};base64,${chosen.base64}` : "";
  const extraAngleCount = pickedAngles.filter((angle) => angle !== "front").length;

  return (
    <div className="min-w-0">
      <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col">
        <div>
          <p className="mb-1 text-xs font-bold text-muted-foreground">부가 기능</p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-normal max-md:text-2xl">
            캐릭터 만들기
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            사람·동물·캐릭터·사물을 만들어 두면 카드뉴스·이미지 만들기·상세페이지에서
            <strong> 같은 대상</strong>이 나옵니다. 만들지 않고 그냥 생성하면 매번 다른 것이 나옵니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">내 캐릭터 {characters.length}</Badge>
          {creditCost ? <Badge variant="outline">1개당 약 {creditCost}장 차감</Badge> : null}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-4 max-xl:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>1단계 · 후보 만들기</CardTitle>
            <CardDescription>
              무엇을 어떤 결로 만들지 고르고 한 줄 적으면 정면 후보가 나옵니다.
              하나를 고르면 <strong>2단계</strong>가 열리고, 거기서 각도를 골라 만듭니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="grid gap-1.5">
              <legend className="text-meta text-subtle-foreground">종류</legend>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((entry) => (
                  <Button
                    key={entry.id} type="button" size="sm" disabled={locked}
                    variant={kind === entry.id ? "default" : "secondary"}
                    onClick={() => setKind(entry.id)}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-subtle-foreground">
                {KINDS.find((entry) => entry.id === kind)?.hint}
              </p>
            </fieldset>

            <fieldset className="grid gap-1.5">
              <legend className="text-meta text-subtle-foreground">결</legend>
              <div className="flex flex-wrap gap-2">
                {LOOKS.map((entry) => (
                  <Button
                    key={entry.id} type="button" size="sm" disabled={locked}
                    variant={look === entry.id ? "default" : "secondary"}
                    onClick={() => { setLook(entry.id); setModelId(""); }}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-subtle-foreground">
                {LOOKS.find((entry) => entry.id === look)?.hint}
              </p>
            </fieldset>

            {models.length ? (
              <fieldset className="grid gap-1.5">
                <legend className="text-meta text-subtle-foreground">모델</legend>
                <div className="flex flex-wrap gap-2">
                  {models.map((model) => (
                    <Button
                      key={model.id} type="button" size="sm" disabled={locked}
                      variant={activeModel === model.id ? "default" : "secondary"}
                      onClick={() => setModelId(model.id)}
                    >
                      {model.label}
                      {/* 아직 우리 쓰임에서 재 보지 않은 모델. 골라서 비교해
                          보라는 뜻이지 기본으로 밀지 않는다. */}
                      {model.untested ? <span className="ml-1 text-[10px] opacity-70">시험</span> : null}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-subtle-foreground">
                  {modelId
                    ? chosenModel?.description
                    : `고른 결에 맞춰 ${chosenModel?.label ?? autoModel} 로 만듭니다.`}
                </p>
                {chosenModel?.untested ? (
                  <p className="text-xs text-amber-700">
                    「시험」 표시가 붙은 모델입니다. 이 쓰임에서 더 나은지 아직 재지 않았습니다 —
                    같은 캐릭터를 기본 모델로도 만들어 견줘 보세요.
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            <label className="grid gap-1.5">
              <span className="text-meta text-subtle-foreground">이름 · 선택</span>
              <Input
                value={name} disabled={locked}
                placeholder="비우면 아래 묘사에서 가져옵니다"
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-meta text-subtle-foreground">무엇을 만들까요</span>
              <Textarea
                rows={3} value={description} disabled={locked}
                placeholder={
                  kind === "person" ? "예: 30대 후반 한국인 여성, 단발머리, 베이지색 니트, 차분한 표정"
                    : kind === "animal" ? "예: 주황색 줄무늬 고양이, 초록 눈, 목에 파란 스카프"
                      : kind === "object" ? "예: 유리병에 든 참기름, 크래프트 라벨, 금색 뚜껑"
                        : "예: 둥근 얼굴의 3등신 마스코트, 노란 몸, 파란 멜빵바지"
                }
                onChange={(event) => setDescription(event.target.value)}
              />
              {/* 장식이 아니다. 적은 말이 그대로 모델로 간다는 것과 종류가 묘사를
                  이기지 않는다는 것을 모르면, 엉뚱한 결과를 보고도 원인을 찾을 수 없다. */}
              <p className="text-xs leading-relaxed text-subtle-foreground">
                여기 적은 말이 <strong>그대로</strong> 이미지 모델로 들어갑니다. 위에서 고른
                종류·결은 각도·구도·질감 지시로 따로 붙습니다 — 둘이 함께 반영됩니다.
              </p>
              <p className="text-xs leading-relaxed text-subtle-foreground">
                한국어 그대로 보냅니다. 결과가 묘사와 자꾸 어긋나면 영어로 바꿔 적어 보세요.
                그리고 <strong>종류는 묘사에 맞춰</strong> 고르세요 — 「고양이」라고 적고
                종류를 「사람」으로 두면 사람 등신 지시와 섞여 엉뚱한 것이 나옵니다.
              </p>
            </label>

            <fieldset className="grid gap-1.5">
              <legend className="text-meta text-subtle-foreground">첫 후보 장수</legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((count) => (
                  <Button
                    key={count} type="button" size="sm" disabled={locked}
                    variant={candidateCount === count ? "default" : "secondary"}
                    onClick={() => setCandidateCount(count)}
                  >
                    {count}장
                  </Button>
                ))}
              </div>
              <p className="text-xs text-subtle-foreground">
                같은 조건으로 {candidateCount}번 그립니다. 전부 정면·무배경이고, 그중 하나를 골라
                나머지 각도의 기준으로 씁니다.
              </p>
            </fieldset>

            <fieldset className="grid gap-2 rounded-md border p-3">
              <legend className="px-1 text-meta text-subtle-foreground">참고할 그림 · 선택</legend>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp"
                  className="hidden" onChange={(event) => void attachFile(event.target.files)}
                />
                <Button type="button" variant="secondary" size="sm" disabled={locked}
                  onClick={() => fileInput.current?.click()}>
                  <ImagePlus className="size-4" />새 이미지 올리기
                </Button>
                <LibraryPickerButton
                  images={library.map((image) => ({ id: image.id, title: image.title, url: image.signedUrl }))}
                  selectedIds={[]}
                  onToggle={(image) => void attachFromLibrary(image)}
                  onReload={() => void loadLibrary()}
                />
              </div>

              {attached ? (
                <div className="flex gap-3">
                  <button
                    type="button" aria-label="첨부한 그림 크게 보기"
                    onClick={() => openImageViewer(attached.url, "첨부한 그림")}
                    className="h-24 w-20 flex-none overflow-hidden rounded border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={attached.url} alt="첨부한 그림" className="h-full w-full object-cover" />
                  </button>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <label className="grid gap-1 text-xs">
                      <span className="text-subtle-foreground">이 그림의 역할</span>
                      <select
                        aria-label="첨부한 그림의 역할"
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={attached.role} disabled={locked}
                        onChange={(event) =>
                          setAttached({ ...attached, role: event.target.value as ReferenceRole })}
                      >
                        {REFERENCE_ROLES.map((role) => (
                          <option key={role.id} value={role.id}>{role.label}</option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[11px] leading-snug text-subtle-foreground">
                      {REFERENCE_ROLES.find((role) => role.id === attached.role)?.hint}
                    </p>
                    <button
                      type="button" onClick={() => setAttached(null)}
                      className="justify-self-start text-xs text-subtle-foreground hover:text-destructive"
                    >
                      <X className="mr-1 inline size-3" />빼기
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-subtle-foreground">
                  없어도 됩니다. 붙이면 그 그림의 결을 따라 만들거나, 그 안의 캐릭터를 뽑아낼 수 있습니다.
                </p>
              )}
            </fieldset>

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={locked} onClick={() => void handleCandidates(false)}>
                {busy === "candidates"
                  ? <Loader2 size={16} className="mr-1.5 animate-spin" />
                  : <Sparkles size={16} className="mr-1.5" />}
                {busy === "candidates" ? "만드는 중…" : `후보 ${candidateCount}장 만들기`}
              </Button>
              {/* 2단계에는 자기 자리에 따로 띄운다. 여기 두면 한참 위에서 혼자 바뀐다. */}
              {message && !chosen ? (
                <span className="text-xs text-muted-foreground">{message}</span>
              ) : null}
              {chosen ? (
                <span className="text-xs text-muted-foreground">
                  아래 2단계를 하는 동안 잠급니다. 고치려면 「다시 고르기」를 누르세요.
                </span>
              ) : null}
            </div>

            {/* 1단계는 여기서 끝난다. 고르기만 하고 만들지 않는다. */}
            {candidates.length && !chosen ? (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">마음에 드는 것을 고르세요</p>
                  <Button
                    type="button" variant="secondary" size="sm" disabled={locked}
                    onClick={() => void handleCandidates(true)}
                  >
                    <RotateCw className="mr-1.5 size-3.5" />다른 후보 보기
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {candidates.map((candidate, index) => {
                    const src = `data:${candidate.mimeType};base64,${candidate.base64}`;
                    return (
                      <div key={index} className="space-y-2">
                        <button
                          type="button" aria-label={`후보 ${index + 1} 크게 보기`}
                          onClick={() => openImageGallery({
                            images: candidates.map((entry, position) => ({
                              src: `data:${entry.mimeType};base64,${entry.base64}`,
                              alt: `후보 ${position + 1}`,
                            })),
                            index,
                          })}
                          className="block aspect-[3/4] w-full overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-90"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt={`후보 ${index + 1}`} src={src} className="h-full w-full object-cover" />
                        </button>
                        <Button size="sm" className="w-full" disabled={locked}
                          onClick={() => handleChoose(candidate)}>
                          이것으로 정하기
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  고른다고 바로 만들지 않습니다 — 각도는 다음 단계에서 고릅니다.
                  앞의 후보도 지우지 않습니다. 먼저 것이 나았을 수 있습니다.
                </p>
              </div>
            ) : null}

            {/* 2단계. 고른 정면이 기준이고, 각도는 여기서 고른다.
                이 칸이 따로 서 있어야 「정하기」 다음에 무슨 일이 남았는지가 보인다. */}
            {chosen ? (
              <div
                ref={stepTwoRef}
                className="grid gap-3 rounded-md border border-primary/40 bg-primary-soft/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">2단계 · 각도 만들기</p>
                  <Button
                    type="button" variant="secondary" size="sm" disabled={Boolean(busy)}
                    onClick={() => { setChosen(null); setMessage(""); }}
                  >
                    <RotateCw className="mr-1.5 size-3.5" />다시 고르기
                  </Button>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button" aria-label="고른 정면 크게 보기"
                    onClick={() => openImageViewer(chosenSrc, "고른 정면")}
                    className="h-28 w-[84px] flex-none overflow-hidden rounded border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="고른 정면" src={chosenSrc} className="h-full w-full object-cover" />
                  </button>
                  <p className="text-xs leading-relaxed text-subtle-foreground">
                    이 정면으로 정했습니다. 정면은 다시 그리지 않고 <strong>그대로</strong> 씁니다 —
                    다시 그리면 얼굴이 달라집니다. 아래에서 켠 각도만 이 그림을 기준으로 더 만듭니다.
                  </p>
                </div>

                <fieldset className="grid gap-1.5">
                  <legend className="text-meta text-subtle-foreground">더 만들 각도</legend>
                  <div className="flex flex-wrap gap-2">
                    {angleList.map((angle) => {
                      // 정면은 고른 후보 그 자체라 늘 들어간다. 끌 수 없다.
                      const fixed = angle.id === "front";
                      const on = fixed || pickedAngles.includes(angle.id);
                      return (
                        <Button
                          key={angle.id} type="button" size="sm"
                          disabled={Boolean(busy) || fixed}
                          variant={on ? "default" : "secondary"}
                          onClick={() => setPickedAngles((current) =>
                            current.includes(angle.id)
                              ? current.filter((id) => id !== angle.id)
                              : [...current, angle.id])}
                        >
                          {angle.label}{fixed ? " (기본)" : ""}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-subtle-foreground">
                    켠 각도만 더 만듭니다 — 지금 {extraAngleCount}장. 정면 포함 {extraAngleCount + 1}장짜리가 됩니다.
                    {pickedAngles.some((id) => id.endsWith("_90"))
                      ? " 90° 측면은 얼굴이 반만 보여 다른 도구에서 인물 기준으로 쓰기에는 약합니다."
                      : ""}
                  </p>
                </fieldset>

                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={Boolean(busy)} onClick={() => void handleCreate()}>
                    {busy === "create"
                      ? <Loader2 size={16} className="mr-1.5 animate-spin" />
                      : <Sparkles size={16} className="mr-1.5" />}
                    {busy === "create"
                      ? "만드는 중…"
                      : extraAngleCount
                        ? `각도 ${extraAngleCount}장 만들기`
                        : "정면 한 장으로 저장"}
                  </Button>
                  {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
                </div>

                {/* 몇 십 초가 걸린다. 빈 자리라도 보여 줘야 뭐라도 되고 있다는 것을 안다. */}
                {pending.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <div className="aspect-[3/4] overflow-hidden rounded-md border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="정면" src={chosenSrc} className="h-full w-full object-cover" />
                      </div>
                      <p className="text-center text-[11px] text-subtle-foreground">정면 · 완료</p>
                    </div>
                    {pending.map((angle) => (
                      <div key={angle} className="space-y-1">
                        <div className="grid aspect-[3/4] place-items-center rounded-md border border-dashed bg-muted/50">
                          <Loader2 className="size-5 animate-spin text-subtle-foreground" />
                        </div>
                        <p className="text-center text-[11px] text-subtle-foreground">
                          {angleLabel(angle)} · 만드는 중
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* 만든 결과가 여기로 들어간다. 화면이 좁으면 한참 아래라, 다 만들고 나면
            데려다준다(handleCreate). 안 그러면 아무 일도 없었던 것처럼 보인다. */}
        <Card ref={libraryRef}>
          <CardHeader>
            <CardTitle>내 캐릭터</CardTitle>
            <CardDescription>
              라이브러리의 「캐릭터」 칸에서 불러 카드뉴스·이미지 만들기·상세페이지에 쓸 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />불러오는 중입니다.
              </div>
            ) : characters.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                아직 만든 것이 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {characters.map((character) => {
                  const byAngle = new Map(character.views.map((view) => [view.angle, view]));
                  return (
                    <div key={character.id} className="rounded-md border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <strong className="min-w-0 truncate text-sm">{character.name}</strong>
                        <Badge variant="outline" className="flex-none text-[10px]">
                          {KINDS.find((entry) => entry.id === character.kind)?.label ?? "사람"}
                          {" · "}
                          {LOOKS.find((entry) => entry.id === character.look)?.label ?? "실사"}
                        </Badge>
                        <Button
                          variant="ghost" size="sm"
                          className="ml-auto text-muted-foreground hover:text-destructive"
                          disabled={deletingId === character.id}
                          aria-label={`${character.name} 삭제`}
                          onClick={() => void handleDelete(character)}
                        >
                          {deletingId === character.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>

                      {/* 네 각도를 항상 네 칸으로 둔다. 빠진 각도가 빈 칸으로 보여야
                          채울 수 있다는 것을 안다. */}
                      <div className="grid grid-cols-3 gap-2">
                        {angleList.map(({ id: angle }) => {
                          const view = byAngle.get(angle);
                          const key = `${character.id}:${angle}`;
                          const filled = character.views.filter((entry) => entry.url);
                          return (
                            <div key={angle} className="min-w-0">
                              <button
                                type="button"
                                disabled={!view?.url}
                                aria-label={`${character.name} ${angleLabel(angle)} 크게 보기`}
                                onClick={() => openImageGallery({
                                  images: filled.map((entry) => ({
                                    src: entry.url as string,
                                    alt: `${character.name} ${angleLabel(entry.angle)}`,
                                    meta: [
                                      ["캐릭터", character.name],
                                      ["각도", angleLabel(entry.angle)],
                                      ["종류", KINDS.find((k) => k.id === character.kind)?.label ?? "사람"],
                                      ["결", LOOKS.find((l) => l.id === character.look)?.label ?? "실사"],
                                      ["묘사", character.sourcePrompt],
                                    ],
                                  })),
                                  index: Math.max(0, filled.findIndex((entry) => entry.angle === angle)),
                                })}
                                className={cn(
                                  "block w-full text-left",
                                  view?.url ? "transition-opacity hover:opacity-90" : "cursor-default",
                                )}
                              >
                                <span className="block aspect-[3/4] overflow-hidden rounded bg-muted">
                                  {view?.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={view.url} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="grid h-full place-items-center text-[10px] text-subtle-foreground">
                                      없음
                                    </span>
                                  )}
                                </span>
                              </button>
                              <div className="mt-1 flex items-center justify-between gap-1">
                                <span className="truncate text-[10px] text-subtle-foreground">
                                  {angleLabel(angle)}
                                </span>
                                {/* 정면은 고른 후보 그 자체다. 다시 만들면 나머지
                                    셋이 전부 남남이 된다. */}
                                {angle === "front" ? null : (
                                  <button
                                    type="button"
                                    disabled={redoing === key}
                                    aria-label={`${character.name} ${angleLabel(angle)} 다시 만들기`}
                                    onClick={() => void handleRedo(character, angle)}
                                    className="flex-none text-subtle-foreground hover:text-foreground disabled:opacity-50"
                                  >
                                    {redoing === key
                                      ? <Loader2 className="size-3 animate-spin" />
                                      : <RotateCw className="size-3" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
