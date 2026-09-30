"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@fixup/ui";
import { loginHrefFor } from "./signup-gate";

/**
 * 「회원가입이 필요합니다」 (2026-09-30 사용자, 설계 §3.5 · D3).
 *
 * 비회원이 회원 화면을 열면 미들웨어가 첫 화면으로 보내고
 * (`/?signup=required&next=…`), 첫 화면이 이것을 연다. 로그인 화면부터
 * 내밀지 않는 까닭 — 아직 가입하지 않은 사람에게 로그인 칸은 막다른 길이다.
 *
 * 닫으면 **주소에서 안내를 지운다.** 남겨 두면 새로고침할 때마다 다시 뜬다.
 */
export function SignupRequiredModal({ next, closeHref }: { next: string | null; closeHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    router.replace(closeHref, { scroll: false });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
        <DialogHeader>
          <DialogTitle>회원가입이 필요합니다</DialogTitle>
          <DialogDescription>
            이 화면은 회원만 쓸 수 있습니다. 가입하시거나, 이미 회원이면 로그인해 주세요.
          </DialogDescription>
        </DialogHeader>
        {/*
          좁은 화면에서는 `DialogFooter` 가 아래에서 위로 쌓는다(`flex-col-reverse`) —
          위에서부터 회원가입·로그인·닫기. 넓은 화면에서는 오른쪽 끝이 회원가입이다.
        */}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={close}>닫기</Button>
          <Button variant="outline" asChild>
            <Link href={loginHrefFor(next)}>
              <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
              로그인
            </Link>
          </Button>
          <Button asChild>
            <Link href="/signup">
              <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              회원가입
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
