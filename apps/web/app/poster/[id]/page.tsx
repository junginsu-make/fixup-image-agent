import type { Metadata } from "next";
import { StudioLayout } from "../../_components/studio-layout";
// 스위치만 읽는다 — `batch` 를 지나면 sharp 를 통째로 끌고 온다.
import { isAdExportEnabled } from "../../../lib/ad/feature";
import { PosterDetailClient } from "./detail-client";

export const metadata: Metadata = { title: "이미지 작업" };

export default async function PosterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /**
   * **스위치는 서버에서만 읽힌다.** `isAdExportEnabled()` 는 `process.env` 를
   * 보므로 클라이언트가 직접 못 본다. `NEXT_PUBLIC_AD_EXPORT` 를 새로 만들면
   * **스위치가 둘이 되고**, 「버튼은 보이는데 눌러도 안 되는」 상태가 생긴다
   * (`poster/new/page.tsx` 가 같은 판단을 이미 적어 두었다).
   */
  return (
    <StudioLayout>
      <PosterDetailClient projectId={id} adEnabled={isAdExportEnabled()} />
    </StudioLayout>
  );
}
