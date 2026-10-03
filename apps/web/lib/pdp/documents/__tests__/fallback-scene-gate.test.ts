import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {rejectIfUnverified} from "../../../evidence-gate";
import {createEmptySection} from "../../../../app/create/scenario-sections";
it("F12: 영어 장면이 없으면 실제로 쓰일 한국어 장면의 금지 주장을 거절한다",()=>{
  const section={...createEmptySection(0),prompt_en:"",prompt_ko:"식약처 인증 받은 국내 1위 제품"};
  expect(rejectIfUnverified([section])?.status).toBe(400);
});

/*
  W15: 거절 안내는 「장면 지시」로 고정되어 있었다. 그런데 영어 장면이 비면 실제 장면은 한국어 장면 ->
  제목 -> 섹션 이름 순으로 대체되므로(코어 sectionScenePrompt), 걸린 글이 제목에서 온 것인데도
  「장면 지시를 고치라」고 말했다. 사용자는 영어 장면 칸을 볼 수도 없다. 안내는 대체값을 가져온
  실제 칸을 가리켜야 하고, 그 이름은 **시나리오 화면에 적힌 이름 그대로**여야 사용자가 칸을 찾는다
  (한국어 장면 = 「이미지 방향」, 제목 = 「헤드라인」). 영어 장면은 화면에 칸이 없어 이전 이름을 그대로 쓴다.
  섹션 이름은 이름표도 편집 칸도 없어 사용자가 고칠 수 없다. 그래서 장면이 섹션 이름에서 왔을 때는
  「그 문구를 고치라」 대신 「이미지 방향을 적으라」(그 칸이 장면이 된다)고 안내한다.
*/
const 금지 = "식약처 인증 제품";
const 비움 = { prompt_en: "", prompt_ko: "", headline: "", section_name: "" };
/** 사용자가 그 칸을 직접 쓰고 확인까지 누른 상태(근거 없는 수치 검사에 먼저 걸리지 않게 해 금지 주장 검사만 남긴다). */
const 직접쓴제목 = (value: string) => [{ target: { slot: "headline" }, value, kind: "user" }];
const 거절문 = async (patch: Record<string, unknown>) => {
  const response = rejectIfUnverified([{ ...createEmptySection(0), ...patch } as never]);
  return response ? { status: response.status, body: await response.json() } : null;
};

describe("W15: 거절 안내가 대체값을 가져온 실제 칸을 가리킨다", () => {
  it.each([
    ["영어 장면이 비면", "이미지 방향", { ...비움, prompt_ko: 금지 }],
    ["영어 장면이 공백뿐이면", "이미지 방향", { ...비움, prompt_en: " \n ", prompt_ko: 금지 }],
    ["영어·한국어 장면이 비면", "헤드라인", { ...비움, headline: 금지, evidence: 직접쓴제목(금지) }],
  ])("%s %s 을(를) 가리킨다", async (_상황, 칸, patch) => {
    const result = await 거절문(patch);

    expect(result?.status).toBe(400);
    expect(result?.body.message).toContain(`${칸}에 사용할 수 없는 주장이 있습니다: 「식약처 인증」`);
    expect(result?.body.message).not.toContain("장면 지시");
  });

  it("대체값이 한국어 장면이면 안내에 섹션 이름과 화면의 칸 이름(이미지 방향)이 함께 나온다", async () => {
    const result = await 거절문({ ...비움, section_name: "첫 장면", prompt_ko: 금지 });

    expect(result?.body.message).toBe("첫 장면의 이미지 방향에 사용할 수 없는 주장이 있습니다: 「식약처 인증」. 그 문구를 고친 뒤 다시 만들어 주세요.");
  });

  describe("장면이 섹션 이름에서 왔을 때(화면에서 못 고치는 칸)", () => {
    const 섹션이름만 = { ...비움, section_name: 금지 };

    it("고치라는 말 대신 이미지 방향을 적으라고 안내한다", async () => {
      const result = await 거절문(섹션이름만);

      expect(result?.status).toBe(400);
      expect(result?.body).toEqual({
        ok: false,
        code: "INVALID_REQUEST",
        message: "섹션 「식약처 인증 제품」의 이미지 방향이 비어 있어 섹션 이름이 장면으로 쓰이는데, 그 이름에 사용할 수 없는 주장이 있습니다: 「식약처 인증」. 이미지 방향을 적은 뒤 다시 만들어 주세요.",
      });
    });

    it("사용자에게 보이는 말에 줄표를 안 쓰고, 고칠 수 없는 칸을 고치라고 하지 않는다", async () => {
      const message: string = (await 거절문(섹션이름만))?.body.message;

      expect(message).not.toContain("—");
      expect(message).not.toContain("그 문구를 고친");
      expect(message).not.toContain("장면 지시");
    });

    it("안내대로 이미지 방향을 적으면 통과한다", async () => {
      expect(await 거절문({ ...섹션이름만, prompt_ko: "밝은 주방" })).toBeNull();
    });

    it("이미지 방향을 적었는데 거기에 걸리면 이미지 방향을 고치라고 한다(섹션 이름 안내가 아니다)", async () => {
      const message: string = (await 거절문({ ...섹션이름만, prompt_ko: 금지 }))?.body.message;

      expect(message).toBe("식약처 인증 제품의 이미지 방향에 사용할 수 없는 주장이 있습니다: 「식약처 인증」. 그 문구를 고친 뒤 다시 만들어 주세요.");
    });
  });

  /** 안내에 쓰는 칸 이름이 시나리오 화면의 실제 이름표와 같은지를 화면 소스에서 직접 확인한다. 화면 이름이 바뀌면 여기서 걸린다. */
  it.each(["이미지 방향", "헤드라인"])("안내의 「%s」는 시나리오 화면에 실제로 있는 칸 이름이다", (칸) => {
    const 화면 = readFileSync(new URL("../../../../app/create/ScenarioEditor.tsx", import.meta.url), "utf8");

    expect(화면).toContain(`label="${칸}"`);
  });
});

/** 정상 입력(영어 장면이 있는 섹션)의 판정과 문구는 W15 전후로 같다 -- 한 글자도 바뀌면 안 된다. */
describe("W15: 영어 장면이 있는 정상 입력은 판정도 문구도 그대로다", () => {
  const 정상 = { prompt_en: "식약처 인증 받은 제품" };

  it("영어 장면에 걸리면 이전과 같은 문구(장면 지시)다", async () => {
    expect(await 거절문(정상)).toEqual({
      status: 400,
      body: { ok: false, code: "INVALID_REQUEST", message: "섹션 1의 장면 지시에 사용할 수 없는 주장이 있습니다: 「식약처 인증」. 그 문구를 고친 뒤 다시 만들어 주세요." },
    });
  });

  it("섹션 이름이 없으면 칸 이름만 말한다(이전과 같다)", async () => {
    expect((await 거절문({ ...정상, section_name: "" }))?.body.message)
      .toBe("장면 지시에 사용할 수 없는 주장이 있습니다: 「식약처 인증」. 그 문구를 고친 뒤 다시 만들어 주세요.");
  });

  it("영어 장면이 있으면 같은 섹션의 제목에 걸려도 장면 지시가 아니라 제목을 말한다(이전과 같다)", async () => {
    const result = await 거절문({ prompt_en: "bright kitchen", headline: 금지, evidence: 직접쓴제목(금지) });

    expect(result?.body.message).toBe("섹션 1의 제목에 사용할 수 없는 주장이 있습니다: 「식약처 인증」. 그 문구를 고친 뒤 다시 만들어 주세요.");
  });

  it("영어 장면이 있으면 한국어 장면은 안 본다(이전과 같다)", async () => {
    expect(await 거절문({ prompt_en: "bright kitchen", prompt_ko: 금지 })).toBeNull();
  });

  it("멀쩡한 글은 통과한다", async () => {
    expect(await 거절문({ prompt_en: "bright kitchen" })).toBeNull();
    expect(await 거절문({ ...비움, prompt_ko: "밝은 주방" })).toBeNull();
    expect(await 거절문({ ...비움 })).toBeNull();
  });
});
