import type { ReactNode } from "react";
import { getMembership } from "../../lib/membership/server";
import { isUsableAccount } from "../../lib/membership/usable";
import { isLocalAuthBypass } from "../../lib/dev-auth";
import { StudioLayout } from "../_components/studio-layout";
import { PublicPage } from "../_components/public-shell";
import { GuideNav } from "./_components/guide-nav";

/**
 * 설명서는 **로그인 없이도 열린다** (2026-09-21 사용자).
 *
 * ── 왜 ───────────────────────────────────────────────────────
 *
 * 이 문서의 일은 **이 시스템이 무엇을 하는지 말해 주는 것**이다. 그것을 보려고
 * 로그인부터 하라는 것은 순서가 거꾸로다 — 무엇인지 모르는 채로 가입하라는 말이
 * 된다. 공개 홈에서 바로 이어질 수 있어야 한다.
 *
 * 문은 미들웨어가 연다(`PUBLIC_PATHS`). 여기서는 **누구에게 무엇을 두를지**만
 * 고른다.
 *
 *   회원      지금까지대로 셸. 사이드바에서 바로 도구로 건너간다
 *   손님      공개 머리·꼬리. 로그인·가입 길이 거기 있다
 *
 * **셸을 손님에게 두르지 않는다.** 사이드바는 도구 목록인데, 눌러 봐야 전부
 * 로그인으로 돌아온다 — 열리지 않는 문을 여섯 개 보여 주는 셈이다.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  /*
    **회원인지 못 알아내도 문서는 보여야 한다.**

    회원 확인은 Supabase 를 부른다. 그것이 안 떠 있거나 환경변수가 비면 던진다 —
    다른 화면은 그때 못 여는 것이 맞지만, **여기는 로그인도 필요 없는 문서다.**
    읽는 데 회원 시스템이 필요할 까닭이 없다.

    못 알아내면 손님으로 본다. 손님 화면은 회원에게도 읽히지만, 회원 화면은
    손님에게 안 읽힌다 — 모를 때는 읽히는 쪽으로 떨어진다.
  */
  const membership = await getMembership().catch(() => null);
  const 회원인가 = Boolean(membership && isUsableAccount(membership.profile));

  const 본문 = (
    <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10">
      <GuideNav />
      <div className="grid min-w-0 gap-8 pb-4">{children}</div>
    </div>
  );

  if (회원인가) return <StudioLayout>{본문}</StudioLayout>;

  return (
    <PublicPage localMode={isLocalAuthBypass}>
      {/* 공개 쪽은 셸의 여백이 없다. 글이 화면 끝에 붙지 않게 여기서 준다. */}
      <main className="mx-auto w-full max-w-6xl px-[clamp(16px,2.2vw,52px)] pb-10 pt-6">
        {본문}
      </main>
    </PublicPage>
  );
}
