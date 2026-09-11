import { describe, expect, it } from "vitest";
import {
  groupCharacterRows,
  isCharacterRow,
  withoutCharacterRows,
} from "../_components/character-rows";

/**
 * 라이브러리 낱장에서 캐릭터의 각도를 **전부** 찾아내는가.
 *
 * 2026-09-11 사용자 지적: 캐릭터를 고르면 정면만 들어가서, 측면을 만들어 둬도
 * 고를 수가 없었다. 각도를 만든 뜻이 사라진다. 여기서 각도를 낱낱이 돌려주고
 * 화면이 그것을 하나씩 고르게 한다.
 */

const 줄 = (id: string, title: string | null) => ({ id, title, url: `/${id}.png` });

describe("캐릭터 줄 가려내기", () => {
  it("「(캐릭터) ·」 두 조각을 함께 본다", () => {
    expect(isCharacterRow("호랑이 (캐릭터) · 정면")).toBe(true);
    // 사람이 손으로 「내 캐릭터」라고 이름 붙인 그림은 캐릭터가 아니다.
    expect(isCharacterRow("내 캐릭터 모음")).toBe(false);
    expect(isCharacterRow("호랑이 (캐릭터)")).toBe(false);
    expect(isCharacterRow(null)).toBe(false);
  });
});

describe("캐릭터별로 묶기", () => {
  const images = [
    줄("a", "호랑이 (캐릭터) · 뒷면"),
    줄("b", "치약 1"),
    줄("c", "호랑이 (캐릭터) · 정면"),
    줄("d", "예천 들기름 모델 (캐릭터) · 왼쪽 45°"),
    줄("e", "호랑이 (캐릭터) · 다각도 한 장"),
    줄("f", "레퍼런스"),
  ];

  it("이름으로 묶고 캐릭터가 아닌 줄은 버린다", () => {
    const groups = groupCharacterRows(images);
    expect(groups.map((group) => group.name)).toEqual(["호랑이", "예천 들기름 모델"]);
    expect(groups[0]!.angles).toHaveLength(3);
  });

  it("정면이 맨 앞이다", () => {
    // 목록이 들어오는 차례는 만든 시각이라, 그대로 두면 뒷면이 앞에 온다.
    const [호랑이] = groupCharacterRows(images);
    expect(호랑이!.angles.map((row) => row.angle)).toEqual(["정면", "뒷면", "다각도 한 장"]);
  });

  it("각도마다 그 낱장을 그대로 들고 있다", () => {
    // 화면이 이 id 로 고르므로, 엉뚱한 장이 붙으면 다른 그림이 들어간다.
    const [호랑이] = groupCharacterRows(images);
    expect(호랑이!.angles.find((row) => row.angle === "정면")!.image.id).toBe("c");
  });

  it("모르는 각도 이름도 버리지 않는다", () => {
    const groups = groupCharacterRows([줄("z", "곰 (캐릭터) · 위에서")]);
    expect(groups[0]!.angles.map((row) => row.angle)).toEqual(["위에서"]);
  });

  it("이름이나 각도가 비면 안 센다", () => {
    expect(groupCharacterRows([줄("x", " (캐릭터) · 정면")])).toHaveLength(0);
    expect(groupCharacterRows([줄("y", "곰 (캐릭터) · ")])).toHaveLength(0);
  });
});

describe("낱장에서 캐릭터 빼기", () => {
  it("캐릭터 칸이 따로 있을 때 겹쳐 보이지 않게 한다", () => {
    const rest = withoutCharacterRows([
      줄("a", "호랑이 (캐릭터) · 정면"),
      줄("b", "치약 1"),
    ]);
    expect(rest.map((image) => image.id)).toEqual(["b"]);
  });
});
