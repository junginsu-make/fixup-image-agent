import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@fixup/ui";
import { StudioLayout } from "../_components/studio-layout";
import { isAdExportEnabled } from "../../lib/ad/feature";
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
          {/*
            **광고 규격 내보내기는 사이드바에 안 넣는다.** 별개 도구가 아니라
            이미지 만들기의 한 갈래라, 도구 목록에 나란히 두면 다른 도구로
            읽힌다 — `app-shell.tsx:51-53` 이 「카드 뼈대」에 대해 같은 판단을
            적어 두었고 그 자리가 여기, 도구 첫 화면의 오른쪽 위다.

            **스위치가 꺼져 있으면 안 그린다**(격리 계약 5). `/ad` 가
            `notFound()` 하는 것과 짝을 맞춘다 — 눌렀는데 없는 문이면 더 나쁘다.
          */}
          <div className="flex flex-wrap items-center gap-2">
            {isAdExportEnabled() && (
              <Button
                asChild
                variant="outline"
                className="border-primary/60 bg-primary-soft font-bold text-primary hover:bg-primary/15"
              >
                <Link href="/ad">광고 규격으로 내보내기</Link>
              </Button>
            )}
            <Button asChild><Link href="/poster/new">이미지 만들기</Link></Button>
          </div>
        </header>

        <section className="grid gap-4">
          <h2 className="text-sm font-bold text-subtle-foreground">지난 작업</h2>
          <PosterGallery />
        </section>
      </div>
    </StudioLayout>
  );
}
