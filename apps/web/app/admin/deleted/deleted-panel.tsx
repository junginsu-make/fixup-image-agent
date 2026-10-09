"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";

/**
 * **삭제 보관 — 회원이 지운 재료**(2026-10-08 사용자 결정 — 계획 2단계).
 *
 * 회원이 지운 캐릭터·참고 이미지·쉽게 대화는 줄·파일이 남는다. 관리자는 여기서 누가·언제 지웠는지 보고, 대화는
 * 내용을 열어 보고, 셋 다 완전히 지운다. 6개월이 지나면 저절로 지워진다(3단계).
 *
 * 완전 삭제는 각 자료의 **원래 지우기 주소**로 간다 — 관리자가 부르면 서버가 파일까지 지운다. 따로 만들면
 * 지우는 규칙(사본·각도·묶음 항목)이 두 군데로 갈린다. 대화만 관리자 주소다(회원 주소는 RLS 로 지운 대화를 못 본다).
 */
export interface DeletedCharacterItem { id: string; name: string; ownerEmail: string | null; deletedAt: string; imageUrl: string | null }
export interface DeletedReferenceItem { id: string; title: string; ownerEmail: string | null; deletedAt: string; imageUrl: string | null }
export interface DeletedConversationItem { id: string; title: string; ownerEmail: string | null; deletedAt: string }

interface Props {
  characters: DeletedCharacterItem[];
  references: DeletedReferenceItem[];
  conversations: DeletedConversationItem[];
}

type Kind = "character" | "reference" | "conversation";

function deleteRequest(kind: Kind, id: string): { url: string; init: RequestInit } {
  if (kind === "character") {
    return { url: "/api/characters", init: { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) } };
  }
  return { url: kind === "reference" ? `/api/reference-images/${id}` : `/api/admin/deleted-conversations/${id}`, init: { method: "DELETE" } };
}

/** 「회원이 삭제함 · 10월 8일」의 날짜. 서울 시각으로 적는다. */
export function deletedDay(deletedAt: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(deletedAt));
}

export function DeletedPanel(props: Props) {
  const [items, setItems] = React.useState(props);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState("");

  const purge = async (kind: Kind, id: string, name: string) => {
    if (!window.confirm(`「${name}」을 완전히 지울까요? 파일까지 지워지고 되돌릴 수 없습니다.`)) return;
    setBusy(id);
    setNotice("");
    try {
      const request = deleteRequest(kind, id);
      const body = (await (await fetch(request.url, request.init)).json()) as { ok?: boolean; message?: string };
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      setItems((current) => ({
        characters: current.characters.filter((item) => item.id !== id),
        references: current.references.filter((item) => item.id !== id),
        conversations: current.conversations.filter((item) => item.id !== id),
      }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "지우지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const empty = !items.characters.length && !items.references.length && !items.conversations.length;
  return (
    <div className="space-y-5">
      <p className="break-keep text-sm text-muted-foreground">
        회원이 지운 캐릭터·참고 이미지·쉽게 대화입니다. 회원 화면에는 보이지 않고, 지운 날부터 6개월이 지나면 저절로
        지워집니다. 「완전 삭제」는 파일까지 바로 지웁니다.
      </p>
      {notice ? <p role="alert" className="text-sm text-destructive">{notice}</p> : null}
      {empty ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">회원이 지운 자료가 없습니다.</p>
      ) : null}
      {items.characters.length ? (
        <Section title={`캐릭터 ${items.characters.length}`}>
          {items.characters.map((item) => (
            <Row key={item.id} {...item} busy={busy === item.id} onPurge={() => purge("character", item.id, item.name)} />
          ))}
        </Section>
      ) : null}
      {items.references.length ? (
        <Section title={`참고 이미지 ${items.references.length}`}>
          {items.references.map((item) => (
            <Row key={item.id} {...item} name={item.title} busy={busy === item.id} onPurge={() => purge("reference", item.id, item.title)} />
          ))}
        </Section>
      ) : null}
      {items.conversations.length ? (
        <Section title={`쉽게 대화 ${items.conversations.length}`}>
          {items.conversations.map((item) => (
            <ConversationRow key={item.id} item={item} busy={busy === item.id} onPurge={() => purge("conversation", item.id, item.title)} />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

function Who({ ownerEmail, deletedAt }: { ownerEmail: string | null; deletedAt: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {ownerEmail ?? "알 수 없는 회원"} · 회원이 삭제함 · {deletedDay(deletedAt)}
    </p>
  );
}

function Row(props: {
  name: string; ownerEmail: string | null; deletedAt: string; imageUrl: string | null; busy: boolean; onPurge: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {props.imageUrl ? (
        // 서명 주소(1시간)라 next/image 의 캐시를 거치지 않는다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.imageUrl} alt="" className="size-16 shrink-0 rounded-md border object-cover" />
      ) : (
        <div className="size-16 shrink-0 rounded-md border bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{props.name || "(이름 없음)"}</p>
        <Who ownerEmail={props.ownerEmail} deletedAt={props.deletedAt} />
      </div>
      <Button size="sm" variant="destructive" disabled={props.busy} aria-label={`${props.name} 완전 삭제`} onClick={props.onPurge}>
        {props.busy ? "지우는 중…" : "완전 삭제"}
      </Button>
    </div>
  );
}

function ConversationRow({ item, busy, onPurge }: { item: DeletedConversationItem; busy: boolean; onPurge: () => void }) {
  const [messages, setMessages] = React.useState<Array<{ id: string; role: string; body: string }> | null>(null);
  const [error, setError] = React.useState("");

  const open = async () => {
    if (messages) { setMessages(null); return; }
    setError("");
    try {
      const body = (await (await fetch(`/api/admin/deleted-conversations/${item.id}`)).json()) as {
        ok?: boolean; message?: string; messages?: Array<{ id: string; role: string; body: string }>;
      };
      if (!body.ok) throw new Error(body.message ?? "대화 내용을 불러오지 못했습니다.");
      setMessages(body.messages ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대화 내용을 불러오지 못했습니다.");
    }
  };

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title || "(제목 없음)"}</p>
          <Who ownerEmail={item.ownerEmail} deletedAt={item.deletedAt} />
        </div>
        <Button size="sm" variant="outline" aria-label={`${item.title} 내용 보기`} onClick={open}>
          {messages ? "접기" : "내용 보기"}
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} aria-label={`${item.title} 완전 삭제`} onClick={onPurge}>
          {busy ? "지우는 중…" : "완전 삭제"}
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      {messages ? (
        <ol className="grid gap-1 text-xs">
          {messages.length ? messages.map((message) => (
            <li key={message.id} className="break-keep">
              <span className="text-muted-foreground">{message.role === "user" ? "회원" : message.role === "image" ? "그림" : "안내"}:</span>{" "}
              {message.body || "(그림)"}
            </li>
          )) : <li className="text-muted-foreground">내용이 없습니다.</li>}
        </ol>
      ) : null}
    </div>
  );
}
