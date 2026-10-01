"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@fixup/ui";

export function CreditRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => start(() => router.refresh())}>{pending ? "확인 중..." : "크레딧 새로고침"}</Button>;
}
