import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@fixup/ui";
import {
  getUsageSummary,
  requireActiveMember,
} from "../../lib/membership/server";
import { ClearLegacyKeys } from "./clear-legacy-keys";
import { StyleReferenceManager } from "./StyleReferenceManager";

/**
 * 계정 화면.
 *
 * 규격은 도구 화면(/create·/redesign)과 맞춘다. 이전에는 가운데 좁은 단
 * (max-w-3xl)에 카드를 세로로 쌓아서, 같은 셸 안인데도 이 화면만 여백이
 * 달랐다. 제목 옆 장식 아이콘도 뺀다 — 아이콘은 버튼(동작)에만 쓴다.
 */
export default async function SettingsPage() {
  const membership = await requireActiveMember();
  const usage = await getUsageSummary(membership.user.id);
  const resetDate = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${usage.periodEnd}T00:00:00+09:00`));
  const percent = usage.quota
    ? Math.min(100, Math.round((usage.used / usage.quota) * 100))
    : 100;

  return (
    <div className="min-w-0">
      <ClearLegacyKeys />

      <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col">
        <div>
          <p className="mb-1 text-xs font-bold text-muted-foreground">계정</p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-normal max-md:text-2xl">
            계정 및 사용량
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            개인 API 키를 넣을 필요가 없습니다. 생성은 운영자 서버 키로
            이루어집니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="green">승인 완료</Badge>
          {membership.profile.role === "admin" ? (
            <Badge variant="secondary">관리자</Badge>
          ) : (
            <Badge variant="outline">회원</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-4 max-xl:grid-cols-1">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 space-y-1.5">
              <CardTitle>월 이미지 크레딧</CardTitle>
              <CardDescription>
                성공한 이미지만 차감됩니다. 실패하거나 중간에 멈춘 이미지는
                차감되지 않습니다.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="flex-none">
              {resetDate} 초기화
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <strong className="text-3xl">{usage.remaining}</strong>
              <span className="text-sm text-muted-foreground">
                남음 · {usage.used}/{usage.quota}장 사용
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              모델에 따라 한 장이 여러 장으로 차감됩니다 — 고급 모델일수록 크게
              차감됩니다. 생성 화면에 모델별 차감량이 표시됩니다.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 space-y-1.5">
              <CardTitle>회원 정보</CardTitle>
              <CardDescription>
                이 계정으로 만든 작업만 내 라이브러리에 보입니다.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="break-all font-medium">{membership.profile.email}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              회원·승인·사용량과{" "}
              <strong>
                라이브러리에 저장한 결과물, 디자인 레퍼런스, 캐릭터
              </strong>
              는 서버의 내 계정에 보관되어 다른 기기에서도 보입니다. 작업 중
              초안은 이 브라우저에만 저장되며, 브라우저 데이터를 지우면
              사라집니다.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <StyleReferenceManager />
      </div>
    </div>
  );
}
