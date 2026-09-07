/**
 * 포털 광고 소재 규격과, 그것을 만들 마스터.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §6·§7
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 데이터라 시험과 화면 양쪽에서
 * 읽는다 — `grid-thumbnail-path.ts` 가 같은 이유로 갈라져 있다.
 *
 * **`packages/sns-core` 가 아니라 여기 두는 이유**: sns-core 는 `src/index.ts`
 * 하나로만 내보낸다. 거기에 export 를 더하면 격리 계약 1(기존 파일 무접촉)을
 * 어긴다.
 */

/**
 * 모델이 실제로 만들 수 있는 그림.
 *
 * 다섯 값 모두 GPT Image 2 의 제한을 통과해야 한다 — 16의 배수, 65.5만~829만
 * 픽셀, 최대 변 3840, 비율 3:1 이내. `ad-derive.test.ts` 가 못 박는다.
 *
 * **`POSTER_RATIOS` 를 참조하지 않는다.** 값이 같은 항목이 둘 있지만
 * (`ad-4x5`·`ad-9x16`), 그 배열에 기대면 기존 목록이 바뀔 때 광고가 조용히
 * 따라 바뀐다. 광고는 자기 값을 들고 `match-source` 로 넘긴다(설계 §4.2).
 */
export interface AdMaster {
  id: string;
  width: number;
  height: number;
}

export const AD_MASTERS: AdMaster[] = [
  { id: "ad-1x1", width: 1200, height: 1200 },
  { id: "ad-191x1", width: 2048, height: 1072 },
  { id: "ad-2x1", width: 1600, height: 800 },
  /**
   * 3:2. **브랜드검색 PC 하나 때문에 있다.**
   *
   * 456×304 는 정확히 3:2 인데, 이 마스터가 없으면 `ad-191x1`(1.91:1)에서
   * 잘라 써서 **구도의 21.5% 를 버린다.** 필수 규격이 그만큼 잘려 나가는 것을
   * 두고 볼 수 없다(설계 `2026-09-07-ad-assembly-engine.md` §3.2).
   *
   * **1536×1024 인 근거**: `sizeFromSource` 가 이 값을 그대로 돌려준다 —
   * 16의 배수이고 최소 픽셀(655,360)을 넘으며 3:1 아래다. 1632×1088·
   * 1920×1280 도 같지만, 목표(456×304)의 3.4배면 충분하고 생성이 쌀수록 낫다.
   *
   * **다른 규격을 안 끌고 간다** — 17개 배정을 전후로 돌려 확인했다.
   * 바뀌는 것은 `naver-brand-pc` 하나뿐이다.
   */
  { id: "ad-3x2", width: 1536, height: 1024 },
  { id: "ad-4x5", width: 1088, height: 1360 },
  { id: "ad-9x16", width: 1152, height: 2048 },
];

export function masterById(id: string): AdMaster | undefined {
  return AD_MASTERS.find((master) => master.id === id);
}

/**
 * 광고 소재 규격 하나.
 *
 * **`master` 와 `derive` 를 필드로 두지 않는다.** 초판이 사람 눈대중으로 적었다가
 * 둘을 틀렸다(확대가 필요한 배정, 방향이 반대인 배정). `planDerivation` 이
 * 실행 시점에 계산하고 시험이 검사한다(설계 §6.3).
 */
export interface AdSpec {
  id: string;
  portal: "naver" | "google" | "kakao";
  /** 광고 상품. 화면에서 묶는 단위. */
  product: string;
  label: string;
  target: { width: number; height: number };
  /**
   * **그 상품을 등록하려면 반드시 있어야 하는가.**
   *
   * 성과가 떨어지는 것은 선택이다. 없으면 **등록 자체가 안 되는 것**만 필수다.
   */
  required: boolean;
  format: "jpg" | "png" | "png-alpha";
  /** 만드는 것이 아니라 받아야 하는 것. 브랜드 로고가 그렇다. */
  supply?: "upload";
  /** 포털이 거는 용량 상한. 넘으면 등록이 거부된다. */
  maxBytes?: number;
  /**
   * 포털이 거는 용량 **하한**. 모자라면 등록이 거부된다.
   *
   * 상한만 보면 단색에 가까운 시안이 2KB 로 나와도 통과한다 — 네이버 메인은
   * 50KB 미만을 받지 않는다.
   */
  minBytes?: number;
  /**
   * 주요 요소를 두면 안 되는 가장자리.
   *
   * **아직 크롭 기준으로는 안 쓴다.** 설계 §3.3 은 「`safeArea` 가 있으면 그
   * 영역이 살아남는 쪽으로 치우쳐 자른다」고 적었지만, 지금 크롭하는 셋
   * (`naver-gfa-main`·`naver-brand-pc`·`naver-brand-mobile`)에는 `safeArea` 가
   * 없고 `safeArea` 를 가진 카카오 넷은 전부 `resize` 라 치우칠 일이 없다.
   * 쓰이는 곳은 2단계 미리보기의 반투명 띠다(§5.2).
   */
  safeArea?: { top: number; right: number; bottom: number; left: number };
  /** 이 수치를 마지막으로 확인한 날. 규격은 조용히 바뀐다. */
  verifiedAt: string;
  /**
   * 출처의 성격.
   *
   * **`reference` 는 「확인했다」가 아니라 「대행사 자료를 옮겨 적었다」는 뜻이다.**
   * 네이버 공식 문서가 광고주 로그인 뒤에 있어 공개 확인이 안 됐다. 이것이
   * 데이터에 없으면 화면이 구글·카카오와 똑같이 보여 주게 되고, `verifiedAt` 이
   * 검증되지 않은 값에 검증 도장을 찍는 꼴이 된다.
   *
   * **읽는 곳은 3단계 규격 선택 화면의 「참고」 배지다**(설계 §9·§11).
   * 아직 아무도 안 쓰지만 지금 적는다 — 이것은 규격 값이 아니라 **조사 시점의
   * 관찰**이라 나중에 코드만 보고는 복원할 수 없다. `safeArea` 처럼 언제든
   * 다시 찾을 수 있는 값과 다르다.
   */
  sourceKind: "official" | "reference";
  /** 출처 주소. 확인할 때 여기서 시작한다. */
  source: string;
  note?: string;
}

const GOOGLE_RDA = "https://support.google.com/google-ads/answer/17090561?hl=en";
const KAKAO_DISPLAY = "https://kakaobusiness.gitbook.io/main/ad/moment/performance/displayad/content-guide";
const KAKAO_BIZBOARD = "https://kakaobusiness.gitbook.io/main/ad/moment/performance/talkboard/content-guide";
const NAVER_REF = "https://flowworks.io/blog/naver-ad-image-size-guide";

/** 카카오 디스플레이 안전영역 — 상하 100px, 좌 40px. */
const KAKAO_SAFE = { top: 100, right: 0, bottom: 100, left: 40 };

export const AD_SPECS: AdSpec[] = [
  // ── 구글 (공식 문서 확인됨) ─────────────────────────────────────────
  {
    id: "google-rda-landscape",
    portal: "google", product: "반응형 디스플레이", label: "가로 1200×628",
    target: { width: 1200, height: 628 },
    required: true, format: "jpg", maxBytes: 5_242_880,
    verifiedAt: "2026-09-06", sourceKind: "official", source: GOOGLE_RDA,
  },
  {
    id: "google-rda-square",
    portal: "google", product: "반응형 디스플레이", label: "정사각 1200×1200",
    target: { width: 1200, height: 1200 },
    required: true, format: "jpg", maxBytes: 5_242_880,
    verifiedAt: "2026-09-06", sourceKind: "official", source: GOOGLE_RDA,
  },
  {
    id: "google-rda-portrait",
    portal: "google", product: "반응형 디스플레이", label: "세로 960×1200",
    target: { width: 960, height: 1200 },
    required: false, format: "jpg", maxBytes: 5_242_880,
    verifiedAt: "2026-09-06", sourceKind: "official", source: GOOGLE_RDA,
  },
  {
    id: "google-rda-logo",
    portal: "google", product: "반응형 디스플레이", label: "로고 1200×300",
    target: { width: 1200, height: 300 },
    required: false, format: "png", supply: "upload", maxBytes: 5_242_880,
    verifiedAt: "2026-09-06", sourceKind: "official", source: GOOGLE_RDA,
    note: "안 넣으면 구글이 기본 아이콘을 넣는다. 등록은 된다."
      + " 만들지 않고 받지만 **받은 바이트도 규격 검사를 거친다**(2단계) — 그래서 상한이 필요하다.",
  },

  // ── 카카오 (공식 가이드 확인됨) ─────────────────────────────────────
  {
    id: "kakao-display-square",
    portal: "kakao", product: "디스플레이", label: "정사각 1200×1200",
    target: { width: 1200, height: 1200 },
    required: true, format: "jpg", maxBytes: 10_485_760, safeArea: KAKAO_SAFE,
    verifiedAt: "2026-09-06", sourceKind: "official", source: KAKAO_DISPLAY,
  },
  {
    id: "kakao-display-2x1",
    portal: "kakao", product: "디스플레이", label: "가로 1200×600",
    target: { width: 1200, height: 600 },
    required: false, format: "jpg", maxBytes: 10_485_760, safeArea: KAKAO_SAFE,
    verifiedAt: "2026-09-06", sourceKind: "official", source: KAKAO_DISPLAY,
  },
  {
    id: "kakao-display-9x16",
    portal: "kakao", product: "디스플레이", label: "세로 720×1280",
    target: { width: 720, height: 1280 },
    required: false, format: "jpg", maxBytes: 10_485_760, safeArea: KAKAO_SAFE,
    verifiedAt: "2026-09-06", sourceKind: "official", source: KAKAO_DISPLAY,
  },
  {
    id: "kakao-display-4x5",
    portal: "kakao", product: "디스플레이", label: "세로 960×1200",
    target: { width: 960, height: 1200 },
    required: false, format: "jpg", maxBytes: 10_485_760, safeArea: KAKAO_SAFE,
    verifiedAt: "2026-09-06", sourceKind: "official", source: KAKAO_DISPLAY,
  },
  {
    id: "kakao-bizboard",
    portal: "kakao", product: "비즈보드", label: "비즈보드 1029×258",
    target: { width: 1029, height: 258 },
    required: true, format: "png-alpha", maxBytes: 307_200,
    verifiedAt: "2026-09-06", sourceKind: "official", source: KAKAO_BIZBOARD,
    note: "투명 배경 PNG-24. 조립 엔진이 필요해 아직 지원하지 않는다(설계 §3.4).",
  },

  // ── 네이버 (⚠️ 공식 문서가 로그인 뒤에 있어 미검증) ──────────────────
  {
    id: "naver-gfa-native",
    portal: "naver", product: "GFA", label: "네이티브 1200×1200",
    target: { width: 1200, height: 1200 },
    required: true, format: "jpg", maxBytes: 2_097_152,
    verifiedAt: "2026-09-06", sourceKind: "reference", source: NAVER_REF,
  },
  {
    id: "naver-gfa-banner",
    portal: "naver", product: "GFA", label: "이미지 배너 1200×628",
    target: { width: 1200, height: 628 },
    required: true, format: "jpg", maxBytes: 2_097_152,
    verifiedAt: "2026-09-06", sourceKind: "reference", source: NAVER_REF,
  },
  {
    id: "naver-gfa-main",
    portal: "naver", product: "GFA", label: "네이버 메인 1250×560",
    target: { width: 1250, height: 560 },
    required: false, format: "jpg", maxBytes: 256_000, minBytes: 50_000,
    verifiedAt: "2026-09-06", sourceKind: "reference", source: NAVER_REF,
    note: "50~250KB. 위아래가 다 막혀 있는 유일한 규격이다.",
  },
  {
    id: "naver-gfa-thumb",
    portal: "naver", product: "GFA", label: "썸네일 300×300",
    target: { width: 300, height: 300 },
    required: false, format: "jpg", maxBytes: 2_097_152,
    verifiedAt: "2026-09-06", sourceKind: "reference", source: NAVER_REF,
  },
  {
    id: "naver-brand-pc",
    portal: "naver", product: "브랜드검색", label: "PC 썸네일 456×304",
    target: { width: 456, height: 304 },
    required: true, format: "jpg",
    verifiedAt: "2026-09-06", sourceKind: "reference", source: NAVER_REF,
    note: "출처는 「228×152 **이상**, 비율 유지」다. 그 두 배로 둔다 — 최소값으로"
      + " 두면 마스터에서 7.1배를 줄여야 해서 **결과물 중 가장 흐려진다.**"
      + " 「이상」이라는 읽기에 기대는 값이므로 콘솔 확인 목록에 있다. 테두리 불가.",
  },
  {
    id: "naver-brand-mobile",
    portal: "naver", product: "브랜드검색", label: "모바일 썸네일 376×220",
    target: { width: 376, height: 220 },
    required: true, format: "jpg",
    verifiedAt: "2026-09-06", sourceKind: "reference", source: NAVER_REF,
    note: "출처는 「188×110 **이상**, 비율 유지」다. 그 두 배로 둔다 — 최소값이면"
      + " 9.7배 축소로 가장 흐려진다. 「이상」이라는 읽기에 기대는 값이다.",
  },
  {
    id: "naver-powerlink",
    portal: "naver", product: "파워링크 확장소재", label: "파워링크 이미지 214×214",
    target: { width: 214, height: 214 },
    required: false, format: "jpg",
    verifiedAt: "2026-09-06", sourceKind: "reference", source: NAVER_REF,
    note: "확장소재는 없어도 광고가 나간다.",
  },
  {
    id: "naver-smartchannel",
    portal: "naver", product: "GFA", label: "스마트채널 750×160",
    target: { width: 750, height: 160 },
    required: true, format: "png-alpha", maxBytes: 2_097_152,
    verifiedAt: "2026-09-06", sourceKind: "reference", source: NAVER_REF,
    note: "투명 PNG 만 받는다. 조립 엔진이 필요해 아직 지원하지 않는다(설계 §3.4).",
  },
];
