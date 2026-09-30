import type { JudgedPhotoRole } from "../../app/easy/photo-roles";

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
  인물포스터: "사람 1명: 화면 중앙 — 검은 웨이브 머리, 아이보리 원숄더 톱, 걷는 포즈 · 무엇이 있나: 연한 베이지 배경, 왼쪽에 세로로 큰 타이포그래피 VOLUME, 오른쪽 위에 작은 제목과 문구들 · 글자 있음(제목·타이포그래피 등) · 디자인: 큰 세로 타이포 일부가 인물 뒤로 가려짐",
  일러스트: "사람 1명: 가운데 — 큰 눈의 애니메이션풍 소녀, 분홍 단발 · 무엇이 있나: 셀 셰이딩으로 그린 애니메이션 일러스트, 배경은 파스텔 하늘 · 글자 없음 · 디자인: 굵은 외곽선과 평면 채색",
} as const;

export interface B1Case { prompt: string; attachments: number; expect: "image" | "talk" | "detail_page" }

export const B1_CASES: B1Case[] = [
  { prompt: "상세페이지 만들어줘", attachments: 0, expect: "detail_page" },
  { prompt: "이 제품 상세페이지 만들어줘", attachments: 1, expect: "detail_page" },
  { prompt: "상세페이지 문구 좀 봐줘", attachments: 0, expect: "talk" },
  { prompt: "안녕하세요", attachments: 1, expect: "talk" },
  { prompt: "이 제품으로 광고 만들어줘", attachments: 1, expect: "image" },
  // 지금 되던 것이 그대로 되는지 — 갈래를 늘리다 깨지면 안 된다.
  { prompt: "해 질 녘 바닷가 포스터 만들어줘", attachments: 0, expect: "image" },
  { prompt: "방금 그린 거 왜 그렇게 나왔어?", attachments: 0, expect: "talk" },
];

export interface B2Case {
  name: string;
  words: string;
  /** 붙인 순서. `undefined` 는 읽기가 없는 사진이다. */
  photos: Array<string | undefined>;
  expect: JudgedPhotoRole[];
  said: boolean[];
  conflicting?: boolean;
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
  { name: "읽기 없음", words: "카페 포스터 만들어줘", photos: [undefined], expect: ["unclear"], said: [false] },
];
