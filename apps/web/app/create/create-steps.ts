import type { StepDefinition } from "@fixup/ui";

export type CreateMode = "image" | "text";

export const CREATE_STEPS: Record<CreateMode, StepDefinition[]> = {
  image: [
    { id: "upload", label: "이미지 업로드", desc: "상품 사진 1장" },
    { id: "analyze", label: "AI 분석", desc: "구성 초안 생성" },
    { id: "sections", label: "섹션 생성", desc: "이미지 만들기" },
    { id: "edit", label: "편집 · 내보내기", desc: "문구 · 레이어" },
  ],
  text: [
    { id: "upload", label: "텍스트 입력", desc: "무엇을 파는지" },
    { id: "analyze", label: "시나리오 · 대표 이미지", desc: "확인하고 수정" },
    { id: "sections", label: "섹션 생성", desc: "이미지 만들기" },
    { id: "edit", label: "편집 · 내보내기", desc: "문구 · 레이어" },
  ],
};
