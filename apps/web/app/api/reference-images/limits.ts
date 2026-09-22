import { STYLE_REFERENCE_MAX_MB } from "../../../lib/pdp/reference-limits";

/**
 * **참고 이미지를 올리는 문의 상한**(F-7-10-b).
 *
 * 이 라우트는 `await request.formData()` 한 줄이었다. 용량 상한도, 그림인지
 * 보는 눈도 없었다. 인증된 회원이 임의 크기 파일로 서버 메모리를 **두 배로**
 * 부풀릴 수 있었다(원본 + `Uint8Array` 사본).
 *
 * 설계 §14.6(F-7-10-b): 「인증 전 multipart 전체 파싱·**크기 제한 없음** |
 * 수정 | W1/W8 / T-INPUT, T-LIMIT」.
 *
 * ── 왜 상세페이지 쪽 값을 그대로 쓰나 ──────────────────────
 *
 * **같은 문이다.** 사용자가 그림 한 장을 올리는 자리고, 위험도 같다. 값을
 * 새로 정하면 한쪽만 조여지는 날이 오고, 그때 사용자가 보는 것은 이유 없는
 * 413 이다(`lib/pdp/reference-limits.ts` 머리말이 같은 말을 한다).
 *
 * 저쪽은 base64 JSON 이라 팽창분을 얹었고, 여기는 multipart 라 **원본 바이트
 * 그대로** 간다. 그래서 파일 상한(20MB)에 껍데기 몫 1MB 만 더한다.
 */
export const REFERENCE_UPLOAD_BODY_LIMIT = STYLE_REFERENCE_MAX_MB * 1024 * 1024 + 1024 * 1024;

/** 사용자에게 보일 크기. 「몇 MB 냐」는 물음에 답이 있어야 한다. */
export const REFERENCE_UPLOAD_MAX_MB = STYLE_REFERENCE_MAX_MB;
