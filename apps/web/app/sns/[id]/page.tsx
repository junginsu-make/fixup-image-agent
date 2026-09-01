import { StudioLayout } from "../../_components/studio-layout";
import { SnsProjectClient } from "./project-client";

export const dynamic = "force-dynamic";

export default async function SnsProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudioLayout><SnsProjectClient projectId={id} /></StudioLayout>;
}
