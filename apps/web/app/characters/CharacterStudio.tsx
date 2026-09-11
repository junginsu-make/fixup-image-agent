"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, Grid2X2, ImagePlus, Layers, Loader2, Maximize2, RotateCw,
  Sparkles, Trash2, UserRound, X,
} from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, StepBar, Textarea, cn, type StepDefinition,
} from "@fixup/ui";
import { openImageGallery, openImageViewer } from "../_components/image-viewer";
import { LibraryPickerButton } from "../_components/library-picker";
import { modelDisplayName } from "../../lib/model-name";
import { randomId } from "../../lib/browser-safe";
import { billableFetch } from "../../lib/billable-fetch";

/**
 * 캐릭터 만들기.
 *
 * 사람만 만들던 기능이었다. 지금은 **종류와 결을 따로 고른다** — 「애니풍
 * 사람」과 「실사 동물」이 둘 다 자연스러운 요구라 하나로 묶을 수 없다.
 *
 * ── 화면은 **두 단계**다 (2026-09-11 개편) ────────────────────────
 *
 *   1단계  무엇을 만들지 고르고 만든다. 정면이 나오면 **그 자리에서** 크게 보고,
 *          정면으로 끝낼지 각도를 더 만들지 고른다
 *   2단계  결과만 본다
 *
 * 전에는 오른쪽에서 밀려 나오는 작업 패널이 그 일을 했다. 패널은 화면 절반을
 * 덮으면서도 세로로 늘어나 선택 카드 하나가 화면의 3분의 1을 먹었고, 닫히면
 * 돌아갈 길이 없어 **테두리 손잡이**라는 부품이 하나 더 필요했다. 다른 도구는
 * 전부 단계로 나뉘어 있는데 이 화면만 달랐다.
 *
 * 단계로 나누니 패널도 손잡이도 필요 없다 — 만드는 중에도 페이지가 그대로
 * 있고, 어디까지 왔는지는 위의 단계 막대가 말한다.
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

/**
 * 다각도 한 장 — **각도가 아니다.**
 *
 * 여섯 각도를 한 그림 안에 3×2 로 담은 한 장이다. 각도를 낱장으로 여섯 개
 * 만들면 여섯 번 그리고 여섯 번 내는데, 한눈에 보려는 쓰임에는 한 장이면
 * 되고 그러면 한 장 값만 든다. 그래서 각도 목록과 나란히 두되 줄을 나눈다.
 */
const SHEET_FALLBACK = { id: "sheet", label: "다각도 한 장" };

/** 첨부한 그림의 쓸모. 둘은 정반대라 반드시 골라야 한다. */
const REFERENCE_ROLES = [
  // **뽑아내기가 먼저이자 기본이다**(2026-09-11 사용자 결정). 그림을 붙이는
  // 사람은 대개 그 안의 대상을 살리려고 붙인다. 결만 가져오려는 쪽이 오히려
  // 드물어서, 기본을 결로 두면 붙인 대상이 사라진 결과를 보고 놀란다.
  { id: "extract", label: "이 캐릭터 뽑아내기", hint: "그림 속 그 대상을 그대로 살립니다. 그림 느낌은 위 「결」에서 따로 고릅니다" },
  { id: "style", label: "결만 따라 만들기", hint: "화풍·색·질감만 가져오고 대상은 새로 만듭니다" },
] as const;

type ReferenceRole = (typeof REFERENCE_ROLES)[number]["id"];

/** 붙인 그림이 없을 때 무엇으로 시작할까. 위 목록의 첫 줄이 곧 기본값이다. */
const DEFAULT_ROLE: ReferenceRole = REFERENCE_ROLES[0].id;

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
type Attached = {
  url: string;
  base64: string;
  mimeType: string;
  role: ReferenceRole;
  /** 라이브러리에서 가져왔으면 그 그림의 id. 골랐다는 표시를 거기에 낸다. */
  libraryId?: string;
};

const STEPS: StepDefinition[] = [
  { id: "make", label: "만들기", desc: "고르고 정면을 뽑습니다" },
  { id: "result", label: "결과", desc: "만들어진 것을 봅니다" },
];

export function CharacterStudio() {
  const [step, setStep] = useState<"make" | "result">("make");

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

  const [angleList, setAngleList] = useState(ANGLE_FALLBACK);
  const [sheetItem, setSheetItem] = useState(SHEET_FALLBACK);
  /**
   * 더 만들 각도. **아무것도 안 켜진 채로 시작한다**(2026-09-11 사용자 결정).
   *
   * 전에는 셋이 켜져 있었다. 켜 둔 것을 못 보고 단추를 눌러 원치 않는 장을
   * 만들고 돈을 내는 일이 있었다. 고르는 것은 사용자 몫이다.
   */
  const [pickedAngles, setPickedAngles] = useState<string[]>([]);
  /** 여섯 각도를 한 장에 담은 그림도 같이 만들까. 각도와 더하기다. */
  const [sheet, setSheet] = useState(false);

  /**
   * 고른 정면 컷. 여기 값이 있으면 마무리를 고르는 자리다.
   *
   * 만들 때 쓸 값을 함께 얼려 둔다 — 고른 뒤에 위 칸을 건드려도 이미 고른
   * 그림과 어긋나지 않아야 한다.
   */
  const [chosen, setChosen] = useState<
    (Candidate & { description: string; name: string; kind: Kind; look: Look; modelId: string }) | null
  >(null);
  const [busy, setBusy] = useState<"" | "candidates" | "create">("");
  /** 각도를 만드는 동안 자리를 잡아 둘 칸. 비면 만드는 중이 아니다. */
  const [pending, setPending] = useState<string[]>([]);
  /** 방금 만든 캐릭터. 2단계가 이것만 보여 준다. */
  const [created, setCreated] = useState<Character | null>(null);
  const [redoing, setRedoing] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * 각도 이름표. **서버가 준 목록을 먼저 본다.**
   *
   * 전에는 화면에 박아 둔 목록만 봤다. 각도가 늘거나 이름이 바뀌면 여기만
   * 옛말이 된다. 모르는 이름은 그대로 보여 준다 — 조용히 감추면 그 장을 잃는다.
   */
  const angleLabel = (id: string) =>
    angleList.find((angle) => angle.id === id)?.label
    ?? (id === sheetItem.id ? sheetItem.label : undefined)
    ?? ANGLE_FALLBACK.find((angle) => angle.id === id)?.label
    ?? id;

  /** 「내 캐릭터」 목록이 쓰는 항목. 다각도 한 장도 채울 수 있어야 한다. */
  const savedList = [...angleList, sheetItem];

  const load = useCallback(async (): Promise<Character[]> => {
    try {
      const body = await (await fetch("/api/characters", { cache: "no-store" })).json() as {
        ok?: boolean; characters?: Character[]; creditCost?: number; models?: ImageModel[];
        angles?: Array<{ id: string; label: string }>; sheet?: { id: string; label: string };
      };
      const list = body.ok ? (body.characters ?? []) : [];
      setCharacters(list);
      setModels(body.models ?? []);
      setCreditCost(body.creditCost ?? 0);
      if (body.angles?.length) setAngleList(body.angles);
      if (body.sheet) setSheetItem(body.sheet);
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
  async function readAsAttached(
    source: Blob,
    role: ReferenceRole,
    libraryId?: string,
  ): Promise<Attached> {
    const buffer = await source.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
    const base64 = btoa(binary);
    const mimeType = source.type || "image/png";
    return { url: `data:${mimeType};base64,${base64}`, base64, mimeType, role, libraryId };
  }

  async function attachFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setMessage("");
    try {
      setAttached(await readAsAttached(file, attached?.role ?? DEFAULT_ROLE));
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
    // 같은 것을 다시 누르면 뺀다. 고른 표시가 나므로 무엇이 빠지는지 보인다.
    if (attached?.libraryId === image.id) return setAttached(null);
    try {
      const response = await fetch(image.url);
      setAttached(await readAsAttached(await response.blob(), attached?.role ?? DEFAULT_ROLE, image.id));
    } catch {
      setMessage("그림을 불러오지 못했습니다.");
    }
  }

  /**
   * 정면을 만든다. **언제나 한 장이다.**
   *
   * 장수를 고르게 두지 않는다(2026-09-11 사용자 결정). 처음에 필요한 것은
   * 정면 하나이고, 여러 장을 늘어놓으면 「고르는 일」이 하나 더 생긴다.
   * 마음에 안 들면 같은 자리에서 다시 뽑으면 된다 — 앞의 것은 갈아 끼운다.
   * 오른쪽 칸에는 **지금 만든 그 한 장만** 있어야 한다.
   */
  const handleCandidates = async () => {
    if (!description.trim()) return setMessage("무엇을 만들지 적어 주세요.");
    setBusy("candidates");
    setMessage("");
    setChosen(null);
    setCreated(null);
    try {
      const body = await (await billableFetch("/api/characters", {
        body: JSON.stringify({
          step: "candidates", description, kind, look, aspectRatio: "3:4",
          candidates: 1,
          modelId: modelId || undefined,
          reference: attached
            ? { role: attached.role, base64: attached.base64, mimeType: attached.mimeType }
            : undefined,
        }),
      })).json() as { ok?: boolean; candidates?: Candidate[]; message?: string };

      const made = body.candidates?.[0];
      if (!body.ok || !made) return setMessage(body.message ?? "정면을 만들지 못했습니다.");

      // 만들 때 쓸 값을 함께 얼려 둔다 — 뒤에 왼쪽 칸을 건드려도 이미 나온
      // 그림과 어긋나지 않아야 한다.
      setChosen({ ...made, description, name, kind, look, modelId });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "정면을 만들지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  /** 1단계를 비우고 처음으로 돌린다. 만든 것은 「내 캐릭터」에 남아 있다. */
  const startOver = () => {
    setStep("make");
    setChosen(null);
    setCreated(null);
    setPickedAngles([]);
    setSheet(false);
    setDescription("");
    setName("");
    setAttached(null);
    setMessage("");
  };

  /**
   * 고른 정면을 기준으로 저장한다.
   *
   * `withExtras` 가 거짓이면 정면 한 장짜리다. 참이면 고른 각도와 다각도
   * 한 장을 더 만든다. 둘을 한 함수로 두는 이유는 저장 경로가 같아서다 —
   * 나누면 한쪽만 고쳐진다.
   */
  const handleCreate = async (withExtras: boolean) => {
    if (!chosen) return;
    const angles = withExtras ? pickedAngles.filter((angle) => angle !== "front") : [];
    const wantsSheet = withExtras && sheet;
    const extras = angles.length + (wantsSheet ? 1 : 0);

    setBusy("create");
    setPending([...angles, ...(wantsSheet ? [sheetItem.id] : [])]);
    setMessage(extras
      ? `고른 정면을 기준으로 ${extras}장을 더 만드는 중입니다…`
      : "정면 한 장으로 저장하는 중입니다…");
    try {
      const body = await (await billableFetch("/api/characters", {
        body: JSON.stringify({
          step: "create",
          description: chosen.description, kind: chosen.kind, look: chosen.look,
          aspectRatio: "3:4",
          angles,
          sheet: wantsSheet,
          modelId: chosen.modelId || undefined,
          name: (chosen.name.trim() || chosen.description).slice(0, 40),
          chosenBase64: chosen.base64,
          chosenMimeType: chosen.mimeType,
        }),
      })).json() as {
        ok?: boolean; id?: string; message?: string; missingAngles?: number; referenceIssue?: string;
      };

      if (!body.ok) return setMessage(body.message ?? "만들지 못했습니다.");

      // 조용히 넘어가지 않는다. 빠진 장도 라이브러리 실패도 알린다.
      setMessage([
        body.missingAngles ? `${body.missingAngles}장이 실패했습니다 — 「내 캐릭터」에서 다시 만드세요.` : "",
        body.referenceIssue ?? "",
      ].filter(Boolean).join(" "));

      const refreshed = await load();
      setCreated(refreshed.find((entry) => entry.id === body.id) ?? null);

      // **고른 정면을 여기서 놓는다.** 안 놓으면 단계 막대로 1단계에 돌아왔을 때
      // 저장 단추가 그대로 살아 있어, 같은 캐릭터를 한 번 더 만들고 또 낸다.
      // 실패했을 때는 놓지 않는다 — 그대로 다시 눌러야 한다.
      setChosen(null);
      setPickedAngles([]);
      setSheet(false);
      setStep("result");
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
      if (!body.ok) return setMessage(body.message ?? "다시 만들지 못했습니다.");
      const refreshed = await load();
      // 2단계에서 눌렀으면 그 자리의 결과도 새것으로 바꾼다.
      setCreated((current) =>
        current ? refreshed.find((entry) => entry.id === current.id) ?? current : current);
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
    anime: "gpt-image-2.5-flare",
    "3d": "gpt-image-2.5-flare",
    illustration: "gpt-image-2.5-flare",
  };
  const autoModel = MODEL_BY_LOOK[look];
  const activeModel = modelId || autoModel;
  const chosenModel = models.find((model) => model.id === activeModel);

  /**
   * 정면을 고른 뒤에는 1단계 칸을 잠근다.
   *
   * 만들 때 쓰는 값은 고를 때 얼려 둔 것이라 여기를 고쳐도 결과가 바뀌지 않는다.
   * 고칠 수 있게 두면 바뀐 줄 알고 있다가 다른 것이 나온다.
   */
  const locked = Boolean(busy) || Boolean(chosen);
  const chosenSrc = chosen ? `data:${chosen.mimeType};base64,${chosen.base64}` : "";
  const extraCount = pickedAngles.filter((angle) => angle !== "front").length + (sheet ? 1 : 0);

  return (
    <div className="min-w-0">
      <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-bold text-muted-foreground">부가 기능</p>
          <h1 className="text-3xl font-bold leading-tight tracking-normal max-md:text-2xl">
            캐릭터 만들기
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            사람·동물·캐릭터·사물을 만들어 두면 카드뉴스·이미지 만들기·상세페이지에서
            <strong> 같은 대상</strong>이 나옵니다. 만들지 않고 그냥 생성하면 매번 다른 것이 나옵니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">내 캐릭터 {characters.length}</Badge>
          {creditCost ? <Badge variant="outline">정면 한 장 약 {creditCost}장 차감</Badge> : null}
        </div>
      </div>

      {/* 다른 도구와 같은 막대다. 만드는 중에는 못 옮긴다 — 몇 십 초를 기다린
          결과가 어디로 갔는지 모르게 된다. */}
      <div className="mb-4">
        <StepBar
          steps={STEPS}
          current={step}
          onJump={(id) => { if (!busy) setStep(id as "make" | "result"); }}
          // 2단계에는 지난 기록도 있다. 이번에 만든 것이 없어도 볼 것이 있다.
          allowJump={() => true}
        />
      </div>

      {step === "result" ? (
        <ResultStep
          freshId={created?.id ?? null}
          freshName={created?.name ?? null}
          characters={characters}
          angles={savedList}
          loading={loading}
          deletingId={deletingId}
          angleLabel={angleLabel}
          message={message}
          redoing={redoing}
          onRedo={(character, angle) => void handleRedo(character, angle)}
          onDelete={(character) => void handleDelete(character)}
          onStartOver={startOver}
        />
      ) : (
        /*
          **칸이 셋이다** — 만들 것 정하기 · 참고할 그림 · 이번에 만드는 것.

          둘일 때는 참고할 그림이 설정 아래에 쌓여, 크게 보여 주려면 칸을
          넘겼다(2026-09-11). 세로가 모자라면 가로를 쓴다. 카드뉴스 레이아웃
          화면이 같은 방식이다(`sns/layout/layout-client.tsx` 는 넷이다).

          화면 높이 안에서 끝낸다 — **페이지는 안 구른다.** 칸이 넘치면 그
          칸 안에서만 구른다. 넓은 화면에서만 건다. 좁으면 위아래로 쌓이므로
          높이를 묶으면 아무것도 안 보인다.
        */
        <div className="grid gap-4 max-xl:grid-cols-1 xl:h-[calc(100vh-19rem)] xl:min-h-[30rem] xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)_minmax(340px,0.95fr)]">
          <Card className="flex min-h-0 flex-col">
            <CardHeader className="flex-none">
              <CardTitle>무엇을 만들까요</CardTitle>
              <CardDescription>
                고르고 한 줄 적으면 <strong>정면</strong>이 나옵니다. 각도를 더 만들지는
                정면을 보고 오른쪽에서 정합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <fieldset className="grid flex-none gap-1.5">
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

              <fieldset className="grid flex-none gap-1.5">
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
                <fieldset className="grid flex-none gap-1.5">
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
                      : `고른 결에 맞춰 ${chosenModel?.label ?? modelDisplayName(autoModel)} 로 만듭니다.`}
                  </p>
                  {chosenModel?.untested ? (
                    <p className="text-xs text-amber-700">
                      「시험」 표시가 붙은 모델입니다. 이 쓰임에서 더 나은지 아직 재지 않았습니다 —
                      같은 캐릭터를 기본 모델로도 만들어 견줘 보세요.
                    </p>
                  ) : null}
                </fieldset>
              ) : null}

              <label className="grid flex-none gap-1.5">
                <span className="text-meta text-subtle-foreground">이름 · 선택</span>
                <Input
                  value={name} disabled={locked}
                  placeholder="비우면 아래 묘사에서 가져옵니다"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              {/*
                **남는 높이를 이 칸이 다 쓴다**(2026-09-11 사용자 결정). 아래에
                여백을 남겨 둘 이유가 없고, 묘사는 길수록 결과가 좋아진다 —
                좁은 칸은 짧게 쓰라는 말처럼 읽힌다.
              */}
              <label className="flex min-h-0 flex-1 flex-col gap-1.5">
                <span className="flex-none text-meta text-subtle-foreground">무엇을 만들까요</span>
                <Textarea
                  className="min-h-[7rem] flex-1 resize-none"
                  value={description} disabled={locked}
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
                <p className="flex-none text-[11px] leading-snug text-subtle-foreground">
                  적은 말이 <strong>그대로</strong> 모델로 갑니다. 한국어 그대로 보내고,
                  <strong> 종류는 묘사에 맞춰</strong> 고르세요.
                </p>
              </label>

            </CardContent>
            {/* 단추는 늘 보이는 바닥에 둔다. 굴려 내려가야 나오면 흐름이 끊긴다. */}
            <div className="flex-none border-t p-4">
              {/* 아이콘을 빼 둔다(2026-09-11 사용자 요청). 만드는 중 표시만 남긴다 —
                  그건 장식이 아니라 지금 무슨 일이 벌어지는지를 말한다. */}
              <Button className="w-full" disabled={locked} onClick={() => void handleCandidates()}>
                {busy === "candidates" ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
                {busy === "candidates" ? "정면을 만드는 중…" : "정면 만들기"}
              </Button>
              {chosen ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  정면이 나와 이 칸을 잠갔습니다. 고치려면 오른쪽 끝에서 「설정 고치기」를 누르세요.
                </p>
              ) : message ? (
                <p className="mt-2 text-xs text-muted-foreground">{message}</p>
              ) : null}
            </div>
          </Card>

          {/*
            참고할 그림 — **제 칸을 준다.**

            한 장만 붙이는 자리인데, 설정 아래에 끼워 두면 붙인 그림이 칸 밖으로
            밀려 굴려야 보였다. 무엇을 붙였는지 안 보이면 역할을 고를 근거가 없다.
            여기서는 칸 높이를 다 써서 크게 보여 준다.
          */}
          <Card className="flex min-h-0 flex-col">
            <CardHeader className="flex-none">
              <CardTitle>참고할 그림 · 선택</CardTitle>
              <CardDescription>
                없어도 됩니다. 붙이면 그 안의 대상을 그대로 살리거나, 그림의 결만 따라 만듭니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {attached ? (
                <>
                  {/* 칸에 남는 높이를 이 그림이 다 쓴다. `contain` 이라 세로로
                      긴 그림도 안 잘린다 — 잘라 보여 주면 붙인 것과 다른 것을
                      보고 고르게 된다. */}
                  <button
                    type="button" aria-label="첨부한 그림 크게 보기"
                    onClick={() => openImageViewer(attached.url, "첨부한 그림")}
                    className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-md border bg-muted p-1 transition-opacity hover:opacity-90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attached.url} alt="첨부한 그림"
                      className="max-h-full max-w-full object-contain"
                    />
                  </button>
                  <div className="flex-none">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-meta text-subtle-foreground">이 그림의 역할</span>
                      {REFERENCE_ROLES.map((role) => (
                        <Button
                          key={role.id} type="button" size="sm" disabled={locked}
                          variant={attached.role === role.id ? "default" : "secondary"}
                          onClick={() => setAttached({ ...attached, role: role.id })}
                        >
                          {role.label}
                        </Button>
                      ))}
                      <button
                        type="button" disabled={locked} onClick={() => setAttached(null)}
                        className="ml-auto text-xs text-subtle-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <X className="mr-1 inline size-3" />빼기
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-subtle-foreground">
                      {REFERENCE_ROLES.find((role) => role.id === attached.role)?.hint}
                    </p>
                  </div>
                </>
              ) : (
                <div className="grid min-h-0 flex-1 place-content-center place-items-center gap-2 rounded-md border border-dashed p-6 text-center">
                  <ImagePlus className="size-7 text-subtle-foreground" />
                  <p className="text-xs text-subtle-foreground">
                    붙인 그림이 없습니다. 아래에서 올리거나 라이브러리에서 고르세요.
                  </p>
                </div>
              )}
            </CardContent>
            <div className="flex flex-none flex-wrap items-center gap-2 border-t p-4">
              <input
                ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp"
                className="hidden" onChange={(event) => void attachFile(event.target.files)}
              />
              <Button type="button" variant="secondary" size="sm" disabled={locked}
                onClick={() => fileInput.current?.click()}>
                <ImagePlus className="size-4" />{attached ? "다른 그림" : "새 이미지 올리기"}
              </Button>
              <LibraryPickerButton
                images={library.map((image) => ({ id: image.id, title: image.title, url: image.signedUrl }))}
                // 고른 것을 알려 준다. 안 넘기면 창 안에서 무엇을 골랐는지
                // 표시가 안 나, 눌렀는지 아닌지 알 수 없다.
                selectedIds={attached?.libraryId ? [attached.libraryId] : []}
                onToggle={(image) => void attachFromLibrary(image)}
                // 만들어 둔 캐릭터의 각도도 참고로 쓴다 — 「이 캐릭터 뽑아내기」로
                // 같은 대상을 다른 결로 다시 만드는 길이다. 다른 도구와 같은 창이다.
                onPickCharacterAngle={({ image }) => void attachFromLibrary(image)}
                onReload={() => void loadLibrary()}
                label="라이브러리"
                title="참고할 그림 고르기"
                description="한 장만 씁니다. 다시 누르면 뺍니다"
              />
            </div>
          </Card>

          {/*
            오른쪽 칸은 **이번에 만든 정면 한 장만** 두는 자리다.

            저장된 것을 여기서 보여 주지 않는다(2026-09-11 사용자 결정). 지난
            기록은 2단계에 모아 둔다 — 만드는 자리에 옛것이 같이 있으면
            지금 만든 것이 어느 것인지 흐려진다.
          */}
          <Card className="flex min-h-0 flex-col">
            <CardHeader className="flex-none">
              <CardTitle>{busy ? "만드는 중입니다" : chosen ? "이 정면으로 갑니다" : "이번에 만드는 것"}</CardTitle>
              <CardDescription>
                {busy === "candidates"
                  ? "다 되면 이 자리에 나옵니다. 창을 닫지 마세요."
                  : busy === "create"
                    ? "고른 것을 만드는 중입니다. 다 되면 2단계 「결과」로 넘어갑니다."
                    : chosen
                      ? "정면은 다시 그리지 않고 그대로 씁니다 — 다시 그리면 얼굴이 달라집니다."
                      : "왼쪽에서 만들면 여기에 정면이 나옵니다. 각도는 그다음에 고릅니다."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {/*
                정면 자리. 만드는 중 · 나온 뒤 · 아직 없음 셋뿐이다.
                아래 단추들은 **셋 다에서 그대로 보인다**(2026-09-11 사용자 요청) —
                무엇을 고를 수 있는지 미리 알아야 정면을 만들지 말지 정할 수 있다.
              */}
              <div className="grid min-h-0 flex-1 place-items-center">
                {busy === "candidates" ? (
                  <MakingBox
                    title="정면을 만드는 중입니다"
                    hint="보통 30~60초 걸립니다. 이 칸을 떠나도 계속 만듭니다"
                  />
                ) : chosen ? (
                  <button
                    type="button" aria-label="이번 정면 크게 보기"
                    onClick={() => openImageViewer(chosenSrc, "이번 정면")}
                    className="block h-full w-full overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="이번 정면" src={chosenSrc} className="h-full w-full object-contain" />
                  </button>
                ) : (
                  <div className="grid h-full w-full place-content-center place-items-center gap-2 rounded-md border border-dashed p-6 text-center">
                    <UserRound className="size-7 text-subtle-foreground" />
                    <p className="text-sm text-muted-foreground">아직 만든 것이 없습니다.</p>
                    <p className="text-xs text-subtle-foreground">
                      왼쪽에서 <strong>정면 만들기</strong>를 누르면 여기에 나옵니다.
                    </p>
                  </div>
                )}
              </div>

              {/*
                각도를 만드는 중. **무엇을 몇 장 만드는지 이름으로 말한다** —
                도는 표시만 있으면 얼마나 남았는지도, 무엇이 되고 있는지도 모른다.
              */}
              {pending.length ? (
                <div className="flex-none rounded-md border-2 border-primary/40 bg-primary-soft/30 p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-primary">
                    <Loader2 className="size-4 animate-spin" />
                    {pending.length}장을 만드는 중입니다
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pending.map((angle) => angleLabel(angle)).join(" · ")} · 한 장에 30~90초 걸립니다
                  </p>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-primary/20">
                    <span className="block h-full w-1/3 animate-pulse rounded-full bg-primary" />
                  </span>
                </div>
              ) : null}

              {/* ── 단추는 결과물이 없어도 늘 보인다 ────────────────── */}
              <div className="grid flex-none gap-2">
                <Button
                  disabled={!chosen || Boolean(busy)}
                  onClick={() => void handleCreate(false)}
                >
                  {busy === "create" && !pending.length
                    ? <Loader2 size={16} className="mr-1.5 animate-spin" />
                    : null}
                  정면만 만들기
                </Button>

                {/* 여기서부터가 「이어서 더 만들기」다. 줄을 그어 나눈다 —
                    위는 끝내는 길, 아래는 더 가는 길이다. */}
                <div className="grid gap-2 rounded-md border p-3">
                  <p className="text-meta text-subtle-foreground">이어서 더 만들기 · 선택</p>
                  <div className="flex flex-wrap gap-1.5">
                    {/*
                      **다각도가 맨 앞이다**(2026-09-11 사용자 결정). 대부분의
                      쓰임에서 이것이 맞는 선택인데, 각도 단추 여섯 뒤에 두면
                      다 고르고 나서야 눈에 들어온다. 색도 달리해 갈라 둔다 —
                      그냥 섞이면 일곱 번째 각도로 읽힌다.
                    */}
                    <Button
                      type="button" size="sm"
                      disabled={!chosen || Boolean(busy)}
                      variant={sheet ? "default" : "outline"}
                      onClick={() => setSheet((current) => !current)}
                    >
                      <Grid2X2 className="mr-1 size-3.5" />{sheetItem.label}
                    </Button>
                    {angleList.filter((angle) => angle.id !== "front").map((angle) => (
                      <Button
                        key={angle.id} type="button" size="sm"
                        disabled={!chosen || Boolean(busy)}
                        variant={pickedAngles.includes(angle.id) ? "default" : "secondary"}
                        onClick={() => setPickedAngles((current) =>
                          current.includes(angle.id)
                            ? current.filter((id) => id !== angle.id)
                            : [...current, angle.id])}
                      >
                        {angle.label}
                      </Button>
                    ))}
                  </div>

                  {/*
                    **권하는 쪽을 말한다.** 낱장 여섯과 한 장은 값이 여섯 배
                    차이인데, 화면만 보면 둘이 같은 무게로 놓여 있어 비싼 쪽을
                    고르기 쉽다. 흐린 글씨로 적으면 안 읽히므로 칸을 준다.
                  */}
                  <p className="rounded-md border border-primary/30 bg-primary-soft/40 px-2.5 py-2 text-[11px] leading-snug">
                    <strong className="text-primary">
                      캐릭터를 활용하려면 「{sheetItem.label}」으로 만드세요. 비용이 절약됩니다.
                    </strong>
                    <span className="text-muted-foreground">
                      {" "}여섯 각도를 <strong>한 그림</strong>에 3×2 로 담아 <strong>한 장 값</strong>만 듭니다 —
                      낱장으로 여섯 번 만들면 여섯 번 냅니다.
                    </span>
                    {pickedAngles.some((id) => id.endsWith("_90")) ? (
                      <span className="text-muted-foreground">
                        {" "}90° 측면은 얼굴이 반만 보여 다른 도구에서 인물 기준으로 쓰기에는 약합니다.
                      </span>
                    ) : null}
                  </p>

                  <Button
                    size="sm"
                    disabled={!chosen || Boolean(busy) || extraCount === 0}
                    onClick={() => void handleCreate(true)}
                  >
                    {/* 아이콘 없이 글자만(2026-09-11 사용자 요청). 도는 표시는 남긴다. */}
                    {busy === "create" && pending.length
                      ? <Loader2 size={16} className="mr-1.5 animate-spin" />
                      : null}
                    {extraCount ? `${extraCount}장 더 만들고 저장` : "더 만들 것을 고르세요"}
                  </Button>
                </div>

                {chosen ? (
                  <div className="flex flex-wrap gap-2">
                    {/* 같은 설정으로 한 장 다시. **앞의 것은 갈아 끼운다** —
                        이 칸에는 지금 만든 한 장만 있어야 한다. */}
                    <Button
                      type="button" variant="secondary" size="sm" disabled={Boolean(busy)}
                      onClick={() => void handleCandidates()}
                    >
                      <RotateCw className="mr-1.5 size-3.5" />다시 뽑기
                    </Button>
                    <Button
                      type="button" variant="ghost" size="sm" disabled={Boolean(busy)}
                      onClick={() => { setChosen(null); setMessage(""); }}
                    >
                      설정 고치기
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-subtle-foreground">
                    정면이 나오면 위 단추들이 켜집니다. 각도는 정면을 기준으로 만들기 때문입니다.
                  </p>
                )}
              </div>

              {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * 만드는 중이라는 것을 **크게** 말하는 자리.
 *
 * 전에는 점선 칸 가운데 작은 표시 하나가 돌았다. 몇 십 초가 걸리는 일인데
 * 그것만으로는 시작이 됐는지 멈춘 것인지 알 수 없다(2026-09-11 사용자 요청).
 * 색을 주고, 무엇을 하는 중인지와 얼마나 걸리는지를 글로 적는다.
 */
function MakingBox({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="grid h-full w-full place-content-center place-items-center gap-3 rounded-md border-2 border-primary/40 bg-primary-soft/30 p-6 text-center">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm font-bold text-primary">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <span className="block h-1 w-40 overflow-hidden rounded-full bg-primary/20">
        <span className="block h-full w-1/3 animate-pulse rounded-full bg-primary" />
      </span>
    </div>
  );
}

/**
 * 2단계 — 결과를 보는 자리.
 *
 * **카드 격자다.** 한 캐릭터가 카드 한 장이고, 카드에는 정면과 이름만 있다.
 * 누르면 큰 보기가 열리고 **거기서 나머지 장면을 다 넘겨 본다**
 * (2026-09-11 사용자 결정).
 *
 * 전에는 카드를 펼치면 각도가 그 자리에 격자로 깔렸다. 각도 여섯에 다각도
 * 한 장이면 일곱이라 한 줄에 안 들어가고, 펼친 칸만 길어져 옆이 비었다.
 * 볼 것은 큰 보기에 모으고 목록은 목록만 하게 두면 둘 다 풀린다.
 *
 * 방금 만든 것도 **같은 격자의 한 장**이다. 따로 크게 얹지 않는다 — 그러면
 * 같은 캐릭터가 한 화면에 두 번 나온다. 대신 테두리와 딱지로 표시한다.
 */
function ResultStep({
  freshId, freshName, characters, angles, loading, deletingId,
  angleLabel, message, redoing, onRedo, onDelete, onStartOver,
}: {
  /** 방금 만든 것의 id. 그 카드만 따로 표시한다. */
  freshId: string | null;
  freshName: string | null;
  characters: Character[];
  angles: Array<{ id: string; label: string }>;
  loading: boolean;
  deletingId: string | null;
  angleLabel: (id: string) => string;
  message: string;
  redoing: string;
  onRedo: (character: Character, angle: string) => void;
  onDelete: (character: Character) => void;
  onStartOver: () => void;
}) {
  // 방금 만든 것을 맨 앞으로. 목록은 만든 차례 역순이라 대개 이미 앞이지만,
  // 팀 것이 섞이면 밀릴 수 있다.
  const ordered = freshId
    ? [...characters].sort((a, b) => (a.id === freshId ? -1 : b.id === freshId ? 1 : 0))
    : characters;

  return (
    <div className="grid gap-4">
      {freshName ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <CheckCircle2 className="size-5 flex-none text-primary" />
            <p className="min-w-0 flex-1 text-sm">
              <strong>다 만들었습니다 · {freshName}</strong>
              <span className="ml-2 text-muted-foreground">
                「내 캐릭터」와 라이브러리에 넣었습니다. 카드뉴스·이미지 만들기·상세페이지에서 불러 씁니다.
              </span>
            </p>
            <Button onClick={onStartOver}>
              <Sparkles size={16} className="mr-1.5" />새로 만들기
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">{message}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>내 캐릭터</CardTitle>
          <CardDescription>
            카드를 누르면 크게 보면서 <strong>다른 장면까지 넘겨 볼 수</strong> 있습니다.
            라이브러리의 「캐릭터」 칸에서 불러 카드뉴스·이미지 만들기·상세페이지에 씁니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />불러오는 중입니다.
            </div>
          ) : ordered.length === 0 ? (
            <div className="grid place-items-center gap-3 rounded-md border border-dashed p-10 text-center">
              <UserRound className="size-7 text-subtle-foreground" />
              <p className="text-sm text-muted-foreground">아직 만든 것이 없습니다.</p>
              <Button size="sm" onClick={onStartOver}>만들러 가기</Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {ordered.map((entry) => (
                <CharacterCard
                  key={entry.id}
                  character={entry}
                  angles={angles}
                  angleLabel={angleLabel}
                  fresh={entry.id === freshId}
                  redoing={redoing}
                  deleting={deletingId === entry.id}
                  onRedo={(angle) => onRedo(entry, angle)}
                  onDelete={() => onDelete(entry)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 캐릭터 한 장.
 *
 * 정면과 이름만 보인다. **다른 장면이 있는지 없는지는 딱지가 말한다** —
 * 그 말이 없으면 정면만 있는 것과 여섯 장 더 있는 것이 똑같아 보인다
 * (2026-09-11 사용자 지적). 그래서 둘을 **다른 모양**으로 낸다: 있으면
 * 진한 딱지에 겹장 표시와 장수, 없으면 흐린 테두리 딱지에 「정면만」.
 *
 * 없는 각도를 채우는 일은 카드 밑 한 줄로 접어 둔다. 여섯 개 단추를 늘
 * 펼쳐 두면 카드가 단추 목록이 된다.
 */
function CharacterCard({ character, angles, angleLabel, fresh, redoing, deleting, onRedo, onDelete }: {
  character: Character;
  angles: Array<{ id: string; label: string }>;
  angleLabel: (id: string) => string;
  fresh: boolean;
  redoing: string;
  deleting: boolean;
  onRedo: (angle: string) => void;
  onDelete: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const shown = character.views.filter((view) => view.url);
  const front = shown.find((view) => view.angle === "front") ?? shown[0];
  // 정면은 고른 그 장 자체라 다시 만들 수 없다(서버가 막는다). 빈칸 목록에서도 뺀다.
  const missing = angles.filter((angle) =>
    angle.id !== "front" && !character.views.some((view) => view.angle === angle.id));

  const openGallery = () => openImageGallery({
    images: shown.map((entry) => ({
      src: entry.url as string,
      alt: `${character.name} ${angleLabel(entry.angle)}`,
      // 이름을 안 주면 서명 주소에서 만들어져 알아볼 수 없는 파일이 된다.
      name: `${character.name} ${angleLabel(entry.angle)}.png`,
      meta: [
        ["캐릭터", character.name],
        ["장면", angleLabel(entry.angle)],
        ["종류", KINDS.find((k) => k.id === character.kind)?.label ?? "사람"],
        ["결", LOOKS.find((l) => l.id === character.look)?.label ?? "실사"],
        ["묘사", character.sourcePrompt],
      ] as Array<[string, string]>,
    })),
    index: Math.max(0, shown.findIndex((entry) => entry === front)),
  });

  return (
    <div className={cn(
      "flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card transition-shadow",
      fresh && "border-primary shadow-[0_0_0_2px_var(--primary-ring)]",
    )}>
      <div className="relative">
        <button
          type="button"
          disabled={!front}
          aria-label={`${character.name} 크게 보기`}
          onClick={openGallery}
          className="block w-full bg-muted transition-opacity hover:opacity-90 disabled:cursor-default"
        >
          {front?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={front.url} className="aspect-[3/4] w-full object-cover" />
          ) : (
            <span className="grid aspect-[3/4] place-items-center px-2 text-center text-xs text-subtle-foreground">
              그림을 못 불러왔습니다
            </span>
          )}
        </button>

        {fresh ? (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            방금 만듦
          </span>
        ) : null}

        <button
          type="button"
          disabled={deleting}
          aria-label={`${character.name} 삭제`}
          onClick={onDelete}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-background/85 text-subtle-foreground shadow-[var(--shadow-ring)] hover:text-destructive disabled:opacity-50"
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>

        {/*
          **다른 장면이 있는가.** 이 한 자리가 그 답이다. 있으면 진한 딱지에
          장수까지, 없으면 흐린 딱지에 「정면만」 — 모양이 달라 멀리서도 갈린다.
        */}
        {shown.length > 1 ? (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-[var(--shadow-ring)]">
            <Layers className="size-3" />{shown.length}장
          </span>
        ) : (
          <span className="absolute bottom-2 right-2 rounded-full border border-border bg-background/90 px-2 py-0.5 text-[11px] text-subtle-foreground shadow-[var(--shadow-ring)]">
            정면만
          </span>
        )}

        {shown.length > 1 ? (
          <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] text-subtle-foreground">
            <Maximize2 className="size-2.5" />눌러서 전부 보기
          </span>
        ) : null}
      </div>

      <div className="grid gap-1.5 p-3">
        <p className="truncate text-sm font-bold" title={character.name}>{character.name}</p>
        <p className="text-[11px] text-subtle-foreground">
          {KINDS.find((entry) => entry.id === character.kind)?.label ?? "사람"}
          {" · "}
          {LOOKS.find((entry) => entry.id === character.look)?.label ?? "실사"}
          {shown.length > 1 ? ` · ${shown.map((view) => angleLabel(view.angle)).join(", ")}` : ""}
        </p>

        {missing.length ? (
          <>
            <button
              type="button"
              onClick={() => setAdding((current) => !current)}
              aria-expanded={adding}
              className="justify-self-start text-[11px] font-medium text-primary underline-offset-2 hover:underline"
            >
              {adding ? "접기" : `없는 장면 ${missing.length}개 더 만들기`}
            </button>
            {adding ? (
              <div className="flex flex-wrap gap-1">
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
                      {angle.label}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
