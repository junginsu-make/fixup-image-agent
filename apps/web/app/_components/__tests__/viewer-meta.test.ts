import { describe, expect, it } from "vitest";
import { parseViewerMeta } from "../viewer-meta";

describe("모달에 함께 보여줄 설명 읽기", () => {
  it("이름과 값의 쌍으로 읽는다", () => {
    expect(parseViewerMeta('{"모델":"GPT Image 2","비율":"4:5"}')).toEqual([
      ["모델", "GPT Image 2"],
      ["비율", "4:5"],
    ]);
  });

  it("적어 준 순서를 지킨다", () => {
    // 중요한 것부터 위에 오게 부르는 쪽이 정한다.
    const meta = parseViewerMeta('{"프롬프트":"바다","모델":"m","비율":"1:1"}');
    expect(meta.map(([name]) => name)).toEqual(["프롬프트", "모델", "비율"]);
  });

  it("빈 값은 버린다", () => {
    // 안 채운 칸까지 보여주면 정작 채운 것이 묻힌다.
    expect(parseViewerMeta('{"모델":"m","톤":"","장수":null}')).toEqual([["모델", "m"]]);
  });

  it("숫자와 참거짓도 글자로 보여준다", () => {
    expect(parseViewerMeta('{"장수":2,"검수":true}')).toEqual([["장수", "2"], ["검수", "true"]]);
  });

  it("모양이 아니면 아무것도 안 보여준다", () => {
    // 화면에서 읽는 값이라 언제든 깨질 수 있다. 깨졌다고 모달이 안 열리면 안 된다.
    expect(parseViewerMeta("깨진 글자")).toEqual([]);
    expect(parseViewerMeta('["a","b"]')).toEqual([]);
    expect(parseViewerMeta(undefined)).toEqual([]);
    expect(parseViewerMeta("")).toEqual([]);
  });

  it("아주 긴 값은 잘라 준다", () => {
    // 프롬프트는 몇 백 자가 넘는다. 그대로 두면 그림보다 글이 커진다.
    const long = "가".repeat(1200);
    const [entry] = parseViewerMeta(JSON.stringify({ 프롬프트: long }));
    expect(entry![1].length).toBeLessThanOrEqual(801);
    expect(entry![1].endsWith("…")).toBe(true);
  });
});
