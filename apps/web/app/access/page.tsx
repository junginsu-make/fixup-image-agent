import { Clock3, MailCheck, ShieldAlert } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import { requireSignedIn } from "../../lib/membership/server";
import { OnboardingSteps, PublicFooter, PublicHeader } from "../_components/public-shell";
import { AccessActions } from "./access-actions";

export default async function AccessPage() {
  const { profile } = await requireSignedIn();
  const unconfirmed = !profile.email_confirmed_at;
  const suspended = profile.status === "suspended";
  return (
    <div className="min-h-screen bg-muted/25">
      <PublicHeader showGuestActions={false} />
      <main className="mx-auto grid min-h-[calc(100vh-13rem)] max-w-lg place-items-center px-4 py-10 sm:px-6">
        <div className="w-full space-y-5">
          <div className="rounded-xl border bg-background p-4 sm:p-5">
            <OnboardingSteps current={2} />
          </div>
          <Card>
            <CardHeader>
              <div className="mb-2 flex items-center gap-2">
                {unconfirmed ? <MailCheck className="h-6 w-6 text-primary" /> : suspended ? <ShieldAlert className="h-6 w-6 text-destructive" /> : <Clock3 className="h-6 w-6 text-primary" />}
                <Badge variant={suspended ? "destructive" : "secondary"}>{unconfirmed ? "이메일 인증 필요" : suspended ? "이용 정지" : "확인 중"}</Badge>
              </div>
              {/* 인증만 마치면 바로 활성화된다. 여기 남아 있다면 아직 링크를 안 눌렀거나 정지된 계정이다. */}
              <CardTitle>{unconfirmed ? "메일함에서 인증을 완료해 주세요" : suspended ? "현재 이용할 수 없는 계정입니다" : "잠시만 기다려 주세요"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p className="break-all font-medium text-foreground">{profile.email}</p>
              <p className="leading-6">{unconfirmed ? "이 주소로 보낸 메일에서 「이메일 인증 완료」 버튼을 눌러 주세요. 인증이 끝나면 바로 이용할 수 있습니다. 메일이 없으면 스팸함을 확인해 주세요." : suspended ? "계정 상태에 관한 문의는 서비스 운영자에게 연락해 주세요." : "계정 상태를 확인하고 있습니다. 이 화면을 새로고침하거나 다시 로그인해 주세요."}</p>
              <AccessActions />
            </CardContent>
          </Card>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
