import { describe, expect, it } from "vitest";
import { inOwnerFolder, onlyInOwnerFolder } from "../owner-folder";

/**
 * **저장 위치가 그 주인의 폴더 안인가**(2026-10-03 보안 리뷰).
 *
 * 서버는 줄에 적힌 위치를 서버 권한으로 서명·다운로드·삭제한다. 위치가 남의 폴더를
 * 가리키면 남의 그림이 열리거나 지워진다. storage-js 는 위치를 인코딩 없이 주소에 붙이고,
 * 주소 해석은 `%2e%2e` 를 `..` 로 풀고 탭·줄바꿈을 지운다 — 앞머리만 맞춰도 빠져나간다.
 */
const me = "72000000-0000-4000-8000-00000000000a";
const other = "72000000-0000-4000-8000-00000000000b";

describe("inOwnerFolder", () => {
  it.each([
    `${me}/item/0.png`,
    `${me}/item/0-1a2b3c4d.thumb.webp`,
    `${me}/sns/proj/3.png`,
    `${me}/ref.png`,
    `${me}/references/71000000-0000-4000-8000-000000000001.jpeg`,
  ])("주인 폴더 안이면 통과: %s", (path) => {
    expect(inOwnerFolder(path, me)).toBe(true);
  });

  it.each([
    [`${other}/item/0.png`, "남의 폴더"],
    [`${me}x/item/0.png`, "앞머리만 같은 다른 아이디"],
    [`${me}`, "폴더 이름만"],
    [`${me}/`, "폴더만"],
    [`/${me}/item/0.png`, "앞의 빗금"],
    [`${me}/x/../../${other}/item/0.png`, "점 두 개"],
    [`${me}/x/%2e%2e/%2e%2e/${other}/item/0.png`, "퍼센트로 쓴 점"],
    [`${me}/x/.\t./${other}/item/0.png`, "탭으로 갈라 쓴 점"],
    [`${me}/x/.\n./${other}/item/0.png`, "줄바꿈으로 갈라 쓴 점"],
    [`${me}\\..\\${other}/item/0.png`, "역슬래시"],
    [`${me}/x y.png`, "공백"],
    [`${me}/x\u0000.png`, "제어 문자"],
  ])("막는다: %s (%s)", (path) => {
    expect(inOwnerFolder(path, me)).toBe(false);
  });

  it("주인 아이디가 비었거나 빗금을 품으면 아무것도 통과시키지 않는다", () => {
    expect(inOwnerFolder(`/x.png`, "")).toBe(false);
    expect(inOwnerFolder(`${me}/${other}/x.png`, `${me}/${other}`)).toBe(false);
  });

  it("글자가 아니면 막는다", () => {
    expect(inOwnerFolder(null, me)).toBe(false);
    expect(inOwnerFolder(undefined, me)).toBe(false);
    expect(inOwnerFolder(42, me)).toBe(false);
  });
});

describe("onlyInOwnerFolder", () => {
  it("주인 폴더 밖·빈 값을 걸러 낸다", () => {
    expect(onlyInOwnerFolder([`${me}/a.png`, null, `${other}/b.png`, "", `${me}/c.png`], me))
      .toEqual([`${me}/a.png`, `${me}/c.png`]);
  });
});
