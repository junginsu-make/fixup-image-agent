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
          <Button asChild><Link href="/sns/new">카드뉴스 만들기</Link></Button>
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
