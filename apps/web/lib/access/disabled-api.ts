import { isDisabledRoute } from "./routes";

/**
 * 꺼 둔 화면의 API 를 막는다.
 *
 * **미들웨어가 안 막아 준다.** `middleware.ts` 는 등록부를 보기 한참 전에
 * `if (pathname.startsWith("/api/")) return response;` 로 API 를 통과시킨다.
 * 그래서 화면만 닫으면 활성 회원 누구나 `curl -X POST /api/sources` 로 새
 * 수집 소스를 계속 등록할 수 있다 — **화면에는 안 보이는데 표에는 쌓인다.**
 *
 * **404 로 답한다.** 403 은 「있는데 권한이 없다」로 읽히지만 이것은 지금
 * 없는 기능이다. 화면과 같은 말을 해야 한다.
 *
 * 라우트마다 손으로 부른다. 한 곳이라도 빠지면 그 길만 열려 있게 되므로
 * `__tests__/disabled-api.test.ts` 가 네 파일의 핸들러 수와 문지기 수를 센다.
 */
export function disabledRouteResponse(path: string): Response | null {
  return isDisabledRoute(path) ? new Response(null, { status: 404 }) : null;
}
