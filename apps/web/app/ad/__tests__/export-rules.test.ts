import { describe, expect, it } from "vitest";
import { AD_SPECS } from "../../../lib/ad/specs";
import { planDerivation } from "../../../lib/ad/derive";
import {
  defaultSelection, safeAreaPercent, specRows, zipEntryName, SHRINK_WARNING,
} from "../export-rules";

const rows = specRows(planDerivation);

describe("화면에 걸 목록", () => {
  it("규격을 하나도 빠뜨리지 않는다", () => {
    expect(rows.map((row) => row.spec.id)).toEqual(AD_SPECS.map((spec) => spec.id));
  });

  /**
   * **지원 안 하는 규격도 숨기지 않는다.** 숨기면 「이 시스템은 비즈보드를
   * 모르는구나」가 되고, 보이면 「아직 안 되는구나」가 된다(설계 §9 원칙 3).
   */
  it("못 뽑는 규격도 목록에 남기고 까닭을 준다", () => {
    const bizboard = rows.find((row) => row.spec.id === "kakao-bizboard")!;
    expect(bizboard.supported).toBe(false);
    expect(bizboard.unsupportedReason).toBeTruthy();
  });

  it("뽑을 수 있는 규격에는 까닭이 안 붙는다", () => {
    const square = rows.find((row) => row.spec.id === "google-rda-square")!;
    expect(square.supported).toBe(true);
    expect(square.unsupportedReason).toBeUndefined();
  });
});

describe("처음에 켜 두는 것", () => {
  it("필수만 켠다 — 선택은 사용자가 고른다", () => {
    const picked = defaultSelection(rows);
    for (const id of picked) {
      expect(AD_SPECS.find((spec) => spec.id === id)!.required, id).toBe(true);
    }
  });

  /**
   * 못 뽑는 것은 필수여도 안 켠다 — 켜 봐야 실패만 돌아온다.
   * 카카오 비즈보드와 네이버 스마트채널이 그렇다.
   */
  it("못 뽑는 규격은 필수여도 안 켠다", () => {
    const picked = defaultSelection(rows);
    expect(picked).not.toContain("kakao-bizboard");
    expect(picked).not.toContain("naver-smartchannel");
  });

  it("전부 켜지 않는다 — 규격 12개면 응답이 8MB 다", () => {
    expect(defaultSelection(rows).length).toBeLessThan(rows.length);
  });

  it("그래도 하나는 켠다 — 빈 화면으로 시작하지 않는다", () => {
    expect(defaultSelection(rows).length).toBeGreaterThan(0);
  });
});

describe("ZIP 안의 이름", () => {
  it("규격 id 와 형식으로 짓는다", () => {
    expect(zipEntryName("google-rda-square", "jpg")).toBe("google-rda-square.jpg");
  });

  /**
   * **사용자가 적은 문자열을 쓰지 않는다.** id 는 우리가 정한 값이지만 한 번
   * 거른다 — 나중에 누가 슬래시를 넣을 수 있다.
   */
  it("경로를 만들 수 있는 글자를 거른다", () => {
    expect(zipEntryName("../../etc/passwd", "jpg")).toBe("------etc-passwd.jpg");
    expect(zipEntryName("a/b", "png")).toBe("a-b.png");
  });

  it("투명 규격도 png 확장자를 받는다", () => {
    expect(zipEntryName("kakao-bizboard", "png-alpha")).toBe("kakao-bizboard.png");
  });

  it("실린 규격 전부가 겹치지 않는 이름을 만든다", () => {
    const names = AD_SPECS.map((spec) => zipEntryName(spec.id, spec.format));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("안전영역 띠", () => {
  /**
   * 규격의 `safeArea` 는 **실제 픽셀**이고 미리보기는 줄여서 보여 준다.
   * 그대로 덮으면 띠가 엉뚱한 자리에 앉는다.
   */
  it("픽셀을 비율로 옮긴다", () => {
    const band = safeAreaPercent(
      { top: 100, right: 0, bottom: 100, left: 40 },
      { width: 1200, height: 1200 },
    );
    expect(band).toEqual({
      top: "8.33%", bottom: "8.33%", left: "3.33%", right: "0.00%",
    });
  });

  it("세로가 긴 규격에서 위아래 비율이 달라진다", () => {
    const band = safeAreaPercent(
      { top: 100, right: 0, bottom: 100, left: 40 },
      { width: 720, height: 1280 },
    );
    expect(band.top).toBe("7.81%");
    expect(band.left).toBe("5.56%");
  });
});

describe("많이 줄었다는 경고", () => {
  it("파워링크가 그 기준을 넘는다 — 5.6배 축소다", () => {
    expect(1200 / 214).toBeGreaterThan(SHRINK_WARNING);
  });

  it("얌전한 축소는 안 넘는다", () => {
    expect(2048 / 1200).toBeLessThan(SHRINK_WARNING);
  });
});
