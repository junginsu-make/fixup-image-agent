/** 방문 분석 이름표. 모르는 키는 그대로 보인다 — 지어낸 이름으로 덮지 않는다(`system/ai-labels.ts` 와 같은 판단). */
const SOURCE: Record<string, string> = {
  "(direct)": "직접 방문 (주소 입력·즐겨찾기·메신저 앱)",
  "(unknown)": "확인 못 함 (기록 전 방문·다른 기기·동의 안 함)",
};
const DEVICE: Record<string, string> = { mobile: "휴대폰", tablet: "태블릿", desktop: "컴퓨터" };
const BROWSER: Record<string, string> = {
  chrome: "크롬", safari: "사파리", edge: "엣지", firefox: "파이어폭스", samsung: "삼성 인터넷",
  kakaotalk: "카카오톡 앱 안", naver: "네이버 앱 안", other: "기타",
};
const PROVIDER: Record<string, string> = { email: "이메일", google: "Google", kakao: "카카오" };

export const sourceLabel = (key: string) => SOURCE[key] ?? key;
export const deviceLabel = (key: string) => DEVICE[key] ?? key;
export const browserLabel = (key: string) => BROWSER[key] ?? key;
export const providerLabel = (key: string) => PROVIDER[key] ?? key;
