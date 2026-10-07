import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenedCharacter } from "../use-opened-character";
import type { OpenedCharacter, OpenedFront, OpenedValues } from "../opened-character";

const KINDS = [{ id: "person" }, { id: "character" }];
const LOOKS = ["photoreal", "3d"] as const;
const 호롱이: OpenedCharacter = {
  id: "orig", name: "호롱이", sourcePrompt: "주황 호랑이", kind: "character", look: "3d",
  views: [{ angle: "front", url: "https://x/front.png" }],
};

const prefill = vi.fn<(values: OpenedValues, front: OpenedFront | null) => void>();
const onCarried = vi.fn<(id: string) => Promise<void>>(async () => {});
const announce = vi.fn<(text: string) => void>();
const rename = vi.fn<(name: string) => void>();
const fetchMock = vi.fn();
let state: ReturnType<typeof useOpenedCharacter>;
let view: ReactTestRenderer;

interface ProbeProps {
  chosenBase64: string | null;
  createdId: string | null;
  /** 같은 일을 하는 새 함수를 넘기면 효과가 다시 돈다. 한 번만 하는지 재려는 것이다. */
  announceVia?: (text: string) => void;
  /** 이미 있는 캐릭터 이름. `null` 은 목록을 아직 못 받은 것이다. 안 주면 빈 목록이다. */
  takenNames?: readonly string[] | null;
  /** 스튜디오 이름 칸의 지금 값. 안 주면 빈 칸이다. */
  currentName?: string;
  /** 방금 만들어진 캐릭터의 이름. 안 주면 모른다. */
  createdName?: string | null;
}

function Probe({ chosenBase64, createdId, announceVia, takenNames, currentName, createdName }: ProbeProps) {
  state = useOpenedCharacter({
    opened: 호롱이, kinds: KINDS, looks: LOOKS, prefill, onCarried,
    announce: announceVia ?? announce, chosenBase64, createdId,
    currentName: currentName ?? "", createdName: createdName ?? null, rename,
    // 안 주면 매 그림마다 **새 빈 배열**이다 — 스튜디오가 매번 새로 만드는 것과 같다.
    takenNames: takenNames === undefined ? [] : takenNames,
  });
  return null;
}

async function 연다(front: Response | Error, takenNames?: readonly string[] | null) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "https://x/front.png") {
      if (front instanceof Error) throw front;
      return front;
    }
    return new Response(JSON.stringify({ ok: true, carried: ["back"], failed: [] }));
  });
  await act(async () => {
    view = create(<Probe chosenBase64={null} createdId={null} takenNames={takenNames} />);
  });
}

async function 다시(props: ProbeProps) {
  await act(async () => { view.update(<Probe {...props} />); });
}

/** 가져오기 → 본문 읽기 사슬이 끝날 때까지 기다린다. */
async function 비운다() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

const carryCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/carry"));

beforeEach(() => {
  prefill.mockReset(); onCarried.mockClear(); announce.mockReset(); rename.mockReset(); fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { act(() => view.unmount()); vi.unstubAllGlobals(); });

describe("연 캐릭터로 도구를 채운다", () => {
  it("값과 정면을 채운다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 비운다();
    expect(prefill).toHaveBeenCalledWith(
      { name: "호롱이 (수정본)", description: "주황 호랑이", kind: "character", look: "3d", modelId: "" },
      { base64: "AQID", mimeType: "image/png" },
    );
    expect(state.front).toBe("loaded");
  });

  it("**정면을 못 받으면 설정만 채운다**", async () => {
    await 연다(new Error("expired"));
    await 비운다();
    expect(prefill).toHaveBeenCalledWith(expect.objectContaining({ name: "호롱이 (수정본)" }), null);
    expect(state.front).toBe("missing");
  });
});

describe("이름 목록을 기다린다", () => {
  const 정면 = () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));

  it("**목록을 받기 전에는 채우지 않는다** — 이름이 겹칠 수 있다", async () => {
    await 연다(정면(), null);
    await 비운다();
    expect(prefill).not.toHaveBeenCalled();
    expect(state.front).toBe("loading");
  });

  it("목록을 받으면 그 이름과 겹치지 않게 한 번만 채운다", async () => {
    await 연다(정면(), null);
    await 비운다();
    await 다시({ chosenBase64: null, createdId: null, takenNames: ["호롱이 (수정본)"] });
    await 비운다();

    expect(prefill).toHaveBeenCalledTimes(1);
    expect(prefill).toHaveBeenCalledWith(
      { name: "호롱이 (수정본 2)", description: "주황 호랑이", kind: "character", look: "3d", modelId: "" },
      { base64: "AQID", mimeType: "image/png" },
    );
    expect(state.front).toBe("loaded");
  });

  it("**목록이 새 배열로 바뀌어도** 다시 채우지 않는다 — 고친 칸을 덮어쓴다", async () => {
    await 연다(정면(), ["호롱이 (수정본)"]);
    await 비운다();
    await 다시({ chosenBase64: null, createdId: null, takenNames: ["호롱이 (수정본)"] });
    await 비운다();
    await 다시({ chosenBase64: null, createdId: null, takenNames: ["호롱이 (수정본)", "다른 캐릭터"] });
    await 비운다();
    // 목록이 잠깐 없어졌다 돌아와도(효과가 다시 도는 자리) 한 번 채운 칸은 그대로다.
    await 다시({ chosenBase64: null, createdId: null, takenNames: null });
    await 비운다();
    await 다시({ chosenBase64: null, createdId: null, takenNames: ["호롱이 (수정본)", "다른 캐릭터"] });
    await 비운다();

    expect(prefill).toHaveBeenCalledTimes(1);
  });

  it("정면을 못 받아도 목록을 기다린 뒤 설정만 채운다", async () => {
    await 연다(new Error("expired"), null);
    await 비운다();
    expect(prefill).not.toHaveBeenCalled();
    await 다시({ chosenBase64: null, createdId: null, takenNames: [] });
    await 비운다();
    expect(prefill).toHaveBeenCalledTimes(1);
    expect(prefill).toHaveBeenCalledWith(expect.objectContaining({ name: "호롱이 (수정본)" }), null);
  });
});

describe("옮겨 담기", () => {
  it("원래 정면으로 만든 새 캐릭터에 한 번만 옮겨 담는다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 비운다();
    await 다시({ chosenBase64: "AQID", createdId: null });
    await 다시({ chosenBase64: null, createdId: "new1" });
    await 비운다();
    await 다시({ chosenBase64: null, createdId: "new1" });
    await 비운다();
    await 다시({ chosenBase64: null, createdId: "new1", announceVia: (text) => announce(text) });
    await 비운다();

    expect(carryCalls()).toHaveLength(1);
    expect(carryCalls()[0]![0]).toBe("/api/characters/new1/carry");
    expect(JSON.parse(String(carryCalls()[0]![1].body))).toEqual({ fromId: "orig" });
    expect(onCarried).toHaveBeenCalledWith("new1");
    expect(announce).toHaveBeenCalledWith("원래 캐릭터에서 각도 1장을 옮겨 담았습니다.");
  });

  it("**정면을 바꿨으면 안 옮긴다** — 다른 인물이다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 비운다();
    await 다시({ chosenBase64: "AQID", createdId: null });
    await 다시({ chosenBase64: "ZZZZ", createdId: null });
    await 다시({ chosenBase64: null, createdId: "new2" });
    await 비운다();
    expect(carryCalls()).toHaveLength(0);
  });

  it("원본 자신은 옮겨 담기 대상이 아니다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 비운다();
    await 다시({ chosenBase64: "AQID", createdId: "orig" });
    await 비운다();
    expect(carryCalls()).toHaveLength(0);
  });

  it("옮겨 담기가 실패하면 그렇다고 알린다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 비운다();
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ ok: false, message: "각도를 옮겨 담지 못했습니다." }), { status: 500 }));
    await 다시({ chosenBase64: "AQID", createdId: null });
    await 다시({ chosenBase64: null, createdId: "new3" });
    await 비운다();
    expect(announce).toHaveBeenCalledWith("각도를 옮겨 담지 못했습니다.");
    expect(onCarried).not.toHaveBeenCalled();
  });

  it("일부만 옮겼거나 라이브러리에 못 넣었으면 둘 다 알린다", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 비운다();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      ok: true, carried: ["back"], failed: ["left_45"],
      referenceIssue: "옮겨 담은 각도를 라이브러리에 넣지 못했습니다.",
    })));
    await 다시({ chosenBase64: "AQID", createdId: null });
    await 다시({ chosenBase64: null, createdId: "new4" });
    await 비운다();
    expect(onCarried).toHaveBeenCalledWith("new4");
    expect(announce).toHaveBeenCalledWith(
      "원래 캐릭터에서 각도 1장을 옮겨 담았고, 1장은 옮기지 못했습니다. 「내 캐릭터」에서 다시 만드세요.",
    );
    expect(announce).toHaveBeenCalledWith("옮겨 담은 각도를 라이브러리에 넣지 못했습니다.");
  });

  it("**연결이 끊겨도 내부 오류 문구를 그대로 내보이지 않는다**", async () => {
    await 연다(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await 비운다();
    fetchMock.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
    await 다시({ chosenBase64: "AQID", createdId: null });
    await 다시({ chosenBase64: null, createdId: "new5" });
    await 비운다();
    expect(announce).toHaveBeenCalledWith("원래 캐릭터의 각도를 옮겨 담지 못했습니다.");
    expect(announce).not.toHaveBeenCalledWith("Failed to fetch");
    expect(onCarried).not.toHaveBeenCalled();
  });
});

describe("저장한 뒤 이름 칸", () => {
  const 정면 = () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
  const 만든 = "호롱이 (수정본)";
  const 목록 = ["호롱이", 만든];

  async function 저장한다(props: Partial<ProbeProps> & { createdId: string }) {
    await 다시({ chosenBase64: "AQID", createdId: null, takenNames: 목록 });
    await 다시({ chosenBase64: null, takenNames: 목록, ...props });
    await 비운다();
  }

  it("**칸이 방금 만든 이름 그대로면** 다음 이름으로 바꾼다 — 옮겨 담기 여부와 상관없이", async () => {
    await 연다(정면());
    await 비운다();
    await 저장한다({ createdId: "new1", currentName: 만든, createdName: 만든 });

    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith("호롱이 (수정본 2)");
    expect(carryCalls()).toHaveLength(1);
  });

  it("**사용자가 이름을 직접 정해 저장했으면** 그 이름에서 이어 간다 — 원본 이름이 아니라", async () => {
    await 연다(정면());
    await 비운다();
    await 저장한다({ createdId: "new8", currentName: "새이름", createdName: "새이름", takenNames: [...목록, "새이름"] });

    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith("새이름 (수정본)");
  });

  it("**정면을 다시 뽑아 옮겨 담지 않아도** 바꾼다", async () => {
    await 연다(정면());
    await 비운다();
    await 다시({ chosenBase64: "AQID", createdId: null, takenNames: 목록 });
    await 다시({ chosenBase64: "ZZZZ", createdId: null, takenNames: 목록 });
    await 다시({ chosenBase64: null, createdId: "new2", takenNames: 목록, currentName: 만든, createdName: 만든 });
    await 비운다();

    expect(carryCalls()).toHaveLength(0);
    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith("호롱이 (수정본 2)");
  });

  it("**사용자가 칸을 고쳤으면** 건드리지 않는다", async () => {
    await 연다(정면());
    await 비운다();
    await 저장한다({ createdId: "new3", currentName: "내 호랑이", createdName: 만든 });
    expect(rename).not.toHaveBeenCalled();
  });

  it("**같은 캐릭터로 다시 그려도** 두 번 바꾸지 않는다", async () => {
    await 연다(정면());
    await 비운다();
    await 저장한다({ createdId: "new4", currentName: 만든, createdName: 만든 });
    // 이름 칸이 바뀐 채 그림이 다시 그려지거나, 같은 일을 하는 새 함수가 들어와도.
    await 다시({
      chosenBase64: null, createdId: "new4", takenNames: 목록, currentName: 만든, createdName: 만든,
      announceVia: (text) => announce(text),
    });
    await 비운다();
    await 다시({ chosenBase64: null, createdId: "new4", takenNames: 목록, currentName: 만든, createdName: 만든 });
    await 비운다();

    expect(rename).toHaveBeenCalledTimes(1);
  });

  it("원본 자신이 결과로 오면 바꾸지 않는다", async () => {
    await 연다(정면());
    await 비운다();
    await 저장한다({ createdId: "orig", currentName: "호롱이", createdName: "호롱이" });
    expect(rename).not.toHaveBeenCalled();
  });

  it("방금 만든 캐릭터의 이름을 아직 모르면 바꾸지 않는다", async () => {
    await 연다(정면());
    await 비운다();
    await 저장한다({ createdId: "new5", currentName: 만든, createdName: null });
    expect(rename).not.toHaveBeenCalled();
  });

  it("**두 번 저장해도 이름이 매번 다르다** — 라이브러리 제목이 이름에 묶여 있다", async () => {
    await 연다(정면());
    await 비운다();
    await 저장한다({ createdId: "new6", currentName: 만든, createdName: 만든 });
    await 저장한다({
      createdId: "new7", currentName: "호롱이 (수정본 2)", createdName: "호롱이 (수정본 2)",
      takenNames: [...목록, "호롱이 (수정본 2)"],
    });

    expect(rename.mock.calls).toEqual([["호롱이 (수정본 2)"], ["호롱이 (수정본 3)"]]);
  });
});
