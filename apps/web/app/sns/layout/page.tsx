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
        <LayoutStudio />
      </div>
    </StudioLayout>
  );
}
