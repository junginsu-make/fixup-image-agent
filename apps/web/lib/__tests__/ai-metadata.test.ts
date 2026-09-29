import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { APNG } from "./fixtures/apng";
import { animatedWebp } from "./fixtures/animated";
import { isAnimatedPng } from "../image-encoding";

/**
 * **파일 안에 「AI 가 만들었다」가 적히는가**(2026-09-29 사용자 요청).
 *
 * ── 왜 이 시험이 있나 ──────────────────────────────────────
 *
 * 인공지능기본법 제31조가 결과물에 AI 생성 사실을 표시하라고 한다. 다운로드로
 * 서비스 밖에 나가는 그림은 **파일 자체에** 표시가 있어야 한다.
 *
 * 보이는 배지는 **관리자가 끌 수 있다.** 끄면 파일에 표시가 하나도 안 남는다.
 * 이 표시는 그 설정과 무관하게 항상 들어가야 하고, 그것이 이 시험의 핵심이다.
 *
 * ── 왜 실제 그림으로 재나 ──────────────────────────────────
 *
 * 메타데이터는 **형식마다 담는 자리가 다르다.** PNG 는 텍스트 청크, WebP 는
 * RIFF 청크, JPEG 는 APP1 이다. 가짜로 흉내 내면 「우리 코드가 부르긴 했다」만
 * 재고 **정작 파일에 남았는지는 못 본다.**
 */

vi.mock("server-only", () => ({}));

const { stampAiMetadata, hasAiMetadata, AI_METADATA } = await import("../ai-metadata");

/**
 * 결이 있는 그림. **단색으로는 손실·무손실 차이를 못 잰다** — 어느 인코더로
 * 구워도 비슷하게 작아져서 「3배가 된다」 같은 성질이 드러나지 않는다.
 */
const 결있는그림 = (w = 240, h = 240) => {
  const 화소 = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const at = (y * w + x) * 3;
      화소[at] = (x * 13 + y * 7) % 256;
      화소[at + 1] = (x * x + y * y) % 256;
      화소[at + 2] = (x * 3 + y * 11) % 256;
    }
  }
  return sharp(화소, { raw: { width: w, height: h, channels: 3 } });
};

/** 작은 그림 한 장. 형식만 갈아 낸다. */
const 그림 = (형식: "png" | "webp" | "jpeg") => {
  const s = sharp({ create: { width: 120, height: 80, channels: 3, background: "#3a7d5f" } });
  if (형식 === "png") return s.png().toBuffer();
  if (형식 === "jpeg") return s.jpeg().toBuffer();
  return s.webp({ lossless: true }).toBuffer();
};

describe("표시를 적는다", () => {
  it.each(["png", "webp"] as const)("**%s 에 표시가 남는다**", async (형식) => {
    const 찍은것 = await stampAiMetadata(await 그림(형식));

    expect(await hasAiMetadata(찍은것), "파일에 표시가 안 남았다").toBe(true);
  });

  /**
   * **형식을 바꾸면 안 된다.** 저장 경로가 무손실 유지와 용량 가드를 세워
   * 놓았는데, 이 단계가 형식을 갈아 버리면 그 규칙을 앞질러 간다.
   */
  it.each(["png", "webp"] as const)("**%s 형식이 그대로다**", async (형식) => {
    const 찍은것 = await stampAiMetadata(await 그림(형식));

    expect((await sharp(찍은것).metadata()).format).toBe(형식);
  });

  /**
   * **들어온 색 프로파일을 바이트 단위로 지킨다.**
   *
   * 처음엔 `withMetadata({ exif })` 를 썼는데 그것이 **ICC 를 sRGB 로 갈아치웠다**
   * (2026-09-29 독립 검토가 찾았다). 프로파일이 사라지는 것보다 나쁘다 — 파일이
   * P3 숫자를 두고 「이것은 sRGB 다」라고 거짓 선언하게 되어 모든 뷰어가 색을
   * 틀리게 그린다. 화소를 비교하는 시험으로는 이것이 안 잡힌다.
   */
  it("**Display P3 프로파일이 그대로 남는다**", async () => {
    const p3 = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#d81b60" } })
      .withIccProfile("p3").png().toBuffer();
    const 원래프로파일 = (await sharp(p3).metadata()).icc;
    expect(원래프로파일, "표본에 프로파일이 안 붙었다 — 이 시험이 아무것도 안 잰다").toBeTruthy();

    const 찍은것 = await stampAiMetadata(p3);

    const 뒤프로파일 = (await sharp(찍은것).metadata()).icc;
    expect(뒤프로파일?.equals(원래프로파일!), "색 프로파일이 바뀌었다").toBe(true);
    expect(await hasAiMetadata(찍은것), "프로파일을 지키려다 표시를 놓쳤다").toBe(true);
  });

  /** 없던 프로파일을 끼워 넣지도 않는다. 광고 규격은 그 480바이트도 규격 위반으로 본다. */
  it("**프로파일이 없던 그림에 끼워 넣지 않는다**", async () => {
    const 찍은것 = await stampAiMetadata(await 그림("png"));

    expect((await sharp(찍은것).metadata()).icc, "sRGB 프로파일이 새로 끼어들었다").toBeUndefined();
  });

  it("**픽셀 크기가 그대로다**", async () => {
    const 원본 = await 그림("png");
    const 찍은것 = await stampAiMetadata(원본);
    const [a, b] = await Promise.all([sharp(원본).metadata(), sharp(찍은것).metadata()]);

    expect([b.width, b.height]).toEqual([a.width, a.height]);
  });

  /** 무손실이어야 하는 자리다. 픽셀이 바뀌면 안 된다. */
  it("**무손실 WebP 의 픽셀이 안 바뀐다**", async () => {
    const 원본 = await 그림("webp");
    const 찍은것 = await stampAiMetadata(원본);

    const [a, b] = await Promise.all([
      sharp(원본).raw().toBuffer(),
      sharp(찍은것).raw().toBuffer(),
    ]);
    expect(b.equals(a), "픽셀이 달라졌다").toBe(true);
  });

  /** 값이 조용히 바뀌면 나중에 무엇을 적었는지 알 수 없다. */
  it("**적는 값이 못 박혀 있다**", async () => {
    expect(AI_METADATA.software).toBe("FormWith AI");
    expect(AI_METADATA.digitalSourceType).toBe("trainedAlgorithmicMedia");
    // EXIF 의 이 칸은 ASCII 다. 한글을 넣으면 뷰어마다 깨진다.
    expect(AI_METADATA.description).toMatch(/^[\x20-\x7E]+$/);
  });

  it("**적은 값이 파일에서 읽힌다**", async () => {
    const 찍은것 = await stampAiMetadata(await 그림("png"));
    const 적힌것 = (await sharp(찍은것).metadata()).exif!.toString("latin1");

    expect(적힌것).toContain(AI_METADATA.software);
    expect(적힌것, "IPTC 표준값이 안 들어갔다").toContain(AI_METADATA.digitalSourceType);
  });
});

/**
 * **못 적어도 그림을 잃지 않는다.** 표시를 못 넣었다고 만든 그림을 버리는
 * 것이 훨씬 나쁘다.
 */
describe("손대면 안 되는 것", () => {
  /**
   * **이름을 고쳤다.** 원래 「움직이는 그림은 그대로 둔다」라고 붙여 두었는데,
   * 한 장짜리 GIF 는 애니메이션 가드에 닿지도 않고 **형식 가드에서 먼저 빠진다.**
   * 두 애니메이션 가드를 다 지워도 초록이었다 — 이름이 거짓말을 하고 있었다
   * (2026-09-29 독립 검토가 찾았다). 움직임을 실제로 재는 것은 아래 둘이다.
   */
  it("**GIF 는 그대로 둔다 — 형식 가드에서 빠진다**", async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } })
      .gif().toBuffer();

    expect((await stampAiMetadata(gif)).equals(gif), "GIF 를 구웠다").toBe(true);
  });

  /**
   * **JPEG 는 손대지 않는다.** 다시 구우면 2세대 손실이 쌓인다 — q95 로 구워
   * 보니 화소 90% 가 바뀌고 용량이 1.42배가 됐다(2026-09-29 실측). 저장 경로도
   * 같은 이유로 JPEG 를 안 건드린다.
   *
   * **표시를 포기하는 쪽을 골랐다.** 그림을 해치는 것이 더 나쁘다.
   */
  it("**JPEG 는 그대로 둔다 — 다시 구우면 손실이 쌓인다**", async () => {
    const jpg = await 결있는그림().jpeg({ quality: 80 }).toBuffer();

    expect((await stampAiMetadata(jpg)).equals(jpg), "JPEG 를 다시 구웠다").toBe(true);
  });

  /**
   * **손실 WebP 도 손대지 않는다.** 무손실로 다시 구우면 3.07배가 된다
   * (2026-09-29 실측). 형식 이름만으로는 못 가르므로 컨테이너를 본다.
   */
  it("**손실 WebP 는 그대로 둔다 — 무손실로 구우면 3배가 된다**", async () => {
    const 손실 = await 결있는그림().webp({ quality: 80 }).toBuffer();
    // 컨테이너가 실제로 손실 규격이어야 이 시험이 뜻이 있다.
    expect(손실.toString("ascii", 12, 16), "표본이 손실 WebP 가 아니다").toBe("VP8 ");

    expect((await stampAiMetadata(손실)).equals(손실), "손실 WebP 를 무손실로 구웠다").toBe(true);
  });

  /** 무손실 WebP 는 반대로 표시가 들어가야 한다. 위 가드가 전부를 막아 버리면 안 된다. */
  it("**무손실 WebP 는 표시가 들어간다**", async () => {
    const 무손실 = await 결있는그림().webp({ lossless: true }).toBuffer();
    expect(무손실.toString("ascii", 12, 16), "표본이 무손실 WebP 가 아니다").toBe("VP8L");

    expect(await hasAiMetadata(await stampAiMetadata(무손실)), "무손실 WebP 까지 막아 버렸다").toBe(true);
  });

  /**
   * **16비트 그림은 손대지 않는다.** 다시 구우면 8비트로 떨어져 그라데이션에
   * 밴딩이 생긴다. `image-encoding.ts` 가 바로 이것을 막는데 그 가드는 **이
   * 단계 뒤에** 있어서, 여기서 먼저 떨어뜨리면 그 가드가 통과 도장이 된다.
   */
  it("**16비트 PNG 는 그대로 둔다 — 8비트로 떨어진다**", async () => {
    const 깊은 = await 결있는그림().toColourspace("rgb16").png().toBuffer();
    expect((await sharp(깊은).metadata()).depth, "표본이 16비트가 아니다").toBe("ushort");

    const 나온것 = await stampAiMetadata(깊은);

    expect((await sharp(나온것).metadata()).depth, "8비트로 떨어졌다").toBe("ushort");
    expect(나온것.equals(깊은), "16비트 그림을 다시 구웠다").toBe(true);
  });

  /**
   * **APNG 가 가장 위험한 입력이다.** 첫 여덟 바이트가 규격상 표준 PNG 와 같고,
   * libvips 는 APNG 를 못 읽어 `pages` 를 `undefined` 로 준다 — 형식 확인도
   * 프레임 수 확인도 이것을 통과시킨다. 다시 구우면 **첫 장만 남아 움직임이
   * 조용히 죽는다.** 막는 것은 `isAnimatedPng` 하나뿐이다.
   */
  it("**움직이는 PNG 는 그대로 둔다 — pages 로는 못 가른다**", async () => {
    // 이 두 줄이 「왜 바이트를 뒤지나」의 근거다. 하나라도 깨지면 전제가 바뀐 것이다.
    expect((await sharp(APNG).metadata()).format, "PNG 로 읽힌다").toBe("png");
    expect((await sharp(APNG).metadata()).pages, "pages 로 갈랐다면 이 방어가 필요 없다").toBeUndefined();

    expect((await stampAiMetadata(APNG)).equals(APNG), "움직이는 PNG 를 구웠다 — 첫 장만 남는다").toBe(true);
  });

  /**
   * **움직이는 WebP 는 APNG 와 정반대다.** `pages` 가 2 로 제대로 오는 대신
   * `acTL` 검사에는 안 걸린다(그건 PNG 청크다). 그래서 두 방어가 각각 상대가
   * 놓치는 쪽을 잡는다 — 하나라도 빼면 그쪽 형식이 조용히 첫 장만 남는다.
   */
  it("**움직이는 WebP 는 그대로 둔다 — acTL 로는 못 가른다**", async () => {
    const 움직이는것 = await animatedWebp();

    // 이 셋이 「왜 방어가 둘인가」의 근거다.
    expect((await sharp(움직이는것).metadata()).format).toBe("webp");
    expect((await sharp(움직이는것).metadata()).pages, "pages 가 안 오면 이 방어가 무력하다").toBe(2);
    expect(isAnimatedPng(움직이는것), "acTL 로 걸린다면 방어가 하나로 족하다").toBe(false);

    expect(
      (await stampAiMetadata(움직이는것)).equals(움직이는것),
      "움직이는 WebP 를 구웠다 — 첫 장만 남는다",
    ).toBe(true);
  });

  it("**그림이 아니면 그대로 둔다**", async () => {
    const 쓰레기 = Buffer.from("이건 그림이 아니다");

    expect((await stampAiMetadata(쓰레기)).equals(쓰레기)).toBe(true);
  });

  it("**모르는 형식은 그대로 둔다**", async () => {
    const tiff = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } })
      .tiff().toBuffer();

    expect((await stampAiMetadata(tiff)).equals(tiff)).toBe(true);
  });

  it("**표시가 없는 그림을 없다고 읽는다**", async () => {
    expect(await hasAiMetadata(await 그림("png"))).toBe(false);
    expect(await hasAiMetadata(Buffer.from("그림 아님"))).toBe(false);
  });
});
