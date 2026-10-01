import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@fixup/ui";
import type { FalAccountView, FalPoolAdminView } from "../../../lib/fal/pool/admin";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import {
  addFalAccountAction,
  deleteFalAccountAction,
  recheckFalAccountAction,
  replaceFalKeyAction,
  updateFalAccountAction,
} from "./fal-account-actions";

/**
 * 관리자 화면 「fal 계정」(보충 2026-10-01).
 *
 * 등록(이름·키·동시 한도) → 목록(끝 4자리·사용·한도·진행 중·상태·마지막 오류) → 변경 기록. 키는 **등록할 때 한 번만**
 * 입력하고 그 뒤로는 끝 4자리만 보인다. 못 읽으면(`view === null`) 단추를 숨기고 모른다고 말한다.
 */

const STATE_LABEL: Record<FalAccountView["state"], string> = {
  ok: "정상",
  rate_limited: "한도 걸림",
  locked: "잔액 소진",
  invalid: "키 오류",
  decrypt_failed: "키를 풀 수 없음",
};

const ACTION_LABEL: Record<string, string> = {
  fal_account_add: "등록",
  fal_account_update: "설정 변경",
  fal_account_enable: "사용 켬",
  fal_account_disable: "사용 끔",
  fal_account_key: "키 바꿈",
  fal_account_check: "다시 확인",
  fal_account_delete: "삭제",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function FalAccountsPanel({ view }: { view: FalPoolAdminView | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>fal 계정</CardTitle>
        <CardDescription>
          이미지 생성은 켜진 계정 가운데 여유가 가장 큰 계정으로 보냅니다. 한 계정이 막히면(한도·잔액·키 오류) 같은 요청을 곧바로 다음
          계정으로 옮기고, 잔액·키 문제는 관리자 메일로 알립니다. 켜진 계정이 없으면 서버 FAL_KEY 하나로 만듭니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {view === null ? (
          <p className="text-sm text-destructive">fal 계정 목록을 읽지 못했습니다. 새로고침해서 다시 확인해 주세요.</p>
        ) : (
          <>
            {view.masterKey !== "ok" ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                서버 열쇠(FAL_KEY_ENCRYPTION_SECRET)가 {view.masterKey === "missing" ? "없어" : "올바르지 않아"} 계정 풀이 꺼져 있습니다.
                지금은 서버 FAL_KEY 하나로 만듭니다. 운영 설정을 마친 뒤 등록할 수 있습니다.
              </p>
            ) : null}
            <AccountList accounts={view.accounts} keyEditable={view.masterKey === "ok"} />
            <AddForm disabled={view.masterKey !== "ok"} />
            <History events={view.events} />
          </>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>키는 저장하는 순간 잠가 두고, 화면에는 끝 4자리만 보입니다. 브라우저로는 키가 오지 않습니다.</li>
          <li>「다시 확인」과 등록 때의 확인은 그림을 만들지 않는 무료 요청입니다. 그래서 잔액 소진은 실제 생성에서만 드러납니다.</li>
          <li>사용을 꺼도 이미 진행 중인 생성은 그 계정으로 끝까지 돕니다. 키 바꾸기·지우기는 진행 중이 0 일 때만 됩니다.</li>
          <li>동시 한도는 fal 계정의 실제 한도보다 크게 넣지 마세요. 다른 서비스와 같은 계정을 쓰면 그 몫을 빼고 넣습니다.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function AccountList({ accounts, keyEditable }: { accounts: FalAccountView[]; keyEditable: boolean }) {
  if (!accounts.length) {
    return <p className="text-sm text-muted-foreground">등록된 계정이 없습니다. 지금은 서버 FAL_KEY 하나로 만듭니다.</p>;
  }
  return (
    <ul className="space-y-4">
      {accounts.map((account) => (
        <li key={account.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{account.name}</strong>
            <span className="font-mono text-xs text-muted-foreground">····{account.keyLast4}</span>
            <Badge variant={account.enabled ? "default" : "secondary"}>{account.enabled ? "사용" : "꺼짐"}</Badge>
            <Badge variant={account.state === "ok" ? "outline" : "destructive"}>{STATE_LABEL[account.state]}</Badge>
            <span className="text-xs text-muted-foreground">진행 중 {account.inFlight} / 한도 {account.limit}</span>
          </div>
          {account.lastErrorKind && account.lastErrorAt ? (
            <p className="text-xs text-muted-foreground">
              마지막 오류: {STATE_LABEL[account.lastErrorKind]} · {when(account.lastErrorAt)}
              {account.lastErrorDetail ? ` · ${account.lastErrorDetail.slice(0, 120)}` : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <form action={updateFalAccountAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="enabled" value={account.enabled ? "1" : "0"} />
              <div className="space-y-1">
                <Label htmlFor={`name-${account.id}`}>이름</Label>
                <Input id={`name-${account.id}`} name="name" defaultValue={account.name} maxLength={80} className="h-8 w-48" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`limit-${account.id}`}>동시 한도</Label>
                <Input id={`limit-${account.id}`} name="limit" type="number" min={1} max={200} defaultValue={account.limit} className="h-8 w-24" />
              </div>
              <Button type="submit" size="sm" variant="outline">저장</Button>
            </form>
            <form action={updateFalAccountAction}>
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="name" value={account.name} />
              <input type="hidden" name="limit" value={account.limit} />
              <input type="hidden" name="enabled" value={account.enabled ? "0" : "1"} />
              <ConfirmSubmitButton
                variant={account.enabled ? "destructive" : "default"}
                confirmMessage={account.enabled
                  ? `「${account.name}」로 새 생성을 보내지 않습니다. 진행 중인 생성은 끝까지 돕니다. 끌까요?`
                  : `「${account.name}」로 다시 새 생성을 보냅니다. 켤까요?`}
              >
                {account.enabled ? "사용 끄기" : "사용 켜기"}
              </ConfirmSubmitButton>
            </form>
            <form action={recheckFalAccountAction}>
              <input type="hidden" name="id" value={account.id} />
              <Button type="submit" size="sm" variant="outline" disabled={!keyEditable}>다시 확인</Button>
            </form>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <form action={replaceFalKeyAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={account.id} />
              <div className="space-y-1">
                <Label htmlFor={`key-${account.id}`}>새 키</Label>
                <Input id={`key-${account.id}`} name="key" type="password" autoComplete="off" className="h-8 w-72" placeholder="fal 에서 복사한 새 키" />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!keyEditable || account.inFlight > 0}
                title={account.inFlight > 0 ? "진행 중인 생성이 끝난 뒤에 바꿀 수 있습니다." : undefined}
              >
                키 바꾸기
              </Button>
            </form>
            <form action={deleteFalAccountAction}>
              <input type="hidden" name="id" value={account.id} />
              <ConfirmSubmitButton
                variant="destructive"
                disabled={account.inFlight > 0}
                title={account.inFlight > 0 ? "진행 중인 생성이 끝난 뒤에 지울 수 있습니다." : undefined}
                confirmMessage={`「${account.name}」를 지웁니다. 저장된 키도 함께 지워집니다. 지울까요?`}
              >
                지우기
              </ConfirmSubmitButton>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AddForm({ disabled }: { disabled: boolean }) {
  return (
    <form action={addFalAccountAction} className="space-y-3 rounded-lg border border-dashed p-4">
      <p className="text-sm font-medium">계정 추가</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="fal-new-name">이름(구분용)</Label>
          <Input id="fal-new-name" name="name" maxLength={80} placeholder="fal-1 (ai.dev 계정)" className="h-8 w-56" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fal-new-key">API 키</Label>
          <Input id="fal-new-key" name="key" type="password" autoComplete="off" className="h-8 w-80" placeholder="저장하면 다시 볼 수 없습니다" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fal-new-limit">동시 한도</Label>
          <Input id="fal-new-limit" name="limit" type="number" min={1} max={200} defaultValue={20} className="h-8 w-24" />
        </div>
        <Button type="submit" size="sm" disabled={disabled}>확인하고 등록</Button>
      </div>
    </form>
  );
}

function History({ events }: { events: FalPoolAdminView["events"] }) {
  if (!events.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">변경 기록</p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`}>
            {when(event.at)} · {event.actorEmail ?? "알 수 없음"} · {ACTION_LABEL[event.action] ?? event.action}
            {event.name ? ` · ${event.name}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
