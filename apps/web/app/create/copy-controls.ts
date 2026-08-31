import type { CopyIntensity, GapPolicy } from "@fixup/pdp-core";

/**
 * 카피 조절기 — 표현 강도와 빈칸 처리.
 *
 * 두 경로가 함께 쓴다. 예전에는 텍스트 경로 화면 안에만 있었고 사진 경로에는
 * 아예 없었다. 같은 사람이 같은 제품을 파는데 **어느 길로 들어왔느냐에 따라
 * 조절기가 사라지는** 상태였다.
 *
 * 목록을 두 벌 두면 한쪽만 늘어난다. 여기가 단일 출처다.
 */

export const COPY_INTENSITIES: ReadonlyArray<{
  value: CopyIntensity;
  label: string;
  /** 이걸 고르면 무엇이 달라지는지. 이름만으로는 고를 수 없다. */
  hint: string;
}> = [
  { value: "plain", label: "담백", hint: "짧고 직접적으로. 후킹 표현을 뺍니다" },
  { value: "normal", label: "보통", hint: "읽기 쉬운 판매 문장" },
  { value: "strong", label: "강함", hint: "문제와 결과의 대비를 선명하게" },
  { value: "max", label: "최대 후킹", hint: "긴박감과 대비를 최대로" },
];

/**
 * 근거가 없는 자리를 어떻게 할 것인가.
 *
 * 사진 경로는 "원문"이 없다. 대신 **사진과 판매자 입력에서 확인되지 않는 것**이
 * 근거 없는 자리다. 그래서 화면 이름을 경로마다 달리 쓴다.
 */
export const GAP_POLICIES: ReadonlyArray<{
  value: GapPolicy;
  label: string;
  hint: string;
}> = [
  { value: "omit", label: "빼기", hint: "근거가 없으면 그 문장을 안 씁니다" },
  { value: "ask", label: "물어보기", hint: "빈칸으로 두고 무엇이 필요한지 알려줍니다" },
  { value: "sample", label: "예시로 채우기", hint: "그럴듯한 값을 넣습니다. 확인 후 고쳐 주세요" },
];

/** 경로마다 다른 이름. 사진 경로에는 '원문'이 없다. */
export const GAP_POLICY_LEGEND = {
  text: "원문에 없는 내용",
  photo: "사진에서 확인 안 되는 내용",
} as const;
