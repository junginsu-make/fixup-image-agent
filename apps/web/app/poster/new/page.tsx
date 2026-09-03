import type { Metadata } from "next";
import { StudioLayout } from "../../_components/studio-layout";
import { PosterNewClient } from "../new-client";

export const metadata: Metadata = {
  title: "이미지 만들기",
  description: "참고 이미지·규격·한 줄 지시로 이미지 작업을 시작합니다.",
};

export default function PosterNewPage() {
  return <StudioLayout><PosterNewClient /></StudioLayout>;
}
