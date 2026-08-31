import type { Metadata } from "next";
import { RedesignWizard } from "./redesign-wizard";

export const metadata: Metadata = {
  title: "상세페이지 리디자인",
  description:
    "기존 상세페이지 이미지와 PDF를 분석해 구매전환 중심으로 리디자인하는 도구",
};

export default function RedesignPage() {
  return <RedesignWizard />;
}
