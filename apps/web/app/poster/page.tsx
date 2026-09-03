import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@fixup/ui";
import { StudioLayout } from "../_components/studio-layout";
import { PosterGallery } from "./gallery-client";

export const metadata: Metadata = {
  title: "이미지 만들기",
  description: "참고 이미지를 기준으로 광고 소재·포스터·일반 이미지를 만듭니다.",
};

export default function PosterPage() {
  return (
    <StudioLayout>
      <div className="grid gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-meta text-subtle-foreground">IMAGE</p>
            <h1 className="mt-1 text-h1">이미지 만들기</h1>
            <p className="mt-2 text-body text-muted-foreground">
              광고 소재부터 포스터, 일반 이미지까지 한 장을 만듭니다. 라이브러리에 올려 둔
              참고 이미지나 지금 직접 첨부한 이미지를 기준 삼아, 그 결을 따라 그립니다.
            </p>
          </div>
          <Button asChild><Link href="/poster/new">이미지 만들기</Link></Button>
        </header>

        <section className="grid gap-4">
          <h2 className="text-sm font-bold text-subtle-foreground">지난 작업</h2>
          <PosterGallery />
        </section>
      </div>
    </StudioLayout>
  );
}
