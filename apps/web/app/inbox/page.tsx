import type { Metadata } from "next";
import { StudioLayout } from "../_components/studio-layout";
import { InboxClient } from "./inbox-client";

export const metadata: Metadata = {
  title: "수집함",
  description: "수집된 카드뉴스 소재를 읽고 제작 후보로 고릅니다.",
};

export default function InboxPage() {
  return (
    <StudioLayout>
      <InboxClient />
    </StudioLayout>
  );
}
