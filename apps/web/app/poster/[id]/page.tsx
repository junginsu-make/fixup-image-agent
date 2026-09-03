import type { Metadata } from "next";
import { StudioLayout } from "../../_components/studio-layout";
import { PosterDetailClient } from "./detail-client";

export const metadata: Metadata = { title: "이미지 작업" };

export default async function PosterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudioLayout><PosterDetailClient projectId={id} /></StudioLayout>;
}
