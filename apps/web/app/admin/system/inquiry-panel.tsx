import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import { INQUIRY_STATUS_LABEL, type InquiryRow } from "../../../lib/cs/inquiry-store";
import { CS_EMAIL } from "../../../lib/cs/contact";
import { setInquiryStatus } from "./inquiry-actions";

/**
 * **문의함**(설계 §10.3).
 *
 * > 「시스템 관리」 탭 아래에 둔다. 새 탭을 만들지 않는다.
 *
 * ── 무엇을 보여 주나 ───────────────────────────────────────
 *
 * 설계 §10.1 의 표 그대로다. 그중 **대화가 핵심이다** — 「결제가 안 돼요」 한
 * 줄만 보면 담당자가 다시 물어야 하고, 봇이 이미 물어본 것이 있으면 그것이
 * 답의 절반이다.
 *
 * ── 왜 근거 없음을 눈에 띄게 적나 ──────────────────────────
 *
 * 봇이 근거를 못 찾아서 온 문의라면 **설명서에 그 글이 없다는 뜻이다.** 같은
 * 물음이 반복되면 답할 일이 아니라 글을 쓸 일이다.
 *
 * ── 답장은 없다 ────────────────────────────────────────────
 *
 * 설계가 못 박았다 — 「답장은 1차에 안 만든다. 메일로 답한다」. 여기서는
 * 상태만 바꾼다.
 */

/**
 * 언제 왔나. **시간대를 못 박는다** — 서버 컴포넌트라 EC2 의 시간대로 찍히고
 * 그것은 UTC 다. 9시간 이른 시각을 보고 「한밤중에 온 문의」로 읽는다.
 */
const when = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

/** 여는 채로 둘 것. 안 본 문의는 펼쳐서 보여 준다. */
function 펼칠까(row: InquiryRow): boolean {
  return row.status === "new";
}

export function InquiryPanel({ rows }: { rows: InquiryRow[] }) {
  const 안본것 = rows.filter((row) => row.status === "new").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>문의함</CardTitle>
        {안본것 > 0 ? <Badge variant="destructive">{`안 본 문의 ${안본것}건`}</Badge> : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-xs text-muted-foreground">
          도우미가 답하지 못한 물음이 여기로 옵니다. 답은 메일로 보내 주세요.
          받는 곳은 <code>CS_INQUIRY_EMAIL</code> 이고, 안 적으면 {CS_EMAIL} 입니다.
        </p>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            아직 들어온 문의가 없습니다.
          </p>
        ) : (
          rows.map((row) => <InquiryItem key={row.id} row={row} />)
        )}
      </CardContent>
    </Card>
  );
}

function InquiryItem({ row }: { row: InquiryRow }) {
  return (
    /*
      **메일의 링크가 닿는 자리**(설계 §10.2 「관리자 화면으로 가는 링크」).
      `lib/cs/inquiry.ts` 가 `#cs-<번호>` 로 보내므로 여기 번호가 있어야
      한다 — 없으면 화면 맨 위로 떨어지고 담당자가 50줄에서 눈으로 찾는다.
    */
    <details id={`cs-${row.id}`} open={펼칠까(row)} className="rounded-lg border px-4 py-3">
      <summary className="grid cursor-pointer gap-1">
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={row.status === "new" ? "destructive" : row.status === "reading" ? "default" : "secondary"}>
            {INQUIRY_STATUS_LABEL[row.status]}
          </Badge>
          {/*
            **회원 관리로 잇는다**(설계 §10.3). 이메일로 찾는 자리가 이미
            있다(`/admin?q=`) — 새 화면을 만들지 않는다.
          */}
          <Link href={`/admin?q=${encodeURIComponent(row.email)}`} className="font-medium text-foreground underline">
            {row.email}
          </Link>
          <span>{when(row.createdAt)}</span>
          {row.page ? <span>{row.page} 에서</span> : null}
          {row.mailedAt ? null : <Badge variant="outline">메일 못 보냄</Badge>}
        </span>
        <span className="text-sm font-bold">{row.question}</span>
      </summary>

      <div className="mt-3 grid gap-3 border-t pt-3">
        <section className="grid gap-1">
          <h4 className="text-xs font-bold text-muted-foreground">그때까지의 대화</h4>
          {row.turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">남은 대화가 없습니다. 한 시간이 지나 지워졌을 수 있습니다.</p>
          ) : (
            <ol className="grid gap-1 text-sm">
              {row.turns.map((turn, index) => (
                <li key={index} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                  <span className="text-xs text-muted-foreground">{turn.role === "user" ? "회원" : "도우미"}</span>
                  <span className="whitespace-pre-wrap">{turn.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="grid gap-1">
          <h4 className="text-xs font-bold text-muted-foreground">도우미가 찾은 근거</h4>
          {row.sources.length === 0 && row.turns.length === 0 ? (
            /*
              **모르는 것과 못 찾은 것을 가른다.** 대화가 지워진 뒤 남긴
              문의라면 근거가 없는 것이 아니라 알 수 없는 것이다. 이것을
              「설명서에 없다」로 적으면 없는 구멍을 좇게 된다.
            */
            <p className="text-sm text-muted-foreground">대화가 남아 있지 않아 알 수 없습니다.</p>
          ) : row.sources.length === 0 ? (
            /*
              **이것이 지식 구멍의 표시다.** 같은 물음이 반복되면 답할 일이
              아니라 설명서에 글을 쓸 일이다.
            */
            <p className="text-sm text-destructive">
              찾지 못했습니다. 설명서에 그 내용이 없다는 뜻일 수 있습니다.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {row.sources.map((source) => (
                <li key={`${source.name}${source.href}`}>
                  {/*
                    **주소가 없으면 링크로 만들지 않는다.** 엉뚱한 곳으로
                    보내는 링크보다 안 눌리는 글이 낫다.
                  */}
                  {source.href ? (
                    <Link href={source.href} className="rounded-full border px-2 py-0.5 text-muted-foreground">
                      {source.name}
                    </Link>
                  ) : (
                    <span className="rounded-full border px-2 py-0.5 text-muted-foreground">{source.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-2">
          {row.status === "new" || row.status === "done" ? (
            <StatusButton id={row.id} status="reading" label="보는 중으로" />
          ) : null}
          {row.status === "done" ? null : <StatusButton id={row.id} status="done" label="끝으로" />}
          {row.status === "new" ? null : <StatusButton id={row.id} status="new" label="다시 안 봄으로" />}
        </div>
      </div>
    </details>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setInquiryStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant="outline">{label}</Button>
    </form>
  );
}
