import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../../lib/membership/server", () => ({ requireActiveMember: vi.fn() }));
vi.mock("../../../lib/easy/store", () => ({ easyStoreForUser: vi.fn() }));
vi.mock("../../../lib/poster/stores", () => ({ posterStoresForUser: vi.fn() }));
vi.mock("../../../lib/easy/cardnews-steps", () => ({ cardnewsProject: vi.fn() }));
vi.mock("../../../lib/easy/pending-requests", () => ({ posterRequestsFinished: vi.fn() }));

import { easyImageModels, defaultEasyImageModel } from "../_components/load";

/**
 * 쉽게 모드 모델 목록은 **보이는 셋**이고 이름은 **한국어**다.
 * 예전에는 모델 표 전체를 id 그대로 냈다(「gpt-image-2.5-flare」).
 */
describe("쉽게 모드 모델 목록", () => {
  it("보이는 셋만, 한국어 이름으로 낸다", () => {
    expect(easyImageModels().map((m) => m.label)).toEqual(["표준형", "디테일형", "속도형"]);
  });

  it("기본 모델은 목록 안에 있다", () => {
    expect(easyImageModels().map((m) => m.id)).toContain(defaultEasyImageModel());
  });
});

describe("쉽게 모드 모델 고르기 배선", () => {
  const bar = readFileSync(new URL("../_components/model-bar.tsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../_components/cardnews-card.tsx", import.meta.url), "utf8");

  it("모델 줄은 ImageModelPicker 를 쓴다", () => {
    expect(bar).toContain("<ImageModelPicker");
    expect(bar).toContain("imageModelName(");
  });

  it("카드뉴스 카드의 모델은 ImageModelPicker 다", () => {
    expect(card).toContain("<ImageModelPicker");
    expect(card).not.toContain("IMAGE_MODELS.map");
  });
});
