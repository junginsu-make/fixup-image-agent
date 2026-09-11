import path from "node:path";
import type { UserRole } from "../membership/types";

/**
 * 비용 전략실 — **가상 시뮬레이션 도구**를 관리자에게만 내주는 규칙.
 *
 * 이 도구는 기존 시스템과 **이어져 있지 않다.** 운영 DB 도, 크레딧 장부도,
 * 생성 경로도 건드리지 않는다. 모델별 단가를 코드에서 읽어다 만든 계산기일
 * 뿐이라, 화면 하나를 통째로 내주는 것으로 끝난다.
 *
 * 그래서 React 페이지로 옮겨 짜지 않는다. 옮기는 순간 그 도구는 이 저장소의
 * 빌드·상태 관리·디자인 시스템에 묶이고, 원본과 두 벌이 되어 한쪽이 낡는다.
 * **파일 그대로 내준다.**
 */

/** 파일 이름. 라우트와 추적 설정(`next.config.mjs`)이 같은 값을 봐야 한다. */
export const COST_LAB_FILE = "app/admin/cost-lab/lab.html";

/**
 * 꾸러미 안에서 이 파일이 있는 자리.
 *
 * 서버는 `apps/web` 에서 돈다(systemd `WorkingDirectory`). 그래서 작업
 * 디렉터리 기준으로 찾는다 — 개발 서버도 같은 자리다.
 *
 * **`next.config.mjs` 의 `outputFileTracingIncludes` 에 이 파일을 적어야 한다.**
 * Next 의 추적은 `import` 를 따라가는데 이 파일은 `import` 되지 않으므로,
 * 안 적으면 **로컬에서는 되고 배포본에서만 404** 가 된다.
 */
export function costLabFilePath(cwd: string = process.cwd()): string {
  return path.join(cwd, COST_LAB_FILE);
}

/**
 * 이 사람이 열 수 있나.
 *
 * **이 시스템의 등급은 `member` 와 `admin` 둘뿐이다.** 「최고관리자」라는
 * 칸이 따로 없어서, 지금 표현할 수 있는 가장 좁은 범위가 관리자다.
 *
 * 관리자를 더 좁히고 싶으면 등급을 늘리는 것이 아니라 **여기 한 곳**을
 * 고치면 된다 — 판단이 흩어지지 않게 함수로 둔 이유다.
 */
export function canOpenCostLab(viewer: { role: UserRole }): boolean {
  return viewer.role === "admin";
}

/**
 * 내줄 때 붙이는 머리.
 *
 * **`no-store` 다.** 가격·마진을 다룬 화면이라 중간 캐시에 남으면 안 된다.
 * 검색 색인도 막는다 — 로그인 뒤라 닿을 일이 없지만, 막는 값이 싸다.
 */
export const COST_LAB_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};
