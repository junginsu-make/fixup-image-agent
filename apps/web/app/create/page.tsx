import { Suspense } from "react";
import type { Metadata } from "next";
import { PdpMakerClient } from "./PdpMakerClient";
import "./create-theme.css";

export const metadata: Metadata = {
  title: "상세페이지 새로 만들기",
  description:
    "제품 이미지를 업로드하면 AI가 상세페이지 구조와 섹션 이미지를 설계해 주는 도구",
};

export default function CreatePage() {
  // .create-root: 이식한 pdp 모듈 CSS의 레거시 변수를 공통 토큰에 매핑하는 스코프
  return (
    <div className="create-root">
      {/* useSearchParams(?draft=) 는 Suspense 경계를 요구한다(Next 14). */}
      <Suspense>
        <PdpMakerClient />
      </Suspense>
    </div>
  );
}
