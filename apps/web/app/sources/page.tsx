import type { Metadata } from "next";
import { StudioLayout } from "../_components/studio-layout";
import { SourcesClient } from "./sources-client";

export const metadata: Metadata = {
  title: "수집 미디어",
  description: "카드뉴스 소재를 가져올 채널과 피드를 관리합니다.",
};

export default function SourcesPage() {
  return (
    <StudioLayout>
      <SourcesClient />
    </StudioLayout>
  );
}
