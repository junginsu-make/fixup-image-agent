"use client";

import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@fixup/ui";
import type { SnsFlowCard, SnsFlowState } from "../../api/sns/flow-service";
import { CardLayoutPicker } from "./card-layout-picker";

type CopyPatch = Partial<Pick<SnsFlowCard["copy"], "headline" | "body" | "accent" | "footnote">>;

function CopyCardEditor({ card, saving, projectId, onSave, onLayoutChanged }: {
  card: SnsFlowCard;
  saving: boolean;
  projectId: string;
  onSave(patch: CopyPatch): Promise<void>;
  onLayoutChanged(): void;
}) {
  const [copy, setCopy] = React.useState(card.copy);

  React.useEffect(() => setCopy(card.copy), [card]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle>{String(card.index).padStart(2, "0")} 카드</CardTitle>
        <Badge variant={card.kind === "generated" ? "secondary" : "outline"}>
          {card.kind === "generated" ? "AI 생성" : card.kind === "place_as_is" ? "원본 그대로" : "사용자 엔딩"}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-5">
        {card.kind !== "generated" ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">이 카드는 사용자 이미지를 그대로 쓰므로 아래 원고가 이미지에 새로 그려지지는 않습니다.</p>
        ) : null}
        <CardLayoutPicker projectId={projectId} card={card} onChanged={onLayoutChanged} />
        <label className="grid gap-2">
          <Label htmlFor={`headline-${card.index}`}>제목</Label>
          <Input id={`headline-${card.index}`} value={copy.headline} onChange={(event) => setCopy({ ...copy, headline: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <Label htmlFor={`body-${card.index}`}>본문</Label>
          <Textarea id={`body-${card.index}`} rows={4} value={copy.body ?? ""} onChange={(event) => setCopy({ ...copy, body: event.target.value })} />
        </label>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2">
            <Label htmlFor={`accent-${card.index}`}>강조 문구</Label>
            <Input id={`accent-${card.index}`} value={copy.accent ?? ""} onChange={(event) => setCopy({ ...copy, accent: event.target.value })} />
          </label>
          <label className="grid gap-2">
            <Label htmlFor={`footnote-${card.index}`}>각주</Label>
            <Input id={`footnote-${card.index}`} value={copy.footnote ?? ""} onChange={(event) => setCopy({ ...copy, footnote: event.target.value })} />
          </label>
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" disabled={saving} onClick={() => void onSave({
            headline: copy.headline,
            body: copy.body ?? "",
            accent: copy.accent ?? "",
            footnote: copy.footnote ?? "",
          })}>{saving ? "저장 중…" : "이 카드 원고 저장"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CopyReview({ flow, savingIndex, projectId, onSave, onLayoutChanged }: {
  flow: SnsFlowState;
  savingIndex?: number;
  projectId: string;
  onSave(index: number, patch: CopyPatch): Promise<void>;
  onLayoutChanged(): void;
}) {
  const notices = [
    ...flow.planningIssues.map((message) => ({ label: "기획", message })),
    ...flow.copyIssues.map((message) => ({ label: "원고", message })),
  ];

  return (
    <div className="grid gap-8">
      {notices.length ? (
        <section aria-label="기획과 원고 알림" className="grid gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-5 text-amber-950">
          <strong>만드는 동안 확인할 일이 있었습니다.</strong>
          {notices.map((notice, index) => <p key={`${notice.label}-${index}`} className="text-sm"><b>{notice.label}</b> · {notice.message}</p>)}
        </section>
      ) : null}
      <div className="grid gap-6">
        {flow.cards.map((card) => (
          <CopyCardEditor
            key={card.index}
            card={card}
            saving={savingIndex === card.index}
            projectId={projectId}
            onSave={(patch) => onSave(card.index, patch)}
            onLayoutChanged={onLayoutChanged}
          />
        ))}
      </div>
    </div>
  );
}
