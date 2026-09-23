"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { LogOut } from "lucide-react";
import { Badge, Button } from "@fixup/ui";
import type { UsageSummary } from "../../lib/membership/types";
import { creditBalanceLabel } from "../../lib/membership/credit-label";
import { accountAriaLabel, emailLocalPart } from "./account-label";

export function StudioActions({
  children,
  email,
  usage,
}: {
  children?: ReactNode;
  email: string;
  usage: UsageSummary;
}) {
  const router = useRouter();
  const [currentUsage, setCurrentUsage] = React.useState(usage);

  React.useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<UsageSummary>).detail;
      if (detail && typeof detail.used === "number") setCurrentUsage(detail);
    };
    window.addEventListener("studio-usage-updated", update);
    return () => window.removeEventListener("studio-usage-updated", update);
  }, []);

  async function signOut() {
    await fetch("/auth/signout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    /*
      **좁은 화면에서 두 줄로 꺾이지 않는다**(2026-09-23 화면 검수). 상단바는 높이가
      56px 로 고정인데 여기가 꺾이면서 로그아웃 단추가 로고 아래로 빠져 겹쳤다.
    */
    <div className="flex items-center gap-1.5 max-sm:gap-0.5 lg:flex-wrap">
      {/*
        **지금 어느 계정으로 들어와 있는지 눈에 보여야 한다.**

        전에는 주소가 사용량 배지의 마우스오버 설명에만 있었다. 올려 봐야 아는
        것은 없는 것과 같고, 관리자 계정이 둘이 되면서 잘못된 쪽으로 들어온
        줄 모르고 남의 자료를 만질 위험이 생겼다.

        좁은 화면에서는 주소 전체가 안 들어간다. 그때는 앞부분만 보인다 —
        전체는 마우스오버와 화면 낭독기에 그대로 남는다.
      */}
      <span
        // 휴대폰 폭에서는 자리가 없다. 주소는 배지의 마우스오버와 낭독기에 남는다.
        // 좁은 상단바(lg 미만)에서는 폭을 묶는다. 긴 주소가 단추를 밀어내지 않게.
        className="max-w-[14rem] truncate text-xs font-medium text-subtle-foreground max-lg:max-w-[8rem] max-sm:hidden"
        title={email}
        aria-label={accountAriaLabel(email)}
      >
        <span className="hidden lg:inline">{email}</span>
        <span className="lg:hidden">{emailLocalPart(email)}</span>
      </span>
      <Badge variant="secondary" title={`${email} · 처리 중 ${currentUsage.reserved}${currentUsage.pricingPolicy === "image-v2" ? "크레딧" : "장"}`}>
        {currentUsage.pricingPolicy === "image-v2" ? creditBalanceLabel(currentUsage) : `${currentUsage.used}/${currentUsage.quota}장`}
      </Badge>
      {/* '계정'과 '관리자'는 뺐다. 둘 다 사이드바 아래 메뉴와 같은 화면이라
          둘로 보였다. 여기 남는 것은 상태(사용량)와 그때그때 쓰는 동작뿐이다. */}
      {children}
      <Button variant="ghost" size="icon" aria-label="로그아웃" onClick={() => void signOut()}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
