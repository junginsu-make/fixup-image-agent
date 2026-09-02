import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
import { OnboardingSteps, PublicHeader } from "./public-shell";

export function AuthShell({
  title,
  description,
  children,
  step = 1,
}: {
  title: string;
  description: string;
  children: ReactNode;
  step?: 1 | 2 | 3;
}) {
  return (
    // 화면 세로 가운데에 놓는다. 위에 붙어 있으면 넓은 화면에서 아래가 텅 빈다.
    <div className="flex min-h-screen flex-col bg-muted/25">
      <PublicHeader />
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <section className="hidden lg:block">
          <p className="text-sm font-extrabold text-primary">AI 콘텐츠 스튜디오</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">가입부터 첫 생성까지<br />현재 단계를 확인하세요</h1>
          <p className="mt-4 max-w-md leading-7 text-muted-foreground">이메일 인증만 마치면 바로 이용할 수 있습니다. 운영자 AI 키로 생성하는 서비스라 월 이미지 크레딧이 정해져 있습니다.</p>
          <div className="mt-9 rounded-2xl border bg-background p-6">
            <OnboardingSteps current={step} />
          </div>
        </section>
        <div className="mx-auto w-full max-w-md space-y-5">
          <div className="rounded-xl border bg-background p-4 lg:hidden">
            <OnboardingSteps current={step} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
          <div className="text-center text-xs text-muted-foreground">
            <Link href="/demo" className="underline underline-offset-4">회원가입 전 결과물 보기</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
