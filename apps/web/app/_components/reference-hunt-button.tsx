"use client";

import { ExternalLink, Lightbulb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@fixup/ui";
import { IDEA_SITE_GROUPS } from "./idea-sites";

/**
 * 아이디어 발굴 — 바깥 디자인 사이트를 **안내만** 하는 창.
 *
 * 처음엔 누르면 핀터레스트로 바로 나갔다. 저작권 문제를 피하려고
 * 한 곳으로 몰지 않고, 여러 사이트를 고르는 창을 거치게 바꿨다(2026-10-01).
 * 목록은 `idea-sites.ts`.
 *
 * **색을 다르게 쓴다.** 이 화면의 강조색(자미)은 「만들기」처럼 이 앱 안에서
 * 무언가를 일으키는 버튼의 색이다. 이건 앱 밖으로 나가는 문이라 같은 색이면
 * 안에서 무슨 일이 일어나는 줄 안다.
 *
 * 노랑(2026-10-01 사용자 결정, 이전엔 청록). 노란 면은 크림 바탕과 밝기가
 * 비슷해(1.48:1) 면만으로는 묻힌다. 그래서 밝은 테마에선 진한 황토 테두리
 * (#A67C00, 바탕 대비 3.46:1)로 경계를 세운다. 글자는 흰색이 아니라 짙은
 * 갈색(#2b2200, 9.67:1)이다 — 노랑 위 흰 글자는 거의 안 읽힌다.
 *
 * 사이트는 새 탭으로 연다. 만들던 것을 두고 나가면 그때까지 채운 칸이 사라진다.
 * `noreferrer` 는 나가는 쪽에 우리 주소를 넘기지 않는다.
 */
export function ReferenceHuntButton() {
  return (
    <Dialog>
      <DialogTrigger
        className="
          inline-flex h-9 flex-none items-center gap-1.5 rounded-md px-3 text-sm font-bold
          bg-[#F5C518] text-[#2b2200] shadow-[0_0_0_1.5px_#A67C00]
          transition-colors hover:bg-[#E6B400]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C00] focus-visible:ring-offset-2
          dark:shadow-none dark:hover:bg-[#FFD43B]
        "
      >
        <Lightbulb className="size-4" aria-hidden />
        {/*
          **좁은 화면 상단바에서는 글자를 숨긴다**(2026-09-23 화면 검수). 390px 에서
          이 단추가 왼쪽 로고를 덮고 로그아웃 단추를 둘째 줄로 밀어냈다. 상단바는
          lg 미만(1023px 까지)에만 나오므로 그 폭 전체에서 아이콘만 둔다 — 긴 주소의
          회원도 한 줄에 들어가게. 읽는 이에게는 그대로 「아이디어 발굴」로 들린다.
        */}
        <span className="max-lg:sr-only">아이디어 발굴</span>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>아이디어 발굴</DialogTitle>
          <DialogDescription>
            누르면 새 탭에서 열립니다. 분위기와 구성만 참고하세요. 그림을 그대로 쓰려면 그 사이트의
            이용 조건(라이선스)을 먼저 확인하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          {IDEA_SITE_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">{group.title}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {group.sites.map((site) => (
                  <li key={site.url}>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="
                        flex h-full items-start justify-between gap-2 rounded-md border px-3 py-2
                        transition-colors hover:border-[#A67C00] hover:bg-muted/50
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C00]
                        dark:hover:border-[#F5C518]
                      "
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{site.name}</span>
                        <span className="block text-xs leading-5 text-muted-foreground">{site.note}</span>
                      </span>
                      <ExternalLink className="mt-1 size-3 flex-none opacity-60" aria-hidden />
                      <span className="sr-only">(새 탭에서 열립니다)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
