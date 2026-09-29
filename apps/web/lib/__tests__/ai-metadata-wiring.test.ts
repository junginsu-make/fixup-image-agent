import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeForStorage, makeThumbnail, toPng } from "../image-encoding";
import { checkAgainstSpec } from "../ad/check";
import { AD_SPECS, type AdSpec } from "../ad/specs";

/**
 * **배지를 꺼도 파일에 표시가 남는가**(2026-09-29 사용자 요청).
 *
 * ── 이 시험이 지키는 것 ────────────────────────────────────
 *
 * 하나다 — **관리자가 보이는 배지를 꺼도 파일 안 표시는 남는다.**
 *
 * 인공지능기본법 제31조는 결과물이 AI 로 생성됐다는 사실을 표시하라고 하고,
 * 다운로드로 서비스 밖에 나가는 그림은 **파일 자체에** 표시가 있어야 한다.
 * 배지만 있고 그것을 끌 수 있으면, 끈 상태의 결과물은 요건을 못 채운다.
 *
 * 조사한 내용은 `docs/ai-labeling-law.html` 에 있다.
 *
 * ── 왜 진짜 그림으로 재나 ──────────────────────────────────
 *
 * 「부르긴 했다」를 재는 시험은 **정작 파일에 남았는지를 못 본다.** 메타데이터는
 * 다시 굽는 단계마다 조용히 사라지고, 실제로 그렇게 사라지고 있었다 —
 * 배지 합성 단계에 `keepMetadata()` 가 없었다.
 */

vi.mock("server-only", () => ({}));

/** 관리자 설정. 시험마다 켜고 끈다. */
let 배지켬 = true;
vi.mock("../ai-badge-setting", () => ({
  isAiBadgeEnabled: async () => 배지켬,
}));

const { markAsAi } = await import("../watermark");
const { hasAiMetadata, AI_METADATA } = await import("../ai-metadata");
const { finishForAd } = await import("../ad/finish");

const 그림 = () =>
  sharp({ create: { width: 400, height: 400, channels: 3, background: "#6a8caf" } })
    .png()
    .toBuffer();

beforeEach(() => { 배지켬 = true; });

describe("파일 안 표시", () => {
  /** **이것이 핵심이다.** 끈 상태에서 표시가 사라지면 요건을 못 채운다. */
  it("**배지를 꺼도 표시가 남는다**", async () => {
    배지켬 = false;

    const 나온것 = await markAsAi(await 그림());

    expect(await hasAiMetadata(나온것), "배지를 끄니 파일에 표시가 하나도 없다").toBe(true);
  });

  it("**배지를 켜도 표시가 남는다**", async () => {
    배지켬 = true;

    const 나온것 = await markAsAi(await 그림());

    expect(await hasAiMetadata(나온것), "배지를 구우며 표시를 지웠다").toBe(true);
  });

  /**
   * 배지 합성이 메타데이터를 지우던 자리. `keepMetadata()` 가 없으면
   * 방금 적은 것이 그 단계에서 사라진다.
   */
  it("**배지를 구워도 적은 값이 그대로 읽힌다**", async () => {
    배지켬 = true;

    const exif = (await sharp(await markAsAi(await 그림())).metadata()).exif;
    expect(exif, "메타데이터가 통째로 사라졌다").toBeTruthy();

    const 적힌것 = exif!.toString("latin1");
    expect(적힌것).toContain(AI_METADATA.software);
    expect(적힌것).toContain(AI_METADATA.digitalSourceType);
  });

  /**
   * **배지 쪽이 어떻게 끝나든 표시는 남는다.**
   *
   * 배지를 굽다 실패하면 원본이 아니라 **표시를 찍은 것**을 돌려줘야 한다.
   * 작은 그림·납작한 그림은 배지가 들어갈 자리가 모자라 다른 길을 타는데,
   * 어느 길로 가든 이 성질은 같아야 한다.
   */
  it.each([[1, 1], [8, 8], [2000, 3], [3, 2000]])(
    "**%i×%i 그림에도 표시가 남는다**",
    async (w, h) => {
      배지켬 = true;
      const 작은것 = await sharp({ create: { width: w, height: h, channels: 3, background: "#888" } })
        .png().toBuffer();

      expect(await hasAiMetadata(await markAsAi(작은것)), "배지 쪽에서 표시를 잃었다").toBe(true);
    },
  );

  /** 배지는 설정대로 켜고 꺼져야 한다. 표시를 넣느라 배지가 늘 켜지면 안 된다. */
  it("**배지 자체는 설정을 따른다**", async () => {
    const 원본 = await 그림();

    배지켬 = false;
    const 끈것 = await sharp(await markAsAi(원본)).raw().toBuffer();
    배지켬 = true;
    const 켠것 = await sharp(await markAsAi(원본)).raw().toBuffer();

    expect(끈것.equals(await sharp(원본).raw().toBuffer()), "껐는데 픽셀이 바뀌었다").toBe(true);
    expect(켠것.equals(끈것), "켰는데 배지가 안 그려졌다").toBe(false);
  });
});

/**
 * **표시를 찍은 뒤에도 그림은 여러 번 더 구워진다.** 저장 인코더가 무손실
 * WebP 로 바꾸고, 목록용 썸네일을 따로 굽고, 내보낼 때 PNG 로 되돌린다.
 * sharp 는 **기본으로 메타데이터를 안 옮기므로**, 그 세 자리 중 한 곳만
 * `keepMetadata()` 를 놓쳐도 사용자가 받는 파일에는 표시가 없다.
 *
 * ── 왜 글자를 찾지 않나 ────────────────────────────────────
 *
 * 처음엔 소스에서 `keepMetadata()` 를 찾는 시험을 썼다. **그것이 틀렸다** —
 * `image-encoding.ts` 안에 그 호출이 세 자리라, 한 자리를 지워도 나머지 둘이
 * 시험을 통과시킨다(2026-09-29 변이 시험이 잡았다). 자리를 세는 것으로 바꿔도
 * 자리 수만 맞추면 통과한다. 그래서 **실제로 구워서 읽는다.**
 */
describe("저장 경로를 지나도 남는다", () => {
  /** 결이 있어야 무손실 WebP 가 PNG 보다 작아져서 인코더가 실제로 형식을 바꾼다. */
  const 결있는그림 = async (w = 96, h = 96) => {
    const 화소 = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const at = (y * w + x) * 3;
        화소[at] = (x * 7 + y * 3) % 256;
        화소[at + 1] = (x * x + y) % 256;
        화소[at + 2] = (x + y * 11) % 256;
      }
    }
    return sharp(화소, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  };

  it("**저장 인코더가 무손실 WebP 로 바꿔도 남는다**", async () => {
    const 찍은것 = await markAsAi(await 결있는그림());

    const 저장한것 = await encodeForStorage(찍은것, "image/png");

    // 형식을 실제로 바꾼 경로여야 이 시험이 뜻이 있다.
    expect(저장한것.converted, "인코더가 손을 안 댔다 — 이 시험이 아무것도 안 재고 있다").toBe(true);
    expect(await hasAiMetadata(저장한것.bytes), "저장하며 표시가 사라졌다").toBe(true);
  });

  it("**썸네일에도 남는다**", async () => {
    const 썸네일 = await makeThumbnail(await markAsAi(await 결있는그림(600, 600)));

    expect(썸네일, "썸네일을 못 만들었다").not.toBeNull();
    expect(await hasAiMetadata(썸네일!), "썸네일을 구우며 표시가 사라졌다").toBe(true);
  });

  it("**내보낼 때 PNG 로 되돌려도 남는다**", async () => {
    const 저장한것 = await encodeForStorage(await markAsAi(await 결있는그림()), "image/png");

    const 내보낸것 = await toPng(저장한것.bytes);

    expect((await sharp(내보낸것).metadata()).format).toBe("png");
    expect(await hasAiMetadata(내보낸것), "되돌리며 표시가 사라졌다").toBe(true);
  });
});

/**
 * **진짜 `markAsAi` 가 진짜 `checkAgainstSpec` 을 만나는 유일한 자리다.**
 *
 * 표시를 넣기 시작한 날 **배지를 켠 광고 내보내기가 전부 규격 실패로 떨어졌다.**
 * `check.ts` 가 「EXIF 가 있으면 규격 위반」으로 보고 있었기 때문이다.
 *
 * **5152개 시험이 전부 초록인 채로 그랬다.** 광고 시험은 모두 가짜 `finish` 를
 * 넣고(`ad-batch.test.ts`), 내보내기 라우트 시험은 `exportBatch` 를 통째로
 * 대신하므로, 둘이 실제로 만나는 자리가 저장소에 없었다(2026-09-29 독립 검토가
 * 찾았다). 그 자리를 여기 만든다.
 */
describe("광고 규격 검사와 만나는 자리", () => {
  /**
   * 규격을 실제로 만족하는 그림. `kakao-bizboard` 는 `png-alpha` 라 **완전히
   * 투명한 화소가 하나라도 있어야** 한다 — 불투명하게 만들면 이 시험이 AI 표시가
   * 아니라 투명도 때문에 떨어진다.
   */
  const 광고그림 = async (spec: AdSpec) => {
    const { width, height } = spec.target;
    const 화소 = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      화소[i * 4] = (i * 7) % 256;
      화소[i * 4 + 1] = (i * 13) % 256;
      화소[i * 4 + 2] = (i * 3) % 256;
      화소[i * 4 + 3] = i % 97 === 0 ? 0 : 255;
    }
    return sharp(화소, { raw: { width, height, channels: 4 } }).png().toBuffer();
  };

  const 비즈보드 = AD_SPECS.find((s) => s.id === "kakao-bizboard")!;

  it.each([true, false])("**배지가 %s 일 때 규격을 통과한다**", async (켬) => {
    배지켬 = 켬;

    const 결과 = await checkAgainstSpec(await markAsAi(await 광고그림(비즈보드)), 비즈보드);

    expect(결과.failures, "AI 표시 때문에 규격이 떨어졌다").toEqual([]);
    expect(결과.ok).toBe(true);
  });

  /** 규격을 통과하면서 표시도 들어 있어야 한다. 통과만 보면 표시를 뺀 것도 통과다. */
  it("**규격을 통과한 그림에 표시가 들어 있다**", async () => {
    배지켬 = false;

    const 나온것 = await markAsAi(await 광고그림(비즈보드));

    expect((await checkAgainstSpec(나온것, 비즈보드)).ok).toBe(true);
    expect(await hasAiMetadata(나온것), "규격은 통과했는데 표시가 없다").toBe(true);
  });

  /**
   * **배지를 꺼도 광고 소재에 표시가 들어간다.**
   *
   * 예전에는 배지가 꺼져 있으면 `finish` 를 아예 안 넘겨서, 광고 소재가 표시
   * 하나 없이 ZIP 으로 나갔다 — 사용자가 그것을 네이버·카카오에 올린다
   * (2026-09-29 독립 검토가 찾았다).
   */
  it.each([true, false])("**배지가 %s 여도 광고 마무리가 표시를 넣는다**", async (켬) => {
    const 파생본 = await 광고그림(비즈보드);

    const 나온것 = await finishForAd(켬)(파생본);

    expect(await hasAiMetadata(나온것), "광고 소재가 표시 없이 나간다").toBe(true);
    expect((await checkAgainstSpec(나온것, 비즈보드)).failures, "규격이 떨어졌다").toEqual([]);
  });

  /** 배지 자체는 설정을 따라야 한다. 표시를 넣느라 배지가 늘 켜지면 안 된다. */
  it("**광고 마무리에서도 배지는 설정을 따른다**", async () => {
    const 파생본 = await 광고그림(비즈보드);

    const [끈것, 켠것] = await Promise.all([
      finishForAd(false)(파생본).then((b) => sharp(b).raw().toBuffer()),
      finishForAd(true)(파생본).then((b) => sharp(b).raw().toBuffer()),
    ]);

    expect(끈것.equals(await sharp(파생본).raw().toBuffer()), "껐는데 화소가 바뀌었다").toBe(true);
    expect(켠것.equals(끈것), "켰는데 배지가 안 그려졌다").toBe(false);
  });

  /** **남의 메타데이터는 여전히 걸러야 한다.** 예외가 검사를 통째로 열어 버리면 안 된다. */
  it("**우리 표시가 아닌 메타데이터는 여전히 걸린다**", async () => {
    const 남의것 = await sharp(await 광고그림(비즈보드))
      .withExif({ IFD0: { Software: "Someone Else" } })
      .png()
      .toBuffer();

    const 결과 = await checkAgainstSpec(남의것, 비즈보드);

    expect(결과.failures, "남의 EXIF 를 그냥 통과시켰다").toContain(
      "메타데이터가 남아 있습니다 (ICC 또는 EXIF)",
    );
  });
});
