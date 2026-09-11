import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * **잘린 전사가 캐시에 박히면 안 된다.**
 *
 * `runTranscription` 은 중단 시 예외를 던지지 않고 이미 끝난 배치까지만
 * 이어붙여 정상으로 돌아온다. 그래서 부르는 쪽이 보기에는 성공과 구별되지
 * 않았고, 그 값을 성공한 것과 같은 열쇠로 캐시에 넣었다. 5배치짜리를 2/5 에서
 * 취소하고 설정만 바꿔 다시 만들면, 전사 단계를 건너뛰고 앞 2/5 텍스트만으로
 * 생성됐다 — 하단의 수치·인증번호·후기가 통째로 빠진 결과가 새로고침 전까지
 * 계속 나왔다.
 */
const client = readFileSync(new URL("../transcribe-client.ts", import.meta.url), "utf8");
/**
 * **화면 폴더를 통째로 읽는다.**
 *
 * 한 파일만 읽으면 코드가 옆 파일로 옮겨간 순간 시험이 조용히 통과하거나
 * 엉뚱하게 빨개진다. 2,589줄짜리 화면을 여덟 파일로 쪼갤 때 실제로 그랬다.
 */
const wizard = readdirSync(new URL("..", import.meta.url))
  .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
  .map((name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8"))
  .join("\n");

describe("전사 캐시", () => {
  it("끝까지 갔는지 알려 준다", () => {
    expect(client).toContain("complete: done === batches.length");
  });

  it("끝까지 간 것만 캐시에 넣는다", () => {
    expect(wizard).toContain("if (complete) transcriptCacheRef.current = { key: transcriptCacheKey, transcript };");
  });
});

describe("파일 다시 고르기", () => {
  it("고른 뒤 입력 값을 비운다", () => {
    // 안 비우면 같은 파일을 다시 고를 때 change 가 안 뜬다. 배지에는 옛 파일이
    // 남아 있는데 사용자는 새로 고른 줄 알고 크레딧을 쓴다.
    expect(wizard).toContain('event.target.value = "";');
  });
});
