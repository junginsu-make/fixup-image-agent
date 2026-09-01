import type { Metadata } from "next";
import { StudioLayout } from "../../_components/studio-layout";
import { NewSnsClient } from "../new-client";

export const metadata: Metadata = {
  title: "카드뉴스 만들기",
  description: "내용·이미지·규격을 골라 카드뉴스 프로젝트를 시작합니다.",
};

export default function NewSnsPage() {
  return <StudioLayout><NewSnsClient /></StudioLayout>;
}
