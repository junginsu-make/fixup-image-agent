"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ImagePlus, Loader2, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, SidePanel, SidePanelBody, SidePanelContent, SidePanelDescription,
  SidePanelFooter, SidePanelHeader, SidePanelTitle, Textarea, cn,
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
  /**
   * 작업 패널이 열려 있는가.
   *
   * **후보 만들기부터 이 안에서 한다.** 전에는 만드는 자리가 페이지에 붙어
   * 있어서, 후보가 나오면 페이지가 길어지고 정면을 고르면 또 길어졌다. 결과는
   * 화면 반대편 카드에 들어가 거기까지 화면을 옮겨 줘야 했다.
   *
   * 왼쪽 페이지에는 무엇을 만들지 정하는 칸만 남는다. 패널을 닫으면 「내
   * 캐릭터」에 저장된 것이 보인다.
   */
  const [panelOpen, setPanelOpen] = useState(false);
  /**
   * 방금 만든 캐릭터. 창 안에서 결과까지 보여주려고 든다.
   *
   * 전에는 만들자마자 화면 반대편 카드로 데려다줬다. 만드는 데 몇 십 초를
   * 기다린 사람이 그 사이에 다른 곳을 보고 있으면, 화면이 혼자 움직여 어디로
   * 갔는지 모른다. 만든 자리에서 그대로 보여준다.
   */
  const [created, setCreated] = useState<Character | null>(null);
  const [redoing, setRedoing] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * 목록을 다시 읽는다. **읽은 것을 돌려준다.**
   *
   * 방금 만든 것을 곧바로 찾아야 하는데, 상태를 넣기만 하면 그 자리에서는
   * 아직 예전 값이라 못 찾는다.
   */
  const load = useCallback(async (): Promise<Character[]> => {
    try {
      const body = await (await fetch("/api/characters", { cache: "no-store" })).json() as {
        ok?: boolean; characters?: Character[]; creditCost?: number; models?: ImageModel[];
        angles?: Array<{ id: string; label: string }>; defaultAngles?: string[];
      };
      const list = body.ok ? (body.characters ?? []) : [];
      setCharacters(list);
      setModels(body.models ?? []);
      setCreditCost(body.creditCost ?? 0);
      if (body.angles?.length) setAngleList(body.angles);
      if (body.defaultAngles?.length) setPickedAngles(body.defaultAngles);
      return list;
    } catch {
      setCharacters([]);
      return [];
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
    if (!append) {
      setCandidates([]);
      setChosen(null);
      setCreated(null);
    }
    // 만드는 일은 전부 패널 안에서 본다. 기다리는 동안에도 열려 있어야
    // 무엇이 되고 있는지 안다.
    setPanelOpen(true);
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

  /** 정면을 고른다. 아직 만들지 않는다 — 저장은 다음 자리에서 정한다. */
  const handleChoose = (candidate: Candidate) => {
    setChosen({ ...candidate, description, name, kind, look, modelId });
    setCreated(null);
    setMessage("");
  };

  /**
   * 작업 패널을 닫는다.
   *
   * **만들고 나서 닫을 때만 왼쪽 칸을 비운다.** 만들기 전에 닫는 것은 「잠깐
   * 접어 둔다」는 뜻이지 「버린다」가 아니다 — 만들어 둔 후보는 크레딧을 쓴
   * 결과다. 다시 열면 그대로 있다.
   */
  const closePanel = () => {
    setPanelOpen(false);
    if (!created) return;
    setChosen(null);
    setCreated(null);
    setCandidates([]);
    setDescription("");
    setName("");
    setAttached(null);
    setMessage("");
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
      })).json() as {
        ok?: boolean; id?: string; message?: string; missingAngles?: number; referenceIssue?: string;
      };

      if (!body.ok) return setMessage(body.message ?? "만들지 못했습니다.");

      // 조용히 넘어가지 않는다. 빠진 각도도 라이브러리 실패도 알린다.
      setMessage([
        "만들었습니다. 「내 캐릭터」와 라이브러리에 넣었습니다.",
        body.missingAngles ? `각도 ${body.missingAngles}개가 실패했습니다 — 「내 캐릭터」에서 다시 만드세요.` : "",
        body.referenceIssue ?? "",
      ].filter(Boolean).join(" "));

      // 창을 닫지 않는다. 결과를 만든 자리에서 그대로 보여준다 — 화면을 혼자
      // 옮기면 몇 십 초 기다린 사람이 어디로 갔는지 모른다. 1단계를 비우는
      // 것은 사용자가 창을 닫을 때 한다.
      const refreshed = await load();
      setCreated(refreshed.find((entry) => entry.id === body.id) ?? null);
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
              {/* 만드는 중의 말은 패널이 한다. 여기 두면 한참 위에서 혼자 바뀐다. */}
              {message && !chosen ? (
                <span className="text-xs text-muted-foreground">{message}</span>
              ) : null}
              {chosen ? (
                <span className="text-xs text-muted-foreground">
                  오른쪽 패널에서 만드는 동안 잠급니다. 고치려면 「다시 고르기」를 누르세요.
                </span>
              ) : null}
            </div>

            {/* 만드는 일은 오른쪽 패널에서 한다. 여기에는 닫아 둔 사이에도
                「하던 것이 있다」만 남긴다 — 다시 열 길이 없으면 만들어 둔
                후보가 사라진 것처럼 보인다. */}
            {!panelOpen && (candidates.length || chosen) ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary-soft/40 p-3">
                {chosen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="고른 정면" src={chosenSrc} className="h-16 w-12 flex-none rounded border object-cover" />
                ) : null}
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-subtle-foreground">
                  {created
                    ? "만들기를 마쳤습니다. 결과를 다시 보려면 여세요."
                    : chosen
                      ? "정면을 정했습니다. 저장할지 각도를 더 만들지 패널에서 고릅니다."
                      : `후보 ${candidates.length}장을 만들어 뒀습니다.`}
                </p>
                <Button type="button" size="sm" onClick={() => setPanelOpen(true)}>
                  {created ? "결과 보기" : "이어서 하기"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* 저장된 것. 패널을 닫으면 여기서 본다. */}
        <Card>
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
                {characters.map((character) => (
                  <CharacterRow
                    key={character.id}
                    character={character}
                    angles={angleList}
                    angleLabel={angleLabel}
                    redoing={redoing}
                    deleting={deletingId === character.id}
                    onRedo={(angle) => void handleRedo(character, angle)}
                    onDelete={() => void handleDelete(character)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 만드는 일은 전부 여기서 한다 — 후보 고르기, 저장할지 각도까지 갈지,
          그리고 결과까지.

          전에는 이 셋이 페이지에 차례로 붙어서 하나 할 때마다 페이지가
          길어졌다. 결과는 화면 반대편 카드에 들어가 거기까지 화면을 옮겨
          줘야 했다. 아래에서 올리는 창으로도 해 봤는데 화면 높이에 갇혀
          그림 넉 장을 늘어놓기에 좁았다. 옆에서 나오면 높이를 통째로 쓴다. */}
      <SidePanel open={panelOpen} onOpenChange={(next) => { if (!next) closePanel(); }}>
        <SidePanelContent>
          <SidePanelHeader className="pr-12">
            <SidePanelTitle>
              {created ? "다 만들었습니다" : chosen ? "저장하거나, 각도를 더 만들거나" : "정면 후보 고르기"}
            </SidePanelTitle>
            <SidePanelDescription>
              {created
                ? "「내 캐릭터」와 라이브러리에 넣었습니다. 카드뉴스·이미지 만들기·상세페이지에서 불러 씁니다."
                : chosen
                  ? "정면 한 장으로 저장해도 되고, 각도를 더 만들어 한 벌로 저장해도 됩니다."
                  : "마음에 드는 정면을 고르세요. 고른다고 바로 만들지 않습니다."}
            </SidePanelDescription>
          </SidePanelHeader>

          <SidePanelBody className="grid gap-4">
            {created ? (
              /* 만든 결과. 패널을 닫기 전에 여기서 다 본다. */
              <div className="grid grid-cols-2 gap-3">
                {created.views.filter((view) => view.url).map((view) => (
                  <button
                    key={view.angle}
                    type="button"
                    aria-label={angleLabel(view.angle) + " 크게 보기"}
                    onClick={() => openImageGallery({
                      images: created.views.filter((entry) => entry.url).map((entry) => ({
                        src: entry.url as string,
                        alt: created.name + " · " + angleLabel(entry.angle),
                        name: created.name + " " + angleLabel(entry.angle) + ".png",
                      })),
                    })}
                    className="space-y-1 text-left"
                  >
                    <div className="aspect-[3/4] overflow-hidden rounded-md border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={angleLabel(view.angle)} src={view.url as string} className="h-full w-full object-cover" />
                    </div>
                    <p className="text-center text-[11px] text-subtle-foreground">{angleLabel(view.angle)}</p>
                  </button>
                ))}
              </div>
            ) : chosen ? (
              <>
                <div className="flex gap-3">
                  <button
                    type="button" aria-label="고른 정면 크게 보기"
                    onClick={() => openImageViewer(chosenSrc, "고른 정면")}
                    className="h-32 w-24 flex-none overflow-hidden rounded border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="고른 정면" src={chosenSrc} className="h-full w-full object-cover" />
                  </button>
                  <p className="text-xs leading-relaxed text-subtle-foreground">
                    이 정면으로 정했습니다. 정면은 다시 그리지 않고 <strong>그대로</strong> 씁니다 —
                    다시 그리면 얼굴이 달라집니다.
                  </p>
                </div>

                {/* 저장만 할지, 각도까지 갈지를 **먼저 묻는다.**

                    전에는 각도 단추를 모두 꺼야 「정면 한 장으로 저장」이
                    나타났다. 할 수는 있는데 보이지 않는 길이었다. */}
                <fieldset className="grid gap-2">
                  <legend className="text-meta text-subtle-foreground">어떻게 저장할까요</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button" disabled={Boolean(busy)}
                      onClick={() => setPickedAngles([])}
                      className={cn(
                        "rounded-md border p-3 text-left transition-colors disabled:opacity-60",
                        extraAngleCount === 0 ? "border-primary bg-primary-soft" : "hover:bg-muted",
                      )}
                    >
                      <span className="block text-sm font-bold">정면 한 장만</span>
                      <span className="mt-1 block text-xs text-subtle-foreground">
                        더 만들지 않고 지금 것을 그대로 저장합니다. 크레딧이 더 들지 않습니다.
                      </span>
                    </button>
                    <button
                      type="button" disabled={Boolean(busy)}
                      onClick={() => { if (!extraAngleCount) setPickedAngles(["left_45", "right_45", "back"]); }}
                      className={cn(
                        "rounded-md border p-3 text-left transition-colors disabled:opacity-60",
                        extraAngleCount > 0 ? "border-primary bg-primary-soft" : "hover:bg-muted",
                      )}
                    >
                      <span className="block text-sm font-bold">각도를 더 만들어 한 벌로</span>
                      <span className="mt-1 block text-xs text-subtle-foreground">
                        정면을 기준으로 다른 각도를 더 그립니다. 만든 장수만큼 크레딧이 듭니다.
                      </span>
                    </button>
                  </div>
                </fieldset>

                {extraAngleCount > 0 ? (
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
                      정면 포함 {extraAngleCount + 1}장짜리가 됩니다.
                      {pickedAngles.some((id) => id.endsWith("_90"))
                        ? " 90° 측면은 얼굴이 반만 보여 다른 도구에서 인물 기준으로 쓰기에는 약합니다."
                        : ""}
                    </p>
                  </fieldset>
                ) : null}

                {/* 몇 십 초가 걸린다. 빈 자리라도 보여 줘야 뭐라도 되고 있다는 것을 안다. */}
                {pending.length ? (
                  <div className="grid grid-cols-2 gap-3">
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
              </>
            ) : (
              /* 후보 고르기. 만드는 동안에도 이 자리에 있어야 기다리는 줄 안다. */
              <>
                {busy === "candidates" && !candidates.length ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: candidateCount }).map((_, index) => (
                      <div key={index} className="space-y-1">
                        <div className="grid aspect-[3/4] place-items-center rounded-md border border-dashed bg-muted/50">
                          <Loader2 className="size-5 animate-spin text-subtle-foreground" />
                        </div>
                        <p className="text-center text-[11px] text-subtle-foreground">만드는 중</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {candidates.length ? (
                  <div className="grid grid-cols-2 gap-3">
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
                          <Button size="sm" className="w-full" disabled={Boolean(busy)}
                            onClick={() => handleChoose(candidate)}>
                            이것으로 정하기
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {candidates.length ? (
                  <p className="text-xs text-muted-foreground">
                    앞의 후보도 지우지 않습니다. 먼저 것이 나았을 수 있습니다.
                  </p>
                ) : null}
              </>
            )}
          </SidePanelBody>

          {/* 단추는 늘 보이는 바닥에 둔다. 고르다 단추를 찾아 몸통을 굴려
              내려가야 하면 흐름이 끊긴다. */}
          <SidePanelFooter className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {created ? (
                <Button onClick={closePanel}>닫고 새로 만들기</Button>
              ) : chosen ? (
                <>
                  <Button disabled={Boolean(busy)} onClick={() => void handleCreate()}>
                    {busy === "create"
                      ? <Loader2 size={16} className="mr-1.5 animate-spin" />
                      : <Sparkles size={16} className="mr-1.5" />}
                    {busy === "create"
                      ? "만드는 중…"
                      : extraAngleCount
                        ? "각도 " + extraAngleCount + "장 만들고 저장"
                        : "정면 한 장으로 저장"}
                  </Button>
                  <Button
                    type="button" variant="secondary" disabled={Boolean(busy)}
                    onClick={() => { setChosen(null); setMessage(""); }}
                  >
                    <RotateCw className="mr-1.5 size-3.5" />다시 고르기
                  </Button>
                </>
              ) : (
                <Button
                  type="button" variant="secondary" disabled={Boolean(busy) || !candidates.length}
                  onClick={() => void handleCandidates(true)}
                >
                  <RotateCw className="mr-1.5 size-3.5" />다른 후보 보기
                </Button>
              )}
            </div>
            {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          </SidePanelFooter>
        </SidePanelContent>
      </SidePanel>
    </div>
  );
}

/**
 * 「내 캐릭터」 한 줄. 정면만 보이고, 누르면 나머지 각도가 펼쳐진다.
 *
 * 여섯 칸을 늘 펼쳐 두니 캐릭터가 두어 개만 되어도 카드가 화면을 넘겨 무엇이
 * 무엇인지 안 보였다. 라이브러리의 작업물 카드와 같이 대표 한 장만 두고
 * 접는다. 접힌 채로도 장수를 말해야 한다 — 안 그러면 정면 한 장짜리인지
 * 접힌 것인지 구분할 수 없다. 펼침은 캐릭터마다 따로 든다.
 *
 * **「없음」이 두 가지 뜻이었다.** 전에는 서버가 주는 각도 여섯을 늘 여섯 칸으로
 * 그려서, 애초에 안 고른 각도와 만들다 실패한 각도가 똑같이 「없음」으로
 * 보였다(2026-09-04 사용자 화면에서 6칸 중 3칸). 고장인지 아닌지 알 수 없다.
 * 지금은 저장된 각도만 칸을 만들고, 없는 각도는 아래 더 만들 수 있는 자리로
 * 뺀다. 둘을 갈라 말하지는 않는다 — 캐릭터 데이터에 가를 근거가 없다. 실패한
 * 각도는 행을 아예 안 남기므로(characters.ts 의 create 는 성공한 것만 넣는다)
 * 안 고른 각도와 똑같이 「없음」이다.
 */
function CharacterRow({ character, angles, angleLabel, redoing, deleting, onRedo, onDelete }: {
  character: Character;
  angles: Array<{ id: string; label: string }>;
  angleLabel: (id: string) => string;
  redoing: string;
  deleting: boolean;
  onRedo: (angle: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = character.views.filter((view) => view.url);
  const cover = character.views.find((view) => view.angle === "front" && view.url) ?? shown[0];
  // 정면은 고른 후보 그 자체라 다시 만들 수 없다(서버가 막는다). 빠진 목록에서도 뺀다.
  const missing = angles.filter((angle) =>
    angle.id !== "front" && !character.views.some((view) => view.angle === angle.id));
  const panelId = `character-angles-${character.id}`;

  const openGallery = (angle: string) => openImageGallery({
    images: shown.map((entry) => ({
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
    index: Math.max(0, shown.findIndex((entry) => entry.angle === angle)),
  });

  return (
    <div className="rounded-md border p-3">
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
          disabled={deleting}
          aria-label={`${character.name} 삭제`}
          onClick={onDelete}
        >
          {deleting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* 미리보기 자체가 펼침 단추다. 크게 보기는 펼친 뒤 각 칸에서 한다 —
          한 자리에 두 뜻을 겹치면 어느 쪽이 나올지 알 수 없다. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded text-left hover:opacity-90"
      >
        <span className="h-[80px] w-[60px] flex-none overflow-hidden rounded bg-muted">
          {cover?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full place-items-center text-[10px] text-subtle-foreground">없음</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium">
            {cover ? angleLabel(cover.angle) : "보여 줄 그림이 없습니다"}
          </span>
          <span className="block text-[11px] leading-snug text-subtle-foreground">
            {shown.length > 1
              ? `다른 각도 +${shown.length - 1}장`
              : missing.length
                ? "각도가 이것뿐입니다 — 눌러서 더 만들 수 있습니다"
                : "각도가 이것뿐입니다"}
          </span>
        </span>
        {open
          ? <ChevronDown className="size-4 flex-none text-subtle-foreground" />
          : <ChevronRight className="size-4 flex-none text-subtle-foreground" />}
      </button>

      {open ? (
        <div id={panelId} className="mt-3 space-y-3">
          {character.views.length ? (
            <div className="grid grid-cols-3 gap-2">
              {character.views.map((view) => (
                <AngleCell
                  key={view.angle}
                  name={character.name}
                  label={angleLabel(view.angle)}
                  view={view}
                  busy={redoing === `${character.id}:${view.angle}`}
                  onOpen={() => openGallery(view.angle)}
                  onRedo={() => onRedo(view.angle)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded border border-dashed p-3 text-center text-xs text-subtle-foreground">
              저장된 각도가 없습니다.
            </p>
          )}

          {/* 없는 각도를 칸으로 그리지 않는다 — 안 고른 것까지 「없음」으로 보여
              고장처럼 읽혔다. 여기서는 채우는 방법만 말한다. */}
          {missing.length ? (
            <div className="rounded border border-dashed p-2">
              <p className="mb-1.5 text-[11px] leading-snug text-subtle-foreground">
                이 캐릭터에 없는 각도입니다. 만들 때 안 고른 것일 수도, 만들다 실패한 것일 수도
                있습니다 — 어느 쪽인지는 남아 있지 않습니다.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((angle) => {
                  const busy = redoing === `${character.id}:${angle.id}`;
                  return (
                    <Button
                      key={angle.id} type="button" variant="secondary" size="sm"
                      disabled={busy}
                      onClick={() => onRedo(angle.id)}
                    >
                      {busy
                        ? <Loader2 className="mr-1 size-3 animate-spin" />
                        : <Sparkles className="mr-1 size-3" />}
                      {angle.label} 만들기
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 저장된 각도 한 칸.
 *
 * 행은 있는데 `url` 이 없는 경우가 따로 있다 — 파일은 있고 서명 URL 만 못 받은
 * 것이다. 이것을 「없음」이라고 하면 만들다 실패한 것으로 읽혀 쓸데없이 다시
 * 만들게 된다. 그래서 말을 다르게 한다.
 */
function AngleCell({ name, label, view, busy, onOpen, onRedo }: {
  name: string;
  label: string;
  view: CharacterView;
  busy: boolean;
  onOpen: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="min-w-0">
      <button
        type="button"
        disabled={!view.url}
        aria-label={`${name} ${label} 크게 보기`}
        onClick={onOpen}
        className={cn(
          "block w-full text-left",
          view.url ? "transition-opacity hover:opacity-90" : "cursor-default",
        )}
      >
        <span className="block aspect-[3/4] overflow-hidden rounded bg-muted">
          {view.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full place-items-center px-1 text-center text-[10px] leading-tight text-subtle-foreground">
              그림을 못 불러왔습니다
            </span>
          )}
        </span>
      </button>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="truncate text-[10px] text-subtle-foreground">{label}</span>
        {/* 정면은 고른 후보 그 자체다. 다시 만들면 나머지가 전부 남남이 된다. */}
        {view.angle === "front" ? null : (
          <button
            type="button"
            disabled={busy}
            aria-label={`${name} ${label} 다시 만들기`}
            onClick={onRedo}
            className="flex-none text-subtle-foreground hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
          </button>
        )}
      </div>
    </div>
  );
}
