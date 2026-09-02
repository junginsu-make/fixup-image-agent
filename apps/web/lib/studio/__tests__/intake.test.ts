import { describe, expect, it } from "vitest";
import { characterSuggestion, isReady, missingSlots, type Intake } from "../intake";

const full: Intake = {
  tool: "sns",
  topic: "수분 세럼 신제품 출시",
  sourceKind: "text",
  sourceRef: "히알루론산 2%, 나이아신아마이드 2% 함유. 건성 피부용.",
  cardCount: 6,
  attachmentsDecided: true,
};

describe("무엇을 만들지부터 묻는다", () => {
  it("아무것도 모르면 도구를 먼저 묻는다", () => {
    // 카드뉴스인지 포스터인지 모르면 나머지를 물어도 소용이 없다.
    const missing = missingSlots({});
    expect(missing[0]?.id).toBe("tool");
  });

  it("도구를 정하기 전에는 다른 것을 묻지 않는다", () => {
    expect(missingSlots({})).toHaveLength(1);
  });
});

describe("카드뉴스에 필요한 것", () => {
  it("주제와 내용이 없으면 만들 수 없다", () => {
    const ids = missingSlots({ tool: "sns" }).map((slot) => slot.id);
    expect(ids).toContain("topic");
    expect(ids).toContain("source");
  });

  it("유튜브를 고르고 주소를 안 주면 주소를 묻는다", () => {
    const ids = missingSlots({ ...full, sourceKind: "youtube", sourceRef: undefined }).map((s) => s.id);
    expect(ids).toContain("source");
  });

  it("장수를 안 정하면 묻는다", () => {
    const ids = missingSlots({ ...full, cardCount: undefined }).map((slot) => slot.id);
    expect(ids).toContain("cardCount");
  });

  it("첨부할지 안 할지 답하지 않으면 묻는다", () => {
    // 안 물어보면 레퍼런스 없이 만들어 놓고 "내가 올린 디자인은?" 이 된다.
    const ids = missingSlots({ ...full, attachmentsDecided: false }).map((slot) => slot.id);
    expect(ids).toContain("attachments");
  });

  it("다 모이면 더 묻지 않는다", () => {
    expect(missingSlots(full)).toEqual([]);
    expect(isReady(full)).toBe(true);
  });

  it("첨부 안 하겠다고 답한 것도 답한 것이다", () => {
    expect(isReady({ ...full, attachmentsDecided: true, attachments: [] })).toBe(true);
  });
});

describe("포스터에 필요한 것", () => {
  const poster: Intake = {
    tool: "poster",
    topic: "가을 필름 사진전",
    sourceKind: "text",
    sourceRef: "10월 한 달, 성수동 골목 전시",
    attachmentsDecided: true,
    attachments: [{ id: "a", title: "전시 포스터", role: "style" }],
  };

  it("따라 만들 그림이 없으면 만들 수 없다", () => {
    // 포스터는 레퍼런스가 최소 한 장이어야 한다(PosterProjectInputSchema).
    const ids = missingSlots({ ...poster, attachments: [] }).map((slot) => slot.id);
    expect(ids).toContain("reference");
  });

  it("지키기용만 있고 따라 만들 것이 없어도 막는다", () => {
    const only = { ...poster, attachments: [{ id: "p", title: "제품", role: "preserve_product" as const }] };
    expect(missingSlots(only).map((slot) => slot.id)).toContain("reference");
  });

  it("포스터는 장수를 묻지 않는다", () => {
    // 포스터는 한 장짜리다. 물으면 사용자가 헷갈린다.
    const ids = missingSlots({ ...poster, cardCount: undefined }).map((slot) => slot.id);
    expect(ids).not.toContain("cardCount");
  });

  it("레퍼런스가 한 장이라도 있으면 시작할 수 있다", () => {
    expect(isReady(poster)).toBe(true);
  });
});

describe("첨부한 그림은 무엇으로 쓸지 물어야 한다", () => {
  const base: Intake = { ...full, attachments: [{ id: "x", title: "serum.jpg" }] };

  it("역할이 안 정해진 그림이 있으면 그걸 묻는다", () => {
    // 안 물으면 말없이 '따라 만들기'가 된다. 제품 사진을 넣어도 그렇다.
    // 그러면 제품이 지켜지는 대신 다시 그려진다 — 사용자가 원한 것과 정반대다.
    const missing = missingSlots(base);
    expect(missing.map((slot) => slot.id)).toContain("attachmentRole");
  });

  it("무엇을 묻는지 그림 이름이 들어간다", () => {
    const slot = missingSlots(base).find((entry) => entry.id === "attachmentRole");
    expect(slot?.label).toContain("serum.jpg");
  });

  it("역할이 다 정해지면 넘어간다", () => {
    expect(isReady({ ...base, attachments: [{ id: "x", title: "serum.jpg", role: "preserve_product" }] })).toBe(true);
  });

  it("여러 장이면 아직 안 정한 것만 묻는다", () => {
    const many: Intake = {
      ...full,
      attachments: [
        { id: "a", title: "ref.png", role: "style" },
        { id: "b", title: "serum.jpg" },
      ],
    };
    const slot = missingSlots(many).find((entry) => entry.id === "attachmentRole");
    expect(slot?.label).toContain("serum.jpg");
    expect(slot?.label).not.toContain("ref.png");
  });

  it("첨부를 안 하겠다고 하면 물을 것이 없다", () => {
    expect(isReady({ ...full, attachments: [] })).toBe(true);
  });
});

describe("물어볼 것에는 이유가 붙는다", () => {
  it("왜 필요한지 함께 준다", () => {
    // LLM 이 이 이유를 읽고 문장을 만든다. 이유가 없으면 취조하듯 묻는다.
    for (const slot of missingSlots({ tool: "sns" })) {
      expect(slot.label.length).toBeGreaterThan(0);
      expect(slot.why.length).toBeGreaterThan(0);
    }
  });
});

describe("캐릭터가 필요하다고 하면 만드는 곳으로 보낸다", () => {
  it("인물이 필요한데 가진 사진이 없으면 캐릭터 도구를 권한다", () => {
    const suggestion = characterSuggestion({ ...full, needsPerson: true, hasPersonImage: false });
    expect(suggestion?.href).toBe("/characters");
  });

  it("이미 인물 사진이 있으면 권하지 않는다", () => {
    expect(characterSuggestion({ ...full, needsPerson: true, hasPersonImage: true })).toBeNull();
  });

  it("인물이 필요 없으면 권하지 않는다", () => {
    expect(characterSuggestion(full)).toBeNull();
  });
});
