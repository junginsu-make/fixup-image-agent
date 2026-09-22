import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **사용자에게 보이는 이름은 FormWith 하나다.**
 *
 * ── 왜 값으로 재 두나 ──────────────────────────────────────
 *
 * 이름은 **틀려도 아무도 안 아프다.** 화면은 멀쩡히 돌고 시험도 통과한다.
 * 그래서 옛 이름이 조용히 되돌아온다 — 새 화면을 만들며 옆 파일을 베끼거나,
 * 옛 문서를 참고해 문구를 짓거나.
 *
 * 2026-09-22 에 `MCS` 에서 `FormWith` 로 바꿨다. 사용자 눈에 닿는 자리
 * 열여섯 곳이었다.
 *
 * ── 무엇은 안 보는가 ───────────────────────────────────────
 *
 * **CSS 클래스(`mcs-section` 등)는 그대로 둔다.** 사용자는 개발자 도구를
 * 열어야 본다. 714곳을 바꾸면 화면이 깨질 위험만 있고 얻는 것이 없다.
 *
 * **패키지 이름(`@fixup/web`)과 저장소·서버 경로도 그대로다.** 회사명
 * `fixup` 은 유지하기로 했고(2026-09-22 사용자 결정), 그것을 바꾸면 배포
 * 스크립트와 서버 경로까지 전부 손대야 한다.
 */

const WEB = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** 사용자 눈에 닿는 글이 사는 곳. */
const 보이는곳 = ["app/_landing", "app/about", "app/layout.tsx", "lib/email"];

function 파일들(rel: string): string[] {
  const full = join(WEB, rel);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name === "__tests__" || name === "node_modules") continue;
        walk(path);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) {
        found.push(path);
      }
    }
  };
  statSync(full).isDirectory() ? walk(full) : found.push(full);
  return found;
}

/** 주석을 뺀 실제 코드. 고친 까닭을 적으려면 옛 이름을 인용해야 한다. */
const 코드만 = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const 짧게 = (path: string) => path.slice(path.indexOf("app")).replace(/\\/g, "/");

describe("사용자에게 보이는 이름", () => {
  const 대상 = 보이는곳.flatMap(파일들);

  it("**셀 파일이 있다** — 못 찾으면 아래 검사가 전부 조용히 통과한다", () => {
    expect(대상.length).toBeGreaterThanOrEqual(8);
  });

  it("**옛 이름이 한 곳도 안 남았다**", () => {
    const 남은것 = 대상
      .filter((path) => /\bMCS\b/.test(코드만(path)))
      .map(짧게);

    expect(남은것, `옛 이름이 남은 곳: ${남은것.join(", ")}`).toEqual([]);
  });

  it("**새 이름이 실제로 쓰인다** — 지우기만 하고 안 넣으면 빈 자리가 된다", () => {
    const 쓰는곳 = 대상.filter((path) => 코드만(path).includes("FormWith"));

    expect(쓰는곳.length).toBeGreaterThanOrEqual(6);
  });

  /**
   * **대소문자가 한 벌이어야 한다.** `Formwith`·`FORMWITH`·`formwith` 가
   * 섞이면 같은 화면에서 다르게 보인다.
   */
  it("**표기가 하나다** — FormWith", () => {
    const 어긋난것 = 대상
      .filter((path) => /\b(Formwith|FORMWITH|formWith)\b/.test(코드만(path)))
      .map(짧게);

    expect(어긋난것, `표기가 어긋난 곳: ${어긋난것.join(", ")}`).toEqual([]);
  });
});

/**
 * **이메일 제목은 받은 편지함에서 보이는 첫 글자다.**
 *
 * 화면은 고쳐도 이메일을 빠뜨리기 쉽다 — 개발 중에 눈에 안 띄기 때문이다.
 */
describe("이메일", () => {
  const 메일 = 파일들("lib/email").map((path) => 코드만(path)).join("\n");

  it("**제목에 새 이름이 들어간다**", () => {
    expect(메일).toContain("[FormWith]");
  });

  it("**옛 이름이 안 남았다**", () => {
    expect(메일).not.toMatch(/\bMCS\b/);
  });
});

/**
 * **법적 문서는 이름만 바꾼다**(2026-09-22 사용자 결정).
 *
 * 회사명 `fixup` 과 내용은 그대로 둔다. 지금 「초안」 상태라 게시 전에 법률
 * 검토가 따로 필요하다 — 이름을 바꿨다고 검토가 끝난 것이 아니다.
 */
describe("약관·개인정보처리방침", () => {
  const 문서 = readFileSync(join(WEB, "app/_landing/legal/documents.ts"), "utf8");

  it("**옛 이름이 안 남았다**", () => {
    expect(문서).not.toMatch(/\bMCS\b/);
  });

  it("**새 이름이 쓰인다**", () => {
    expect(문서).toContain("FormWith");
  });

  it("**회사명은 그대로다** — 바꾸지 않기로 했다", () => {
    expect(문서).toContain("fixup");
  });
});

/**
 * **화면에 그대로 뜨는 정적 파일도 본다.**
 *
 * 처음에는 `.ts`·`.tsx` 만 훑었다. 그래서 **비용 전략실의 `index.html` 과
 * 앱 이름이 담긴 `site.webmanifest` 가 통째로 빠졌다** — 옛 이름이 제목에
 * 그대로 남아 있었다.
 *
 * 다른 시험(`cost-lab.test.ts`)이 값으로 재고 있어 잡혔다. 그 시험이 없었으면
 * 배포까지 갔을 것이다. 여기서도 본다.
 */
describe("정적 파일", () => {
  const 정적 = [
    "app/admin/cost-lab/assets/index.html",
    "app/admin/cost-lab/assets/prepaid.html",
    "public/site.webmanifest",
  ];

  it("**셀 파일이 실제로 있다**", () => {
    for (const rel of 정적) {
      expect(() => readFileSync(join(WEB, rel), "utf8"), rel).not.toThrow();
    }
  });

  it("**옛 이름이 안 남았다**", () => {
    const 남은것 = 정적.filter((rel) => {
      const body = readFileSync(join(WEB, rel), "utf8");
      return /MCS/.test(body) || /MCS[가-힣]/.test(body);
    });

    expect(남은것, `옛 이름이 남은 곳: ${남은것.join(", ")}`).toEqual([]);
  });

  it("**새 이름이 쓰인다**", () => {
    for (const rel of 정적) {
      expect(readFileSync(join(WEB, rel), "utf8"), rel).toContain("FormWith");
    }
  });
});
