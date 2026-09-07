import { describe, expect, it } from "vitest";
import { AD_SPECS } from "../../../lib/ad/specs";
import { planDerivation } from "../../../lib/ad/derive";
import {
  defaultSelection, downloadable, excludedCount, exportableItems, isActualSize,
  failureMessage, previewWidth, safeAreaOverlayStyle, safeAreaPercent, specRows, zipEntryName,
  PREVIEW_MAX_WIDTH, SHRINK_WARNING, bytesFromDataUrl, missingRequiredCount,
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

describe("안전영역 띠가 실제로 그려지는가", () => {
  const style = safeAreaOverlayStyle(
    { top: 100, right: 0, bottom: 100, left: 40 },
    { width: 1200, height: 1200 },
  );

  /**
   * **초판이 여기서 틀렸다.** `border-width` 에 퍼센트를 넣었는데, CSS 의
   * `<line-width>` 는 길이·`thin`·`medium`·`thick` 만 받는다 — 퍼센트는
   * 무시된다. 띠가 아예 안 그려지는데 화면은 멀쩡해 보였다.
   *
   * jsdom 이 없어 DOM 으로는 못 재므로, **CSS 를 고르는 규칙 자체**를 잰다.
   */
  it("퍼센트를 받지 않는 속성에 퍼센트를 넣지 않는다", () => {
    for (const [property, value] of Object.entries(style)) {
      if (!value.includes("%")) continue;
      expect(property, `${property} 는 퍼센트를 받지 않는다`).not.toMatch(/[Ww]idth$/);
      expect(property).not.toMatch(/border/i);
    }
  });

  it("퍼센트를 받는 자리에만 비율을 넣는다", () => {
    expect(style.top).toBe("8.33%");
    expect(style.left).toBe("3.33%");
    expect(["top", "right", "bottom", "left"].every((key) => key in style)).toBe(true);
  });

  it("바깥을 덮을 그림자가 있다 — 안쪽 사각형만으로는 아무것도 안 가린다", () => {
    expect(style.boxShadow).toMatch(/^0 0 0 \d+px rgba\(/);
  });

  it("안전영역이 없는 규격에는 띠를 만들지 않는다", () => {
    // 화면이 `entry.safeArea` 가 있을 때만 부른다. 여기서는 0 이 들어와도
    // 그림자가 화면을 통째로 덮지 않는지만 본다.
    const none = safeAreaOverlayStyle(
      { top: 0, right: 0, bottom: 0, left: 0 }, { width: 100, height: 100 },
    );
    expect(none.top).toBe("0.00%");
  });
});

describe("고를 수 있는 작업만 보여 준다", () => {
  const base = { title: "t", createdAt: 0 };
  const items = [
    { ...base, id: "a", tool: "pdp" as const, storage: "account" as const },
    { ...base, id: "b", tool: "pdp" as const, storage: "browser" as const },
    { ...base, id: "c", tool: "reference" as const, storage: "account" as const },
    { ...base, id: "d", tool: "redesign" as const, storage: "account" as const },
  ];

  /**
   * `/api/ad/export` 는 `library_images` 표만 읽는다. 브라우저 저장분은 **서버에
   * 파일이 아예 없고**, 참고 이미지는 id 체계가 다르다. 걸러내지 않으면
   * 사용자가 고를 수 있는데 누르면 「뽑지 못했습니다」만 뜬다.
   */
  it("브라우저에만 있는 작업을 뺀다 — 서버에 파일이 없다", () => {
    expect(exportableItems(items).map((item) => item.id)).not.toContain("b");
  });

  it("참고 이미지를 뺀다 — id 체계가 다르다", () => {
    expect(exportableItems(items).map((item) => item.id)).not.toContain("c");
  });

  it("계정에 보관된 작업은 남긴다", () => {
    expect(exportableItems(items).map((item) => item.id)).toEqual(["a", "d"]);
  });
});

describe("ZIP 에 무엇을 담는가", () => {
  const results = [
    { specId: "ok-1", status: "ok", dataUrl: "data:image/jpeg;base64,AA" },
    { specId: "fail-bytes", status: "failed", dataUrl: "data:image/jpeg;base64,BB" },
    { specId: "fail-none", status: "failed" },
  ];

  /**
   * `batch.ts` 는 **일부러** 검증 실패 시에도 바이트를 준다 — 사람이 그림을
   * 보고 판단해야 하기 때문이다. 그것을 그대로 묶으면 **포털이 반려할 파일이
   * 정상 파일과 같은 이름으로 한 봉투에 들어간다.**
   */
  it("검증에 걸린 것은 빼고 담는다", () => {
    expect(downloadable(results).map((entry) => entry.specId)).toEqual(["ok-1"]);
  });

  it("빠진 것의 수를 셀 수 있다 — 화면이 그것을 알린다", () => {
    expect(excludedCount(results)).toBe(1);
  });

  it("바이트가 아예 없는 것은 뺀 것으로 세지 않는다 — 애초에 안 만들어졌다", () => {
    expect(excludedCount([{ specId: "x", status: "failed" }])).toBe(0);
  });
});

describe("미리보기를 실제 크기로 보여 준다", () => {
  const CELL = PREVIEW_MAX_WIDTH;

  /**
   * 전부 같은 폭으로 그리면 214×214 가 **1.43배 확대**되어 실제보다 잘 읽히게
   * 보인다 — 「글자가 읽히는지 보세요」라고 적어 놓고 읽히는지 볼 수 없는
   * 크기로 보여 주는 셈이다(설계 §5.2).
   */
  it("셀보다 작은 규격은 1:1 로 그린다", () => {
    expect(previewWidth({ width: 214 }, CELL)).toBe(214);
    expect(isActualSize({ width: 214 }, CELL)).toBe(true);
  });

  it("경고가 붙는 셋은 전부 1:1 로 보인다 — 그래야 경고가 뜻이 있다", () => {
    for (const width of [456, 376, 214]) {
      expect(isActualSize({ width }, CELL), `${width}`).toBe(true);
    }
  });

  it("셀보다 큰 규격은 셀에 맞추고 1:1 이 아니라고 말한다", () => {
    expect(previewWidth({ width: 1200 }, CELL)).toBe(CELL);
    expect(isActualSize({ width: 1200 }, CELL)).toBe(false);
  });

  /**
   * **상한이 이 셋보다 작으면 경고가 뜻을 잃는다.** 「많이 줄었으니 글자를
   * 보세요」라고 해 놓고 그림을 또 줄여서 보여 주는 꼴이 된다.
   */
  it("상한이 경고 대상 중 가장 넓은 것보다 크다", () => {
    expect(PREVIEW_MAX_WIDTH).toBeGreaterThanOrEqual(456);
  });

  it("작은 것을 늘리지 않는다", () => {
    expect(previewWidth({ width: 100 }, CELL)).toBeLessThanOrEqual(100);
  });
});

describe("실패를 사람이 읽을 말로 옮긴다", () => {
  /**
   * 라우트는 두 곳에서 **본문 없는 404** 를 낸다 — 기능이 꺼져 있을 때와 그림을
   * 못 찾을 때. 화면이 `response.json()` 을 `catch(() => null)` 로 받으면 둘 다
   * 「뽑지 못했습니다」로 뭉개져 **왜 안 되는지 알 길이 없다.**
   */
  it("본문이 없어도 404 는 무엇을 하라고 말한다", () => {
    expect(failureMessage(404, null)).toMatch(/다른 작업/);
  });

  it("붐비는 것은 다시 누르면 된다고 말한다", () => {
    expect(failureMessage(429, null)).toMatch(/다시/);
  });

  it("로그인이 풀린 것과 서버 오류를 가른다", () => {
    expect(failureMessage(401, null)).toMatch(/로그인/);
    expect(failureMessage(500, null)).not.toMatch(/로그인/);
  });

  /**
   * 서버가 준 말이 있으면 그것이 낫다 — 「규격을 하나 이상 고르세요」처럼
   * 무엇을 고치면 되는지 이미 적혀 있다.
   */
  it("서버가 준 말이 있으면 그대로 쓴다", () => {
    expect(failureMessage(400, "규격을 하나 이상 고르세요.")).toBe("규격을 하나 이상 고르세요.");
  });

  it("모르는 상태에도 빈 말을 주지 않는다", () => {
    expect(failureMessage(418, null).length).toBeGreaterThan(0);
  });
});

describe("잘라 만드는 규격도 뽑을 수 있다", () => {
  /**
   * **`supported` 에서 `crop` 을 빼도 시험 35개가 전부 초록이었다.**
   *
   * 실제 영향은 작지 않다. 기본으로 켜지는 필수 일곱 중 브랜드검색 둘이 `crop`
   * 이라, 빠지면 **필수 둘이 회색으로 죽고 기본 선택에서 조용히 사라진다.**
   * 그래서 규격 하나를 이름으로 짚어 못 박는다.
   */
  it("브랜드검색 PC 썸네일은 잘라서라도 뽑는다", () => {
    const row = rows.find((r) => r.spec.id === "naver-brand-pc")!;
    expect(planDerivation(row.spec).kind, "이 시험의 전제").toBe("crop");
    expect(row.supported).toBe(true);
    expect(row.unsupportedReason).toBeUndefined();
  });

  it("잘라 만드는 필수 규격이 기본 선택에 들어간다", () => {
    expect(defaultSelection(rows)).toContain("naver-brand-pc");
  });
});

describe("data URL 에서 바이트 꺼내기", () => {
  it("base64 를 그대로 바이트로 옮긴다", () => {
    expect(bytesFromDataUrl("data:image/png;base64,QUJD")).toEqual(new Uint8Array([65, 66, 67]));
  });

  /**
   * `slice(comma + 1)` 을 `slice(comma)` 로 바꾸면 **ZIP 안의 모든 파일이
   * 깨진다** — 앞에 쉼표가 붙은 채로 디코드된다. 화면은 멀쩡하고 봉투만 썩는다.
   */
  it("쉼표를 남기지 않는다", () => {
    const bytes = bytesFromDataUrl("data:image/png;base64,QUJD");
    expect(bytes.length).toBe(3);
    expect(bytes[0]).toBe(65);
  });

  it("256 을 넘지 않는 값으로 담는다 — 멀티바이트가 아니다", () => {
    const bytes = bytesFromDataUrl("data:application/octet-stream;base64,//79");
    expect(Array.from(bytes)).toEqual([255, 254, 253]);
  });

  it("data URL 이 아니면 던진다", () => {
    expect(() => bytesFromDataUrl("그냥 문자열")).toThrow();
  });
});

describe("필수를 꺼 두면 알린다", () => {
  /**
   * 설계 §9 원칙 1 의 뒷 절반이다. 앞 절반(「필수는 켜고 시작한다」)만 있으면,
   * 사용자가 필수를 끄고 뽑아도 화면이 아무 말을 안 한다 — 포털이 반려하고 나서야
   * 안다.
   *
   * **못 뽑는 규격은 세지 않는다.** 그것은 사용자가 어쩔 수 없는 것이고,
   * 그 자리에는 이미 다른 문구가 있다.
   */
  it("필수를 다 켜 두면 0 이다", () => {
    expect(missingRequiredCount(rows, defaultSelection(rows))).toBe(0);
  });

  it("필수를 하나 끄면 1 이다", () => {
    const picked = defaultSelection(rows).filter((id) => id !== "naver-brand-pc");
    expect(missingRequiredCount(rows, picked)).toBe(1);
  });

  it("선택 규격을 꺼도 세지 않는다", () => {
    const optional = rows.find((r) => r.supported && !r.spec.required)!;
    expect(defaultSelection(rows)).not.toContain(optional.spec.id);
    expect(missingRequiredCount(rows, defaultSelection(rows))).toBe(0);
  });

  it("못 뽑는 필수 규격은 세지 않는다 — 사용자가 어쩔 수 없다", () => {
    const blocked = rows.filter((r) => !r.supported && r.spec.required);
    expect(blocked.length, "이 시험의 전제").toBeGreaterThan(0);
    expect(missingRequiredCount(rows, defaultSelection(rows))).toBe(0);
  });
});
