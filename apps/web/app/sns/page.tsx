import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@fixup/ui";
import { StudioLayout } from "../_components/studio-layout";
import { SnsProjectList } from "./project-list";

export const metadata: Metadata = { title: "카드뉴스", description: "카드뉴스 프로젝트를 만들고 관리합니다." };

export default function SnsPage() {
  return (
    <StudioLayout>
      <div className="grid gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-meta text-subtle-foreground">CARD NEWS</p>
            <h1 className="mt-1 text-h1">카드뉴스</h1>
            <p className="mt-2 text-body text-muted-foreground">
              수집한 내용이나 직접 쓴 글을 레퍼런스에 맞춰 여러 장의 카드로 만듭니다.
            </p>
          </div>
          {/*
            카드뉴스를 만드는 길이 둘이다. 왼쪽 메뉴에 나란히 두면 별개의
            도구로 보여서, 「카드 뼈대」가 카드뉴스와 무슨 상관인지 알 수 없었다.
            들어오는 자리를 여기 하나로 모은다.

              내 카드뉴스 만들기  칸을 직접 정하고 글은 우리가 그린다
              새 카드뉴스 만들기  레퍼런스에 맞춰 통째로 그린다 (지금까지 방식)
          */}
          {/*
            둘 다 눈에 띄어야 한다. `secondary` 는 크림 바탕과 거의 같은 색이라
            버튼인지도 안 보였다. 테두리와 강조색 글자로 세운다 — 채운 버튼과
            나란히 두면 무엇이 기본인지도 같이 읽힌다.
          */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="border-primary/60 bg-primary-soft font-bold text-primary hover:bg-primary/15"
            >
              <Link href="/sns/layout">내 카드뉴스 만들기</Link>
            </Button>
            <Button asChild>
              <Link href="/sns/new">새 카드뉴스 만들기</Link>
            </Button>
          </div>
        </header>

        {/* 만든 것을 다시 찾을 길이 없었다. 첫 화면에 만들기 버튼만 있어서
            주소를 외워 두지 않으면 어제 만든 것을 못 열었다. */}
        <section className="grid gap-4">
          <h2 className="text-sm font-bold text-subtle-foreground">지난 작업</h2>
          <SnsProjectList />
        </section>
      </div>
    </StudioLayout>
  );
}
