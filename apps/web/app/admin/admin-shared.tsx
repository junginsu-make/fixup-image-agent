import type { ReactNode } from "react";
import { Card, CardContent } from "@fixup/ui";

/*
  회원 관리·시스템 관리 두 탭이 함께 쓰는 조각. 전에는 `/admin` 한 장 안에 있었다.
*/

/**
 * 첫 화면 갤러리 알림.
 *
 * 아래 사슬에 매달지 않고 표로 뺀다. 다섯 개를 더 이으면 무엇이 무엇의
 * 짝인지 눈으로 못 따라간다.
 */
const SHOWCASE_NOTICE: Record<string, string> = {
  showcase_on: "다시 첫 화면에 겁니다.",
  showcase_off: "첫 화면에서 내렸습니다. 그림은 그대로 두었으니 언제든 다시 켤 수 있습니다.",
  showcase_saved: "문구를 저장했습니다.",
  showcase_moved: "차례를 바꿨습니다.",
  showcase_removed: "첫 화면에서 지웠습니다. 원본 작업물은 그대로 있습니다.",
};

/**
 * 팀 편성 알림.
 *
 * 아래 삼항 사슬이 이미 길다. 거기 더 이으면 무엇이 무엇인지 못 읽는다.
 */
const TEAM_NOTICE: Record<string, string> = {
  team_assigned: "팀에 넣었습니다. 이 회원이 만든 작업물과 참고 이미지도 함께 팀으로 갔습니다.",
  team_removed: "팀에서 뺐습니다. 작업물과 참고 이미지는 개인 것으로 돌아갔습니다.",
  team_promoted: "팀장으로 세웠습니다.",
  team_demoted: "팀원으로 내렸습니다.",
};

export function AdminNotice({ notice }: { notice: string }) {
  const failed = notice === "approved_email_failed";
  const message = TEAM_NOTICE[notice] ?? SHOWCASE_NOTICE[notice] ?? (notice === "approved"
    ? "회원 승인과 이메일 발송을 완료했습니다."
    : notice === "email_sent"
      ? "승인 이메일을 다시 보냈습니다."
      : notice === "price_updated"
        ? "단가를 저장했습니다. 지난 기록의 금액도 새 단가로 다시 계산됩니다."
        : notice === "rate_updated"
          ? "환율을 저장했습니다."
          : notice === "deleted"
            ? "회원을 지웠습니다. 그 회원이 만든 것도 함께 사라졌습니다."
            : notice === "confirm_sent"
              ? "이메일 인증 메일을 다시 보냈습니다. 본인이 링크를 누르면 승인할 수 있습니다."
              : notice === "confirm_rate_limited"
                ? "조금 전에 보냈습니다. 1분쯤 뒤에 다시 눌러 주세요."
                : notice === "badge_on"
                  ? "이제부터 만드는 그림에 \"AI 이미지\" 표기를 붙입니다."
                  : notice === "badge_off"
                    ? "이제부터 만드는 그림에는 표기를 붙이지 않습니다. 이미 만들어 둔 그림은 그대로입니다."
            : "회원은 승인됐지만 이메일 발송에 실패했습니다. SMTP 설정 확인 후 재발송해 주세요.");
  return <div className={`rounded-md border px-4 py-3 text-sm ${failed ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/30 bg-primary-soft"}`}>{message}</div>;
}


export function Metric({ icon, label, value, suffix = "명" }: { icon: ReactNode; label: string; value: number; suffix?: string }) {
  return <Card><CardContent className="flex items-center gap-3 pt-6"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-extrabold">{value.toLocaleString()}{suffix}</p></div></CardContent></Card>;
}
