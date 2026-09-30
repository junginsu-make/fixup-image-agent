import type { EasyPhotoRole, JudgedPhotoRole } from "../../app/easy/photo-roles";

/**
 * §2-11 의 문장표. **설명은 읽기가 돌려줄 모양 그대로** 손으로 쓴다
 * (`describePhoto` 의 모양). 판단만 떼어 재기 위해서다 — 실제 읽기는
 * `read-check.mts` 가 따로 본다.
 */
export const 설명 = {
  제품: "사람 없음 · 무엇이 있나: 흰 배경 위에 갈색 크라프트 원두 봉투 하나가 정면으로 놓여 있음. 봉투에 로고 라벨이 붙어 있음 · 글자 있음(제목·타이포그래피 등)",
  포스터: "사람 없음 · 무엇이 있나: 카페 신메뉴 홍보 포스터. 위에 큰 제목, 가운데 음료 사진, 아래 날짜와 가격 안내 · 글자 있음(제목·타이포그래피 등) · 디자인: 굵은 제목이 음료 뒤로 겹쳐 깔림",
  인물: "사람 1명: 가운데 — 짧은 검은 머리, 흰 셔츠, 정면을 보며 웃음 · 무엇이 있나: 회색 벽 앞에서 찍은 상반신 사진 · 글자 없음",
  인물2: "사람 1명: 가운데 — 어깨까지 오는 갈색 머리, 베이지 코트, 걸어가며 옆을 봄 · 무엇이 있나: 도심 거리에서 찍은 전신 사진 · 글자 없음",
  단체: "사람 4명: 왼쪽에서 첫 번째 — 안경, 파란 후드 / 두 번째 — 긴 생머리, 흰 티셔츠 / 세 번째 — 모자, 체크 셔츠 / 네 번째 — 짧은 머리, 검은 재킷 · 무엇이 있나: 공원 잔디밭에서 네 사람이 어깨동무를 하고 찍은 사진 · 글자 없음",
  // 실제 읽기(2026-09-30 read-check)에서 되물었던 모양 — 모델이 나오는 패션 포스터.
  표: "사람 없음 · 무엇이 있나: 건강기능식품 성분을 비교한 표 캡처. 행과 열에 제품명과 함량이 적혀 있음 · 글자 있음(제목·타이포그래피 등)",
  카드뉴스: "사람 없음 · 무엇이 있나: 건강 정보 카드뉴스 속지. 위에 굵은 제목, 아래 번호 목록과 아이콘 · 글자 있음(제목·타이포그래피 등) · 디자인: 연두색 띠와 둥근 상자",
  인물포스터: "사람 1명: 화면 중앙 — 검은 웨이브 머리, 아이보리 원숄더 톱, 걷는 포즈 · 무엇이 있나: 연한 베이지 배경, 왼쪽에 세로로 큰 타이포그래피 VOLUME, 오른쪽 위에 작은 제목과 문구들 · 글자 있음(제목·타이포그래피 등) · 디자인: 큰 세로 타이포 일부가 인물 뒤로 가려짐",
  // 사용자 사진 확인(2026-09-30)에서 분위기로 떨어졌던 두 모양.
  로고: "사람 없음 · 무엇이 있나: 사람 없이 로고 타이포그래피만 존재. 굵은 검정 글씨 FIX, 그 아래 작은 글씨 Advertisement Agency, 오른쪽에 빨간 굵은 글씨 UP · 글자 있음(제목·타이포그래피 등)",
  가족그림: "사람 2명: 왼쪽 — 하프업 포니테일, 활짝 웃으며 옆 사람 어깨에 기댐 / 오른쪽 — 짧은 검은 머리, 눈을 감고 웃음 · 무엇이 있나: 두 사람이 카페 테이블에서 아이스크림을 먹는 장면을 그린 만화풍 일러스트 · 글자 없음 · 디자인: 굵은 외곽선과 선명한 채색",
  일러스트: "사람 1명: 가운데 — 큰 눈의 애니메이션풍 소녀, 분홍 단발 · 무엇이 있나: 셀 셰이딩으로 그린 애니메이션 일러스트, 배경은 파스텔 하늘 · 글자 없음 · 디자인: 굵은 외곽선과 평면 채색",
} as const;

export type B1Want = "image" | "cardnews" | "either" | "revise" | "talk" | "detail_page";

/** `expect` 가 여럿이면 그중 하나면 맞다. `hasDraft` 는 원고가 있는 대화(2단계 §7). */
export interface B1Case { prompt: string; attachments: number; expect: B1Want | B1Want[]; hasDraft?: boolean }

export const B1_CASES: B1Case[] = [
  { prompt: "상세페이지 만들어줘", attachments: 0, expect: "detail_page" },
  { prompt: "이 제품 상세페이지 만들어줘", attachments: 1, expect: "detail_page" },
  { prompt: "상세페이지 문구 좀 봐줘", attachments: 0, expect: "talk" },
  { prompt: "안녕하세요", attachments: 1, expect: "talk" },
  // 광고는 한 장일 수도 여러 장일 수도 있다 — 묻는 것도 맞다(2단계 §4).
  { prompt: "이 제품으로 광고 만들어줘", attachments: 1, expect: ["image", "either"] },
  // 지금 되던 것이 그대로 되는지 — 갈래를 늘리다 깨지면 안 된다.
  { prompt: "해 질 녘 바닷가 포스터 만들어줘", attachments: 0, expect: "image" },
  { prompt: "방금 그린 거 왜 그렇게 나왔어?", attachments: 0, expect: "talk" },
  // 2단계 — 카드뉴스 · 한 장 · 모름 · 고치기(설계 §12).
  { prompt: "건강기능식품 고르는 법 카드뉴스 만들어줘", attachments: 0, expect: "cardnews" },
  { prompt: "인스타 캐러셀로 여행 팁 정리해줘", attachments: 0, expect: "cardnews" },
  { prompt: "카페 오픈 포스터 한 장 만들어줘", attachments: 0, expect: "image" },
  { prompt: "유튜브 썸네일 만들어줘", attachments: 0, expect: "image" },
  { prompt: "신메뉴 홍보물 만들어줘", attachments: 0, expect: "either" },
  { prompt: "이걸로 만들어줘", attachments: 1, expect: "either" },
  { prompt: "카드뉴스 표지 한 장만 만들어줘", attachments: 0, expect: "image" },
  { prompt: "카드뉴스는 어떻게 만들어요?", attachments: 0, expect: "talk" },
  { prompt: "더 짧게 써줘", attachments: 0, hasDraft: true, expect: "revise" },
  { prompt: "20대 말투로 바꿔줘", attachments: 0, hasDraft: true, expect: "revise" },
  { prompt: "이번엔 강아지 산책 카드뉴스 만들어줘", attachments: 0, hasDraft: true, expect: "cardnews" },
  // 만든 뒤 카드 모습을 고치는 말(설계 §7 「더 밝게」, 2단계 독립 리뷰 1).
  { prompt: "좀 더 밝게 해줘", attachments: 0, hasDraft: true, expect: "revise" },
  { prompt: "배경을 파란색으로 바꿔줘", attachments: 0, hasDraft: true, expect: "revise" },
  { prompt: "표지가 왜 이렇게 어두워?", attachments: 0, hasDraft: true, expect: "talk" },
];

export interface B2Case {
  name: string;
  words: string;
  /** 붙인 순서. `undefined` 는 읽기가 없는 사진이다. */
  photos: Array<string | undefined>;
  expect: JudgedPhotoRole[];
  said: boolean[];
  conflicting?: boolean;
  /** 카드뉴스 턴(2단계 §5-1) — 원본 그대로 · 마지막 장을 안다. */
  cardnews?: boolean;
  /**
   * 이 사진들로 이미 만든 뒤 이어 말하는 턴의 **지난 역할**(설계 §2-4 차례 3).
   * 있으면 `expect` 는 **최종 역할**이다 — said 면 판단한 역할, 아니면 지난 역할.
   */
  previous?: EasyPhotoRole[];
}

export const B2_CASES: B2Case[] = [
  { name: "제품", words: "이 제품으로 광고 만들어줘", photos: [설명.제품], expect: ["preserve_product"], said: [true] },
  { name: "포스터 참고", words: "이거 참고해서 카페 포스터", photos: [설명.포스터], expect: ["style"], said: [false] },
  { name: "이야기 없음", words: "카페 포스터 만들어줘", photos: [설명.제품, 설명.포스터], expect: ["unclear", "style"], said: [false, false] },
  { name: "단체→그림체", words: "1번 사람들을 2번 그림체로", photos: [설명.단체, 설명.일러스트], expect: ["preserve_person_restyled", "style"], said: [true, true] },
  { name: "제품 살리기", words: "제품은 살리고 배경만 바꿔", photos: [설명.제품], expect: ["preserve_product"], said: [true] },
  { name: "이 사람으로", words: "이 사람으로 프로필 만들어줘", photos: [설명.인물], expect: ["preserve_person"], said: [true] },
  { name: "이 느낌으로", words: "이 느낌으로", photos: [설명.인물], expect: ["style"], said: [true] },
  { name: "인물 모호", words: "이거 참고해서", photos: [설명.인물], expect: ["unclear"], said: [false] },
  { name: "두 사람", words: "두 사람 다 그대로 넣어줘", photos: [설명.인물, 설명.인물2], expect: ["preserve_person", "preserve_person"], said: [true, true] },
  { name: "부정문", words: "이 제품 절대 바꿔 그리지 마", photos: [설명.제품], expect: ["preserve_product"], said: [true] },
  { name: "지시 둘", words: "1번은 제품 그대로, 2번은 색감만", photos: [설명.제품, 설명.포스터], expect: ["preserve_product", "style"], said: [true, true] },
  { name: "정정", words: "1번 제품 그대로 해줘. 아 아니다, 1번은 느낌만", photos: [설명.제품], expect: ["style"], said: [true], conflicting: true },
  { name: "인물 포스터", words: "카페 포스터 만들어줘", photos: [설명.인물포스터], expect: ["style"], said: [false] },
  { name: "인물 포스터 이걸로", words: "이걸로 만들어줘", photos: [설명.인물포스터], expect: ["style"], said: [false] },
  { name: "로고 이야기 없음", words: "카페 포스터 만들어줘", photos: [설명.로고], expect: ["unclear"], said: [false] },
  { name: "로고 이걸로", words: "이걸로 만들어줘", photos: [설명.로고], expect: ["preserve_product"], said: [false] },
  { name: "가족 그림 이야기 없음", words: "카페 포스터 만들어줘", photos: [설명.가족그림], expect: ["unclear"], said: [false] },
  { name: "가족 그림 느낌", words: "이 느낌으로 만들어줘", photos: [설명.가족그림], expect: ["style"], said: [true] },
  // 이어 만들기(2026-09-30 두 번째 독립 리뷰). said 가 거짓이면 지난 역할이 그대로 간다.
  { name: "이어서 이 느낌", words: "이 느낌으로 더 화사하게", photos: [설명.제품, 설명.포스터], previous: ["preserve_product", "style"], expect: ["preserve_product", "style"], said: [false, false] },
  { name: "이어서 밝게", words: "좀 더 밝게", photos: [설명.제품, 설명.인물], previous: ["preserve_product", "preserve_person"], expect: ["preserve_product", "preserve_person"], said: [false, false] },
  { name: "이어서 제품 바로잡기", words: "제품은 그대로 두고 더 크게 넣어줘", photos: [설명.제품, 설명.포스터], previous: ["style", "style"], expect: ["preserve_product", "style"], said: [true, false] },
  { name: "이어서 1번 바꾸기", words: "1번은 이제 느낌만 참고해줘", photos: [설명.제품, 설명.포스터], previous: ["preserve_product", "style"], expect: ["style", "style"], said: [true, false] },
  // 2단계 카드뉴스 역할.
  { name: "카드 표 그대로", words: "이 표는 그대로 넣어줘", photos: [설명.표], expect: ["place_as_is"], said: [true], cardnews: true },
  { name: "카드 마지막 장", words: "이 사진을 마지막 장으로 써줘", photos: [설명.제품], expect: ["ending"], said: [true], cardnews: true },
  { name: "카드 이 느낌", words: "이 느낌으로 카드뉴스 만들어줘", photos: [설명.카드뉴스, 설명.카드뉴스, 설명.카드뉴스], expect: ["style", "style", "style"], said: [true, true, true], cardnews: true },
  { name: "카드 이야기 없음", words: "건강기능식품 카드뉴스 만들어줘", photos: [설명.카드뉴스, 설명.제품], expect: ["style", "unclear"], said: [false, false], cardnews: true },
  { name: "읽기 없음", words: "카페 포스터 만들어줘", photos: [undefined], expect: ["unclear"], said: [false] },
];
