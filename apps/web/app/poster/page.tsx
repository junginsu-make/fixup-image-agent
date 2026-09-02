import Link from "next/link";
import type { Metadata } from "next";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
import { StudioLayout } from "../_components/studio-layout";
import { PosterGallery } from "./gallery-client";

export const metadata: Metadata = {
  title: "포스터",
  description: "레퍼런스를 기준으로 포스터 한 장을 만듭니다.",
};

export default function PosterPage() {
  return (
    <StudioLayout>
      <div className="grid gap-8">
        <header>
          <p className="text-meta text-subtle-foreground">POSTER</p>
          <h1 className="mt-1 text-h1">포스터</h1>
          <p className="mt-2 text-body text-muted-foreground">
            따라 만들 포스터를 고르고 한 줄만 적으면, 나머지 칸은 AI 가 초안으로 채웁니다.
            틀린 칸만 고쳐서 만듭니다.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>새 포스터</CardTitle>
            <CardDescription>
              레퍼런스·비율·모델을 정하면 슬롯 초안이 채워집니다. 변형을 1~3장 받아 하나를 고릅니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/poster/new">포스터 만들기</Link>
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
