import type { StepDefinition } from "@fixup/ui";

/**
 * 단계 이름에 **번호를 붙인다.**
 *
 * 이미지 만들기·카드뉴스는 「01 레퍼런스」처럼 번호가 라벨 안에 있는데
 * 상세페이지만 없었다. 같은 서비스에서 도구마다 다르게 세면 사용자가
 * 「여기는 몇 단계짜리지」를 매번 다시 읽어야 한다.
 */

export type CreateMode = "image" | "text";

export const CREATE_STEPS: Record<CreateMode, StepDefinition[]> = {
  image: [
    { id: "upload", label: "01 이미지 업로드", desc: "상품 사진 1장" },
    { id: "analyze", label: "02 구성 확인", desc: "AI 초안 고치기" },
    { id: "sections", label: "03 섹션 생성", desc: "이미지 만들기" },
    { id: "edit", label: "04 편집 · 내보내기", desc: "문구 · 레이어" },
  ],
  text: [
    { id: "upload", label: "01 텍스트 입력", desc: "무엇을 파는지" },
    { id: "analyze", label: "02 구성 확인", desc: "시나리오 · 대표 이미지" },
    { id: "sections", label: "03 섹션 생성", desc: "이미지 만들기" },
    { id: "edit", label: "04 편집 · 내보내기", desc: "문구 · 레이어" },
  ],
};
