import { APP_ROUTES } from "../../../lib/access/routes";
import { FEATURE_PAGES } from "../../_landing/features-content";

/** 방문 분석 이름표. 모르는 키는 그대로 보인다 — 지어낸 이름으로 덮지 않는다(`system/ai-labels.ts` 와 같은 판단). */
const SOURCE: Record<string, string> = {
  "(direct)": "직접 방문 (주소 입력·즐겨찾기·메신저 앱)",
  "(unknown)": "확인 못 함 (기록 전 방문·다른 기기·동의 안 함)",
};
// 도메인·utm 값은 소문자로 비교한다. 여기 없는 값은 그대로 보인다.
const SOURCE_NAMES: Record<string, string[]> = {
  인스타그램: ["instagram", "instagram.com", "l.instagram.com"],
  페이스북: ["facebook", "facebook.com", "m.facebook.com", "l.facebook.com"],
  유튜브: ["youtube", "youtube.com", "m.youtube.com"],
  네이버: ["naver", "naver.com", "m.naver.com"],
  "네이버 검색": ["search.naver.com", "m.search.naver.com"],
  "네이버 블로그": ["blog.naver.com", "m.blog.naver.com"],
  "구글 검색": ["google", "google.com", "google.co.kr"],
  "다음 검색": ["daum.net", "search.daum.net", "m.search.daum.net"],
  카카오톡: ["kakao", "kakaotalk"],
  스레드: ["threads.net", "threads.com"],
  "X(트위터)": ["x.com", "t.co", "twitter.com"],
};
const SOURCE_BY_HOST = new Map(
  Object.entries(SOURCE_NAMES).flatMap(([label, hosts]) => hosts.map((host) => [host, label] as const)),
);
const PAGE: Record<string, string> = {
  "/": "첫 화면", "/login": "로그인", "/signup": "회원가입", "/about": "소개", "/easy": "쉽게 만들기",
  "/onboarding": "가입 정보 확인", "/access": "승인 대기", "/forgot-password": "비밀번호 찾기",
  "/reset-password": "비밀번호 바꾸기", "/ad": "광고 규격 만들기", "/auth/confirm": "메일 인증",
  ...Object.fromEntries(APP_ROUTES.map((route) => [route.path, route.label])),
  "/features": "기능 소개",
  ...Object.fromEntries(FEATURE_PAGES.map((page) => [page.path, `기능 소개 · ${page.keyword}`])),
};
const DEVICE: Record<string, string> = { mobile: "휴대폰", tablet: "태블릿", desktop: "컴퓨터" };
const BROWSER: Record<string, string> = {
  chrome: "크롬", safari: "사파리", edge: "엣지", firefox: "파이어폭스", samsung: "삼성 인터넷",
  kakaotalk: "카카오톡 앱 안", naver: "네이버 앱 안", other: "기타",
};
const PROVIDER: Record<string, string> = { email: "이메일", google: "Google", kakao: "카카오" };

/** 제 칸에 있는 이름만 꺼낸다. `constructor`·`toString` 같은 물려받은 이름이 이름표로 새지 않게. */
const own = (map: Record<string, string>, key: string): string | undefined => (Object.hasOwn(map, key) ? map[key] : undefined);

export const sourceLabel = (key: string) => own(SOURCE, key) ?? SOURCE_BY_HOST.get(key.toLowerCase()) ?? key;
export const deviceLabel = (key: string) => own(DEVICE, key) ?? key;
export const browserLabel = (key: string) => own(BROWSER, key) ?? key;
export const providerLabel = (key: string) => own(PROVIDER, key) ?? key;

/** 주소 → 한글 이름. 같은 주소가 없으면 가장 긴 앞부분 이름 + 나머지 조각. 아무것도 안 맞으면 주소 그대로. */
export function pageLabel(path: string): string {
  const exact = own(PAGE, path);
  if (exact) return exact;
  const parts = path.split("/").filter(Boolean);
  for (let keep = parts.length - 1; keep >= 1; keep -= 1) {
    const label = own(PAGE, `/${parts.slice(0, keep).join("/")}`);
    if (label) return `${label} · ${parts.slice(keep).map((p) => (p.startsWith(":") ? "하나 보기" : p)).join("/")}`;
  }
  return path;
}

/** 두 줄의 숫자 칸을 더한 새 줄. 키(첫 줄의 원래 값)는 그대로 둔다. */
function addCounts<T extends { key: string }>(base: T, extra: T): T {
  const summed = Object.entries(base).map(([field, value]) =>
    [field, typeof value === "number" ? value + Number((extra as Record<string, unknown>)[field] ?? 0) : value]);
  return Object.fromEntries(summed) as T;
}

/**
 * **같은 한글 이름의 줄을 합친다**(instagram·l.instagram.com, kakao·kakaotalk 처럼). 숫자 칸은 더하고 키는 처음 본 줄의 것.
 * 먼저 본 순서를 지킨 채 `rank` 큰 순으로 다시 세운다(같으면 먼저 본 줄이 앞). 방문자처럼 겹칠 수 있는 숫자도 그냥 더한다.
 */
export function mergeByLabel<T extends { key: string }>(rows: T[], label: (key: string) => string, rank: (row: T) => number): T[] {
  const merged = rows.reduce((groups, row) => {
    const name = label(row.key);
    const seen = groups.get(name);
    return new Map(groups).set(name, seen ? addCounts(seen, row) : row);
  }, new Map<string, T>());
  return [...merged.values()].sort((a, b) => rank(b) - rank(a));
}
