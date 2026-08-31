"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { LogOut } from "lucide-react";
import { Badge, Button } from "@fixup/ui";
import type { UsageSummary } from "../../lib/membership/types";

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
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" title={`${email} · 예약 ${currentUsage.reserved}장`}>
        {currentUsage.used}/{currentUsage.quota}장
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
