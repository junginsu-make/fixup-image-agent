"use client";

import { useRouter } from "next/navigation";
import { Button } from "@fixup/ui";

export function AccessActions() {
  const router = useRouter();
  async function signOut() {
    await fetch("/auth/signout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }
  return <div className="flex flex-col gap-2 sm:flex-row"><Button className="sm:flex-1" onClick={() => router.refresh()}>상태 새로고침</Button><Button className="sm:flex-1" variant="outline" onClick={() => void signOut()}>로그아웃</Button></div>;
}
