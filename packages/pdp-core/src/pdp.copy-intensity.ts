import type { CopyIntensity, GapPolicy } from "./types";

export function intensityRules(intensity: CopyIntensity): string {
  switch (intensity) {
    case "plain":
      return `[표현 강도: 담백]
- 짧고 직접적인 문장으로 쓴다.
- 감정적 수식어와 후킹 표현을 최소화한다.`;
    case "strong":
      return `[표현 강도: 강함]
- 사실의 범위를 넓히지 않으면서 문제와 기대 결과의 대비를 선명하게 만든다.
- 짧은 후킹 문장을 적극적으로 사용한다.`;
    case "max":
      return `[표현 강도: 최대 후킹]
- 최대 후킹 강도로 쓰되, 근거 딱지의 범위를 넘어서는 사실 주장은 만들지 않는다.
- 긴박감과 대비는 표현으로 만들고 수치·효능·자격은 새로 만들지 않는다.
- **섹션을 줄여서 강해지려 하지 않는다.** 문장을 세게 쓰되 구성은 그대로 둔다.
  특히 반론 섹션을 빼지 않는다 — 강하게 밀어붙일수록 읽는 사람의 반론이 커진다.`;
    default:
      return `[표현 강도: 보통]
- 읽기 쉬운 판매 문장으로 쓰되 과도한 수식은 피한다.
- 사실 주장은 반드시 근거 딱지의 범위 안에서만 쓴다.`;
  }
}

export function gapPolicyRules(policy: GapPolicy): string {
  switch (policy) {
    case "omit":
      return `[근거가 부족한 자리: 생략]
- 근거가 없으면 그 문장을 쓰지 않는다.
- sample 딱지를 만들지 않는다.`;
    case "sample":
      return `[근거가 부족한 자리: 예시]
- 원문에 없는 구체적인 값이 판매 문장을 이해하는 데 필요하면 현실적인 예시를 채우고 sample 딱지를 단다.
- sample의 note에는 무엇을 예시로 채웠는지 한국어 한 줄로 적는다.
- sample은 사실이 아니며 사용자가 확인하기 전에는 이미지 생성으로 넘어가지 않는다.
- 수익·성과 보장, 의학적·신체적 효능, 인증·수상·순위는 예시로 채우지 않는다. 해당 자리는 빈 값과 ask 딱지로 남긴다.`;
    default:
      return `[근거가 부족한 자리: 질문]
- 필요한 사실은 ask 딱지와 빈 값으로 남기고 note에 사용자에게 물을 내용을 적는다.`;
  }
}
