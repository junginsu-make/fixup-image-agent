import { describe, expect, it, vi } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { exportBatch } from "../ad/batch";

/**
 * 조립 갈래가 뽑기에 이어지는가.
 *
 * 설계: `docs/superpowers/plans/2026-09-07-ad-assembly-engine.md` 4-d
 *
 * **`batch.ts` 가 fal 을 직접 부르면 안 된다.** 이 모듈은 규격마다 도는
 * 순수한 루프이고, 배경 제거는 네트워크다. 주입으로 받아 시험이 갈아 끼운다 —
 * `finish`(AI 배지)가 이미 같은 방식이다.
 */

const master = await sharp({
  create: { width: 2048, height: 1072, channels: 3, background: { r: 40, g: 90, b: 60 } },
}).png().toBuffer();

/** 배경 제거가 돌려줄 만한 것 — 가운데만 남고 둘레는 투명하다. */
async function cutout() {
  const object = await sharp({
    create: { width: 600, height: 600, channels: 4, background: { r: 200, g: 80, b: 40, alpha: 1 } },
  }).png().toBuffer();
  return sharp({
    create: { width: 2048, height: 1072, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: object, left: 700, top: 200 }]).png().toBuffer();
}

describe("조립 규격 뽑기", () => {
  it("투명 배너가 나온다", async () => {
    const cut = await cutout();
    const [entry] = await exportBatch(master, ["kakao-bizboard"], { cutout: async () => cut });
    expect(entry!.status).toBe("ok");
    const meta = await sharp(entry!.bytes!).metadata();
    expect(meta.width).toBe(1029);
    expect(meta.height).toBe(258);
    const stats = await sharp(entry!.bytes!).stats();
    expect(stats.channels[3]!.min, "진짜 투명해야 한다").toBe(0);
  });

  /**
   * **마스터당 한 번이다.** 두 규격이 같은 마스터를 쓰면 배경 제거를 한 번만
   * 부른다 — 3.7초 × 규격 수만큼 사용자가 기다린다(설계 §8).
   */
  it("배경 제거를 마스터당 한 번만 부른다", async () => {
    const cut = await cutout();
    const cutout_ = vi.fn(async () => cut);
    await exportBatch(master, ["kakao-bizboard", "naver-smartchannel"], { cutout: cutout_ });
    expect(cutout_).toHaveBeenCalledTimes(1);
  });

  /**
   * **조립이 실패해도 다른 규격은 나온다**(설계 §9.3). 실패 지점이 생성 **뒤**로
   * 옮겨가므로, 하나 때문에 전부 못 받으면 이미 쓴 돈이 통째로 버려진다.
   */
  it("조립이 실패해도 나머지는 나온다", async () => {
    // 2048×1072 마스터가 실제로 만들 수 있는 규격을 짝으로 쓴다 —
    // 1200×1200 은 세로가 모자라 확대가 걸린다(그건 조립과 무관한 실패다).
    const entries = await exportBatch(master, ["kakao-bizboard", "google-rda-landscape"], {
      cutout: async () => { throw new Error("배경을 지우지 못했습니다."); },
    });
    const byId = Object.fromEntries(entries.map((entry) => [entry.specId, entry]));
    expect(byId["kakao-bizboard"]!.status).toBe("failed");
    expect(byId["kakao-bizboard"]!.reason).toMatch(/배경/);
    expect(byId["google-rda-landscape"]!.status, "다른 규격은 멀쩡해야 한다").toBe("ok");
  });

  /** 배경 제거를 안 넘기면 조립 규격만 실패한다 — 조용히 빈 배너를 만들지 않는다. */
  it("배경 제거 없이 부르면 조립 규격이 실패한다", async () => {
    const [entry] = await exportBatch(master, ["kakao-bizboard"], {});
    expect(entry!.status).toBe("failed");
    expect(entry!.bytes).toBeUndefined();
  });

  /** 조립을 안 타는 규격은 배경 제거를 안 부른다. */
  it("조립이 아닌 규격은 배경 제거를 안 부른다", async () => {
    const cutout_ = vi.fn(async () => await cutout());
    await exportBatch(master, ["google-rda-landscape"], { cutout: cutout_ });
    expect(cutout_).not.toHaveBeenCalled();
  });
});

describe("너무 작아진 오브젝트를 알린다", () => {
  /**
   * **이것이 없으면 「빈 배너에 점 하나」가 「검증 통과」로 나간다.**
   *
   * 9:16 마스터의 전신 피사체를 비즈보드(3.99:1)에 놓으면 폭 6% 다 — 1029px
   * 배너에 62px 짜리 조각 하나가 오른쪽 끝에 붙는다. 그런데 픽셀·형식·알파·
   * 용량이 전부 맞아 `checkAgainstSpec` 을 **통과한다.**
   *
   * 파생 갈래에는 대응물이 있다 — `export.ts:75` 가 **받은 바이트**로 확대
   * 금지를 다시 검사한다. 조립 갈래에는 그 자리가 비어 있었다.
   *
   * **막지 않고 알린다**(설계 §5.4②). 늘이면 찌그러지고 자르면 얼굴이 잘린다 —
   * 사람이 보고 다른 마스터를 고르는 편이 낫다.
   */
  async function tallObject() {
    // 세로로 아주 긴 피사체 — 사람 전신·병·튜브형 제품이 이 모양이다
    const subject = await sharp({
      create: { width: 520, height: 1960, channels: 4, background: { r: 200, g: 80, b: 40, alpha: 1 } },
    }).png().toBuffer();
    return sharp({
      create: { width: 1152, height: 2048, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: subject, left: 316, top: 40 }]).png().toBuffer();
  }

  it("폭이 15% 미만이면 알린다 — 그래도 뽑기는 한다", async () => {
    const object = await tallObject();
    const [entry] = await exportBatch(master, ["kakao-bizboard"], { cutout: async () => object });
    expect(entry!.status, "막지 않는다 — 사람이 보고 판단한다").toBe("ok");
    expect(entry!.tooSmall, "그런데 알려야 한다").toBe(true);
  });

  it("넉넉한 오브젝트에는 안 붙인다", async () => {
    const cut = await cutout();
    const [entry] = await exportBatch(master, ["kakao-bizboard"], { cutout: async () => cut });
    expect(entry!.status).toBe("ok");
    expect(entry!.tooSmall).toBeUndefined();
  });

  /** 조립이 아닌 규격에는 붙일 일이 없다. */
  it("파생 규격에는 안 붙인다", async () => {
    const [entry] = await exportBatch(master, ["google-rda-landscape"], {});
    expect(entry!.tooSmall).toBeUndefined();
  });
});

describe("조립 갈래의 마무리", () => {
  /**
   * **AI 표기는 격리 계약 7 이다.** 파생 갈래는 `ad-batch.test.ts` 가 잠그는데,
   * 조립 갈래는 자기 `finish` 호출을 따로 갖고 있어 그 줄이 안 잠겨 있었다 —
   * 지워도 저장소 전체 시험이 초록이었다.
   */
  it("AI 표기를 태운다", async () => {
    const cut = await cutout();
    const finish = vi.fn(async (bytes: Buffer) => bytes);
    await exportBatch(master, ["kakao-bizboard"], { cutout: async () => cut, finish });
    expect(finish).toHaveBeenCalledTimes(1);
  });

  /** **검증보다 먼저 태운다** — 배지가 용량을 키우므로 순서가 바뀌면 통과가 거짓말이 된다. */
  it("표기를 태운 바이트로 검증한다", async () => {
    const cut = await cutout();
    // 상한을 넘기는 바이트를 돌려주면 검증이 실패해야 한다
    const fat = Buffer.alloc(400_000, 1);
    const [entry] = await exportBatch(master, ["kakao-bizboard"], {
      cutout: async () => cut,
      finish: async () => fat,
    });
    expect(entry!.status, "태운 뒤 바이트로 검사해야 한다").toBe("failed");
  });

  /**
   * **규격을 어기면 실패로 떨어진다.** `checkAgainstSpec` 을 `{ok:true}` 상수로
   * 바꿔도 시험이 초록이었다 — 조립 결과가 무조건 ok 가 되는 뮤테이션이다.
   */
  it("규격을 어긴 조립 결과는 실패다", async () => {
    const cut = await cutout();
    // 픽셀이 다른 것을 돌려주면 규격 검증이 잡아야 한다
    const wrong = await sharp({
      create: { width: 500, height: 500, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const [entry] = await exportBatch(master, ["kakao-bizboard"], {
      cutout: async () => cut,
      finish: async () => wrong,
    });
    expect(entry!.status).toBe("failed");
    expect(entry!.failures.length).toBeGreaterThan(0);
  });
});
