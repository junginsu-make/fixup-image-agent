"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@fixup/ui";
import { useAccountSummary } from "./credit-policy-provider";

export function CreditRefresh() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const account = useAccountSummary();
  return <Button type="button" variant="outline" size="sm" disabled={pending || account?.refreshing} onClick={async () => { setPending(true); try { await account?.refresh(); router.refresh(); } finally { setPending(false); } }}>{pending ? "확인 중..." : "크레딧 새로고침"}</Button>;
}
