import type { Metadata } from "next";
import { StudioLayout } from "../../_components/studio-layout";
import { NewSnsClient } from "../new-client";
import { isWebSourceEnabled } from "../../../lib/sns/feature";

export const metadata: Metadata = {
  title: "카드뉴스 만들기",
  description: "내용·이미지·규격을 골라 카드뉴스 프로젝트를 시작합니다.",
};

export default function NewSnsPage() {
  // 웹 주소 갈래는 서버의 스위치를 따른다(`lib/sns/feature.ts`). 화면이 스스로 정하지 않는다.
  return <StudioLayout><NewSnsClient webSource={isWebSourceEnabled()} /></StudioLayout>;
}
