/**
 * MCS 교차 타입 (cross-cutting types).
 * 두 도구(pdp / redesign)가 공유하는 프론트엔드 레벨 타입만 둔다.
 * 백엔드 도메인 타입은 각 core 패키지(@fixup/pdp-core, @fixup/redesign-core)에 있다.
 */

/**
 * 어떤 도구의 작업인지 식별.
 *
 * `reference` 는 도구가 아니라 디자인 레퍼런스다. 사용자에게는 이것도
 * "내가 계정에 올려 둔 것"이라 라이브러리에서 같이 보여야 한다 —
 * 계정 화면에만 있으면 어디에 뒀는지 찾지 못한다.
 */
export type ToolId = "pdp" | "redesign" | "reference";

/** 통합 라이브러리에서 양쪽 IndexedDB 작업을 한 화면에 표시하기 위한 공통 형태 (읽기 전용 합산). */
export interface LibraryItem {
  /** 원본 저장소 내 고유 id */
  id: string;
  /** 출처 도구 */
  tool: ToolId;
  /** 표시용 제목 */
  title: string;
  /** 썸네일 data URL (있으면) */
  thumbnail?: string;
  /** 생성 시각 (epoch ms) */
  createdAt: number;
  /**
   * 어디에 보관돼 있는가.
   * "browser" 는 이 브라우저 안에만 있다 — 데이터를 지우면 사라지고 다른 기기에서 안 보인다.
   * "account" 는 서버의 내 계정에 있다.
   */
  storage?: "browser" | "account";
  /** 서버 보관분의 이미지 장수 */
  imageCount?: number;
}

/** 회원제 전환 전 브라우저에 저장했던 개인 API 키 저장소. 마이그레이션 삭제용. */
export const UNIFIED_SETTINGS_STORAGE_KEY = "detail-page-studio-settings-v1";

export * from "./provider-fallback";
export * from "./provider-invocation";
export * from "./attachment-role";
export * from "./attachment-order";
export * from "./attachment-restore";
export * from "./credit";
export * from "./image-look";
export * from "./josa";
export * from "./llm-price";
