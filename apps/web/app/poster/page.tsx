import Link from "next/link";
import type { Metadata } from "next";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
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
        <header>
          <p className="text-meta text-subtle-foreground">IMAGE</p>
          <h1 className="mt-1 text-h1">이미지 만들기</h1>
          <p className="mt-2 text-body text-muted-foreground">
            광고 소재부터 포스터, 일반 이미지까지 한 장을 만듭니다. 라이브러리에 올려 둔
            참고 이미지나 지금 직접 첨부한 이미지를 기준 삼아, 그 결을 따라 그립니다.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>새 이미지</CardTitle>
            <CardDescription>
              따라 만들 이미지를 고르고 한 줄만 적으면 나머지 칸은 AI 가 초안으로 채웁니다.
              틀린 칸만 고쳐서 만들고, 변형을 1~3장 받아 하나를 고릅니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/poster/new">이미지 만들기</Link>
            </Button>
          </CardContent>
        </Card>

        <section className="grid gap-3">
          <h2 className="text-h2">지난 작업</h2>
          <PosterGallery />
        </section>
      </div>
    </StudioLayout>
  );
}
