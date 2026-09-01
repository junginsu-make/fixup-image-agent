"use client";

import { Input, Label, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@fixup/ui";

export type SourceDraft =
  | { kind: "text"; text: string }
  | { kind: "youtube"; url: string }
  | { kind: "web"; url: string }
  | { kind: "question"; question: string };

export function sourceDraftValid(source: SourceDraft): boolean {
  if (source.kind === "text") return Boolean(source.text.trim());
  if (source.kind === "question") return Boolean(source.question.trim());
  try { return Boolean(new URL(source.url)); } catch { return false; }
}

export function SourceInput({
  title,
  onTitleChange,
  source,
  onSourceChange,
  toneNote,
  onToneNoteChange,
}: {
  title: string;
  onTitleChange(value: string): void;
  source: SourceDraft;
  onSourceChange(value: SourceDraft): void;
  toneNote: string;
  onToneNoteChange(value: string): void;
}) {
  function changeKind(kind: string) {
    if (kind === "text") onSourceChange({ kind, text: "" });
    if (kind === "youtube") onSourceChange({ kind, url: "" });
    if (kind === "web") onSourceChange({ kind, url: "" });
    if (kind === "question") onSourceChange({ kind, question: "" });
  }

  return (
    <div className="grid gap-7">
      <div className="grid gap-2">
        <Label htmlFor="sns-title">프로젝트 제목</Label>
        <Input id="sns-title" value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="예: AI 자동화, 한 업무부터 시작하기" />
      </div>

      <Tabs value={source.kind} onValueChange={changeKind} className="grid gap-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="text">직접 쓰기</TabsTrigger>
          <TabsTrigger value="youtube">유튜브 주소</TabsTrigger>
          <TabsTrigger value="web">웹 주소</TabsTrigger>
          <TabsTrigger value="question">질문해서 찾기</TabsTrigger>
        </TabsList>
        <TabsContent value="text" className="grid gap-2">
          <Label htmlFor="sns-source-text">카드뉴스로 만들 내용</Label>
          <Textarea id="sns-source-text" rows={12} value={source.kind === "text" ? source.text : ""} onChange={(event) => onSourceChange({ kind: "text", text: event.target.value })} placeholder="글이나 메모를 그대로 붙여 넣으세요." />
        </TabsContent>
        <TabsContent value="youtube" className="grid gap-2">
          <Label htmlFor="sns-youtube-url">유튜브 영상 주소</Label>
          <Input id="sns-youtube-url" type="url" value={source.kind === "youtube" ? source.url : ""} onChange={(event) => onSourceChange({ kind: "youtube", url: event.target.value })} placeholder="https://www.youtube.com/watch?v=..." />
          <p className="text-sm text-muted-foreground">자막을 가져와 내용으로 씁니다. 실제 추출은 기획 시작 뒤 서버에서 진행합니다.</p>
        </TabsContent>
        <TabsContent value="web" className="grid gap-2">
          <Label htmlFor="sns-web-url">기사·블로그 주소</Label>
          <Input id="sns-web-url" type="url" value={source.kind === "web" ? source.url : ""} onChange={(event) => onSourceChange({ kind: "web", url: event.target.value })} placeholder="https://example.com/article" />
          <p className="text-sm text-muted-foreground">공개 페이지의 본문을 추출합니다.</p>
        </TabsContent>
        <TabsContent value="question" className="grid gap-2">
          <Label htmlFor="sns-question">궁금한 것</Label>
          <Textarea id="sns-question" rows={7} value={source.kind === "question" ? source.question : ""} onChange={(event) => onSourceChange({ kind: "question", question: event.target.value })} placeholder="궁금한 걸 물어보세요. 웹에서 근거를 찾아옵니다." />
          <p className="text-sm text-muted-foreground">공식 자료와 신뢰할 수 있는 출처를 우선해 조사합니다.</p>
        </TabsContent>
      </Tabs>

      <div className="grid gap-2">
        <Label htmlFor="sns-tone">말투나 분위기 · 선택</Label>
        <Input id="sns-tone" value={toneNote} onChange={(event) => onToneNoteChange(event.target.value)} placeholder="예: 친구에게 말하듯 가볍게" />
        <p className="text-sm text-muted-foreground">비우면 AI가 내용을 보고 어울리는 말투를 정합니다.</p>
      </div>
    </div>
  );
}
