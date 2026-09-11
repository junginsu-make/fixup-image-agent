/*
 * ("use client" 를 두지 않는다 — 이 파일은 화면 진입점이 아니라 그 아래다.
 * 진입점이 선언하면 아래로 다 퍼지는데, 여기서 또 선언하면 Next 가 이 파일도
 * 진입점으로 보고 함수 props 마다 「직렬화되어야 한다」고 경고한다.)
 */
/**
 * 리디자인의 앞 두 화면 — 지난 작업 목록과 작업대.
 *
 * 화면 파일이 2,589줄이었다. 규칙은 최대 800줄이다. **동작은 그대로 두고 자리만 옮겼다.**
 */

import * as React from "react";
import {
  CircleHelp,
  FileImage,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
  cn,
} from "@fixup/ui";
import { IMAGE_LOOKS, IMAGE_LOOK_HINT, IMAGE_LOOK_LABEL, type ImageLook } from "@fixup/shared";
import { SavedImagePicker } from "../create/SavedImagePicker";
import { MAX_REFERENCE_IMAGES, models, type Model, type Project, type ServerConfig } from "./redesign-model";
import { buildImageFileName, downloadDataUrl, imageExtension } from "./redesign-files";
import { ensureSectionRevisions, projectDisplayTitle, sectionSortNumber } from "./redesign-project";
import { MiniThumb, OptionGroup, Stat, Topbar } from "./redesign-bits";
export function Dashboard({
  projects,
  onNew,
  onOpenProject,
  onDeleteProject,
  onKnowledge,
  knowledgeCount,
  serverConfig,
}: {
  projects: Project[];
  onNew: () => void;
  onOpenProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onKnowledge: () => void;
  knowledgeCount: number;
  serverConfig: ServerConfig;
}) {
  const averageImageCount = projects.length > 0
    ? (projects.reduce((sum, project) => sum + project.count, 0) / projects.length).toFixed(1)
    : "-";

  return (
    <section>
      <Topbar eyebrow="DASHBOARD">
        {serverConfig.canManageKnowledge ? <Button variant="secondary" onClick={onKnowledge}><FileText className="size-4" />지식파일 등록 {knowledgeCount > 0 ? `(${knowledgeCount})` : ""}</Button> : null}
        <Button onClick={onNew}><Sparkles className="size-4" />새 프로젝트 생성</Button>
      </Topbar>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-4 max-xl:grid-cols-1">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>최근 리디자인 프로젝트</CardTitle>
              <CardDescription>업로드한 원본 자료를 기준으로 생성된 작업 목록</CardDescription>
            </div>
            <Badge variant="green">6~8장 기본</Badge>
          </CardHeader>
          <CardContent className="grid gap-3">
            {projects.length > 0 ? (
              projects.map((project) => (
                <div
                  key={project.id}
                  className="grid grid-cols-[52px_minmax(0,1fr)_40px] items-center gap-3 rounded-md border border-border bg-card p-3 transition hover:border-primary hover:bg-primary/30"
                >
                  <button
                    type="button"
                    className="contents text-left"
                    onClick={() => onOpenProject(project)}
                    aria-label={`${project.title} 열기`}
                  >
                    <MiniThumb />
                    <div className="min-w-0">
                      <strong className="block truncate text-sm">{project.title}</strong>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{project.channel}</span>
                        <span>{project.count}장</span>
                        <span>{project.ratio}</span>
                        <span>{models[project.model].label}</span>
                      </div>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="justify-self-end text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteProject(project)}
                    aria-label={`${project.title} 삭제`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-border bg-card/60 p-6 text-center">
                <div>
                  <ImageIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
                  <strong className="text-sm">아직 작업한 리디자인 작업이 없습니다.</strong>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    새 프로젝트를 생성하면 이곳에 최근 작업이 표시됩니다.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>오늘의 작업 상태</CardTitle>
                <CardDescription>전환 설계 중심으로 생성 품질을 추적</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <Stat label="최근" value={String(projects.length)} sub="프로젝트" />
              <Stat label="평균" value={averageImageCount} sub="이미지 장수" />
              <Stat label="기본" value="9:16" sub="출력 비율" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>사전 지식 라이브러리</CardTitle>
                <CardDescription>관리자가 등록하고 승인된 회원이 사용하는 공통 지식</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                <span>등록 문서</span>
                <Badge variant={knowledgeCount > 0 ? "green" : "default"}>{knowledgeCount}개</Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                <span>RAG 청크</span>
                <Badge variant={serverConfig.knowledgeChunks > 0 ? "green" : "default"}>{serverConfig.knowledgeChunks.toLocaleString()}개</Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                <span>사용 권한</span>
                <Badge variant="green">승인 회원</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export function Workspace(props: {
  selectedModel: Model;
  setSelectedModel: (model: Model) => void;
  channel: string;
  setChannel: (channel: string) => void;
  characterId: string;
  setCharacterId: (id: string) => void;
  count: number;
  setCount: (count: number) => void;
  ratio: string;
  setRatio: (ratio: string) => void;
  look: ImageLook;
  setLook: (look: ImageLook) => void;
  files: File[];
  setFiles: (files: File[]) => void;
  request: string;
  setRequest: (request: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  knowledgeCount: number;
  serverConfig: ServerConfig;
  useSharedKnowledge: boolean;
  setUseSharedKnowledge: (value: boolean) => void;
  generating: boolean;
  onGenerate: () => void;
}) {
  const {
    selectedModel,
    setSelectedModel,
    channel,
    setChannel,
    characterId,
    setCharacterId,
    count,
    setCount,
    ratio,
    setRatio,
    look,
    setLook,
    files,
    setFiles,
    request,
    setRequest,
    inputRef,
    knowledgeCount,
    useSharedKnowledge,
    setUseSharedKnowledge,
    generating,
    onGenerate
  } = props;

  return (
    <section>
      <Topbar eyebrow="REDESIGN WORKSPACE">
        <div className="flex flex-col items-end gap-1">
          <Button onClick={() => onGenerate()} disabled={generating}>{generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}리디자인 생성</Button>
          <span className="text-[11px] text-muted-foreground">전부 성공 시 최대 {count}장 차감</span>
        </div>
      </Topbar>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>기존 상세페이지 자료 업로드</CardTitle>
                <CardDescription>이미지 또는 PDF를 첨부하면 원본 정보와 전환 저해 요소를 분석합니다.</CardDescription>
              </div>
              <Badge variant="green">대용량 가능</Badge>
            </CardHeader>
            <CardContent>
              <button
                className="grid min-h-64 w-full place-items-center rounded-md border border-dashed border-primary bg-card/60 p-6 text-center"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  setFiles(Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/") || file.type === "application/pdf"));
                }}
              >
                <span>
                  <span className="mx-auto mb-3 grid size-14 place-items-center rounded-md border border-border bg-card text-primary">
                    <Upload className="size-7" />
                  </span>
                  <strong>이미지 또는 PDF를 여기에 놓기</strong>
                  {/*
                    **몇 장까지 반영되는지 먼저 말한다.**

                    서버는 앞 4장만 쓴다(`MAX_REFERENCE_IMAGES`). 그동안 화면은
                    장수 제한 없이 받아 놓고 넘친 장을 조용히 버렸다 — 긴
                    상세페이지를 조각으로 나눠 올리는 것이 이 도구의 정상
                    사용이라, 버려진 줄 모른 채 결과만 이상해졌다.
                  */}
                  <span className="mt-1 block text-xs font-bold text-primary">
                    앞 {MAX_REFERENCE_IMAGES}장까지 그림 생성에 반영됩니다
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">원본 제품컷, 수치, 리뷰, 인증, 오퍼 문구를 최대한 보존합니다.</span>
                </span>
              </button>
              <input
                ref={inputRef}
                hidden
                multiple
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => {
                  setFiles(Array.from(event.target.files || []));
                  /**
                   * **고른 뒤에 비운다.**
                   *
                   * 안 비우면 같은 파일을 다시 고를 때 값이 안 바뀌어 change 가
                   * 안 뜬다. a.png 를 고르고 드래그로 b.png 로 바꾼 뒤 파일창에서
                   * 다시 a.png 를 고르면 아무 일도 안 일어났고, 배지에는 b.png 가
                   * 남아 있는데 사용자는 a.png 를 올린 줄 알고 크레딧을 썼다.
                   */
                  event.target.value = "";
                }}
              />
              <div className="mt-3">
                {/* 라이브러리에 이미 있는 그림을 디스크에서 다시 찾게 하지 않는다. */}
                <SavedImagePicker
                  label="라이브러리에서 불러오기"
                  onPick={(file) => setFiles([...files, file])}
                />
              </div>
              {files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {files.map((file) => (
                    <Badge key={file.name} variant="default">
                      {file.type === "application/pdf" ? <FileText className="mr-1 size-3" /> : <FileImage className="mr-1 size-3" />}
                      {file.name}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <label className="mb-2 block text-xs font-bold text-muted-foreground">결</label>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_LOOKS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      title={IMAGE_LOOK_HINT[option]}
                      aria-pressed={look === option}
                      className={cn(
                        "min-h-9 rounded-md border border-border bg-card px-3 text-xs font-bold",
                        look === option && "bg-foreground text-background"
                      )}
                      onClick={() => setLook(option)}
                    >
                      {IMAGE_LOOK_LABEL[option]}
                    </button>
                  ))}
                </div>
                <span className="mt-1 block text-xs text-muted-foreground">{IMAGE_LOOK_HINT[look]}</span>
              </div>
              <label className="mt-4 block text-xs font-bold text-muted-foreground">추가 요청사항</label>
              <Textarea
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                placeholder="예: 배경은 밤, 창밖에 네온"
              />
              {/* 이 칸이 곧 사용자 지시다. 프롬프트 맨 앞과 맨 뒤에 두 번 들어간다. */}
              <span className="mt-1 block text-xs text-muted-foreground">
                여기 적은 말이 다른 모든 지시보다 우선합니다.
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-3 p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong>공통 사전 지식 사용</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    관리자가 등록한 지식파일을 검색해 생성 프롬프트에 반영합니다.
                  </p>
                </div>
                <Badge variant={knowledgeCount > 0 ? "green" : "default"}>{knowledgeCount}개 등록</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn("min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold", useSharedKnowledge && "bg-foreground text-background")}
                  onClick={() => setUseSharedKnowledge(true)}
                >
                  사용
                </button>
                <button
                  type="button"
                  className={cn("min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold", !useSharedKnowledge && "bg-foreground text-background")}
                  onClick={() => setUseSharedKnowledge(false)}
                >
                  사용 안 함
                </button>
              </div>
              {useSharedKnowledge ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  승인된 회원 권한으로 공통 지식을 사용합니다. 별도 접근 키는 필요하지 않습니다.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>이미지 생성 모델</CardTitle>
                <CardDescription>작업마다 사용할 모델을 선택합니다.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {(["openai", "google"] as const).map((model) => (
                <button
                  key={model}
                  className={cn("rounded-md border border-border bg-card p-3 text-left", selectedModel === model && "border-primary ring-4 ring-primary")}
                  onClick={() => setSelectedModel(model)}
                >
                  <strong className="block text-sm">{models[model].label}</strong>
                  <code className="mt-1 block break-words text-[11px] text-muted-foreground">{models[model].id}</code>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>생성 옵션</CardTitle>
                <CardDescription>상세페이지 섹션 단위로 생성</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <OptionGroup label="결과 장수" value={String(count)} options={[["1", "히어로 1장"], ["8", "기본 6~8장"]]} onChange={(value) => setCount(Number(value))} />
              <OptionGroup label="출력 비율" value={ratio} options={[["9:16", "9:16"], ["1080×1920", "1080×1920"]]} onChange={setRatio} />
              <ChannelOptionGroup value={channel} onChange={setChannel} />
              <CharacterOptionGroup value={characterId} onChange={setCharacterId} />
              <div className="rounded-md bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                <strong className="text-foreground">예상 이미지 크레딧: 최대 {count}장</strong><br />
                실제로 생성에 성공한 이미지 수만큼만 차감됩니다. 실패한 결과는 차감되지 않습니다.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

/**
 * 등장인물 고르기.
 *
 * 안 고르면 지금까지대로 돈다 — 사람이 나오는 섹션마다 다른 사람이 나온다.
 * 고르면 그 사람의 **정면 한 장**이 모든 섹션에 함께 간다. 여러 각도를 보내면
 * 모델이 절충해 제3의 인물을 만든다(2026-07-30 실측).
 */
export function CharacterOptionGroup({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [characters, setCharacters] = React.useState<Array<{
    id: string; name: string; views: Array<{ angle: string; url: string | null }>;
  }>>([]);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = await (await fetch("/api/characters", { cache: "no-store" })).json();
        if (alive) setCharacters(body.ok ? (body.characters ?? []) : []);
      } catch {
        // 못 불러와도 리디자인은 그대로 된다. 등장인물은 선택이다.
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!characters.length) return null;

  return (
    <div>
      <label className="mb-2 block text-xs font-bold text-muted-foreground">등장인물 · 선택</label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            "min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold",
            !value && "bg-foreground text-background",
          )}
          onClick={() => onChange("")}
        >
          안 씀
        </button>
        {characters.map((character) => {
          const front = character.views.find((view) => view.url);
          return (
            <button
              key={character.id}
              type="button"
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-bold",
                value === character.id && "bg-foreground text-background",
              )}
              onClick={() => onChange(value === character.id ? "" : character.id)}
            >
              {front?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={front.url} alt="" className="size-6 rounded-sm object-cover" />
              ) : null}
              <span className="max-w-24 truncate">{character.name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        고르면 사람이 나오는 섹션마다 같은 사람이 나옵니다. 안 고르면 섹션마다 다른 사람이 나옵니다.
      </p>
    </div>
  );
}

export function ChannelOptionGroup({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const channels = [
    {
      name: "스마트스토어",
      points: ["스캔 쉬운 구성", "상품명/USP/혜택/리뷰/인증을 빠르게 노출", "네이버 쇼핑 사용자가 비교 구매한다는 전제", "과장보다 신뢰, 리뷰, 혜택 중심"]
    },
    {
      name: "쿠팡",
      points: ["더 빠른 구매 판단 중심", "첫 화면에서 핵심 정보와 가격/구성/배송/후기 신뢰를 강하게", "긴 브랜드 스토리보다 왜 지금 사야 하는지 압축", "썸네일처럼 잘 읽히는 굵은 카피와 정보 카드가 유리"]
    },
    {
      name: "자사몰",
      points: ["브랜드 톤앤매너와 스토리 비중이 더 큼", "제품 차별화, 브랜드 신뢰, 보증, 후기 흐름을 더 여유 있게 구성", "단순 구매보다 브랜드 설득과 재구매까지 고려"]
    },
    {
      name: "와디즈",
      points: ["문제 제기 → 해결책 → 제작 이유 → 검증 → 리워드/FAQ 흐름", "제품 탄생 배경, 개발 과정, 상세 검증, 리워드 구성이 중요", "왜 이 제품이 새롭고 믿을 만한가를 더 서사적으로 보여줌"]
    }
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label className="block text-xs font-bold text-muted-foreground">판매 채널</label>
        <button
          type="button"
          className="grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
          onClick={() => setOpen(true)}
          aria-label="판매 채널 설명 보기"
        >
          <CircleHelp className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {channels.map((channel) => (
          <button
            key={channel.name}
            className={cn("min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold", value === channel.name && "bg-foreground text-background")}
            onClick={() => onChange(channel.name)}
          >
            {channel.name}
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>판매 채널별 생성 기준</DialogTitle>
            <DialogDescription>
              판매 채널을 선택하면 해당 채널이 이미지 생성 프롬프트에 들어가고, AI가 구성과 문구 톤을 채널에 맞춰 조정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-4">
            <div className="rounded-md border border-primary bg-primary p-3 text-sm leading-relaxed text-primary">
              채널별 고객의 구매 맥락이 다르기 때문에, 같은 상품이라도 첫 화면의 정보 우선순위와 설득 흐름이 달라집니다.
            </div>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              {channels.map((channel) => (
                <div key={channel.name} className="rounded-md border border-border bg-card p-4">
                  <h3 className="mb-3 text-base font-bold">{channel.name}</h3>
                  <ul className="grid gap-2 text-sm leading-relaxed text-muted-foreground">
                    {channel.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>확인</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

