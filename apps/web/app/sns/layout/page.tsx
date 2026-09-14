import Link from "next/link";
import type { Metadata } from "next";
import { StudioLayout } from "../../_components/studio-layout";
import { LayoutStudio } from "./layout-client";

export const metadata: Metadata = {
  title: "내 카드뉴스 만들기",
  description: "칸을 먼저 정하고 그 칸에만 AI 가 그림을 넣습니다.",
};

export default function LayoutPage() {
  return (
    <StudioLayout>
      {/* 머리말을 한 줄로 줄인다 — 칸을 옮기는 화면이라 세로가 곧 작업 공간이다. */}
      <div className="grid gap-3">
        <header className="flex flex-wrap items-baseline gap-3">
          {/* 들어온 버튼과 같은 말을 쓴다. 버튼은 「내 카드뉴스 만들기」인데
              제목이 「카드 틀」이면 눌러 들어온 사람이 딴 데 왔나 한다. */}
          <h1 className="text-h2">내 카드뉴스 만들기</h1>
          <p className="text-sm text-muted-foreground">
            칸을 직접 정하고 글은 우리가 그립니다. 칸을 정해 두면 글자 위치가 장마다 달라지지 않습니다.
          </p>
        </header>

        {/*
          **순서를 먼저 말한다.**

          이 화면은 틀만 만든다. 카드뉴스 작업과 원고가 이미 있어야 붙일 수
          있는데, 그 사실을 서랍을 열고 나서야 알려 줬다 — 다 짜 놓고 「아직
          카드뉴스 작업이 없습니다」를 보는 사람이 생겼다. 들어오자마자 말한다.
        */}
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <li>
            <Link href="/sns/new" className="font-semibold text-primary underline underline-offset-2">
              ① 카드뉴스 작업 만들기
            </Link>
          </li>
          <li aria-hidden>→</li>
          <li>② 04 원고 확인까지 진행</li>
          <li aria-hidden>→</li>
          <li className="font-semibold text-foreground">③ 여기서 틀을 짜고 그 작업에 붙이기</li>
          <li className="basis-full text-[11px]">
            ①·②가 끝나 있어야 붙일 수 있습니다. 간단한 틀은 <strong>04 원고 확인 화면에서 바로</strong> 고를 수 있습니다.
          </li>
        </ol>
        <LayoutStudio />
      </div>
    </StudioLayout>
  );
}
