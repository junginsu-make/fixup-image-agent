import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Results, SectionResultCard } from "../redesign-results";
import { ImageModelPicker } from "../../_components/image-model-picker";
import { missingServerKeyMessage, providerModelNames, type Project, type SectionResult, type ServerConfig } from "../redesign-model";

/**
 * **리디자인도 세 모델 중에서 고른다**(2026-10-08 사용자 결정).
 *
 * 다른 도구와 같은 공용 부품(`ImageModelPicker`)으로 표준형·디테일형·속도형을
 * 고른다. 분석 AI 는 고른 그림 모델을 따른다(`analysisProviderFor`).
 * 화면(`redesign-wizard.tsx`)은 띄울 수 없어 배선은 소스로 재고, 고치기 칸은 띄워서 잰다.
 */

const 읽기 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const 글자 = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : 글자(child))).join("");
const 주석을_뺀다 = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const 섹션: SectionResult = {
  id: "S1", name: "S1 장면", purpose: "목적", source: "원본", prompt: "프롬프트",
  imageUrl: "data:image/png;base64,AAAA",
};

let renderer: ReactTestRenderer;
beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });

describe("섹션 고치기 — 세 모델 중에서", () => {
  const 띄운다 = (onEditSection: (id: string, request: string, imageModel: string) => void) => {
    act(() => {
      renderer = create(
        <SectionResultCard section={섹션} index={0} projectTitle="작업" onEditSection={onEditSection} editing={false} disabled={false} />,
      );
    });
  };
  const 단추 = (글: string) => renderer.root.find(
    (node) => node.type === "button" && 글자(node).includes(글),
  );

  it("**세 모델을 고를 수 있다**", () => {
    띄운다(() => {});

    const 고르기 = renderer.root.findAll((node) => node.type === "button" && node.props.role === "radio");
    const 이름들 = 고르기.map(글자);
    expect(이름들.some((글) => 글.includes("표준형"))).toBe(true);
    expect(이름들.some((글) => 글.includes("디테일형"))).toBe(true);
    expect(이름들.some((글) => 글.includes("속도형"))).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("정밀형");
  });

  it("**고른 그림 모델로 고치기를 부른다**", () => {
    const 받은것: string[] = [];
    띄운다((_, __, imageModel) => 받은것.push(imageModel));

    act(() => { 단추("속도형").props.onClick(); });
    act(() => { 단추("이 섹션 수정").props.onClick(); });

    expect(받은것).toEqual(["nano-banana-2.1"]);
  });

  it("기본은 표준형이다 — 전의 기본(openai)과 같은 모델", () => {
    const 받은것: string[] = [];
    띄운다((_, __, imageModel) => 받은것.push(imageModel));

    act(() => { 단추("이 섹션 수정").props.onClick(); });

    expect(받은것).toEqual(["gpt-image-2.5-flare"]);
  });
});

/**
 * **고치기 칸은 이 작업을 그린 모델로 시작한다**(2026-10-08 최종 리뷰 I3).
 * 작업 공간의 기본(표준형)으로 시작하면 속도형으로 만든 작업을 고칠 때 말없이 다른 모델로 그린다.
 */
describe("고치기 칸의 기본은 작업의 모델", () => {
  const 작업 = (patch: Partial<Project>): Project => ({
    id: "job-1", title: "상세페이지", channel: "스마트스토어", model: "openai", count: 1,
    ratio: "9:16", status: "완료", files: ["원본.pdf"], request: "", createdAt: "2026-10-08T00:00:00Z",
    sections: [섹션], ...patch,
  });
  const 고른값 = (project: Project) => {
    act(() => {
      renderer = create(
        <Results
          project={project} rolloutRequest="" setRolloutRequest={() => {}} onToast={() => {}}
          onSave={() => {}} onSaveToLibrary={() => {}} onEditSection={() => {}} onGenerateRest={() => {}}
          generating={false} editingSectionId={null}
        />,
      );
    });
    return renderer.root.findAllByType(ImageModelPicker).map((node) => node.props.value);
  };

  it("**속도형으로 만든 작업은 속도형으로 고친다**", () => {
    expect(고른값(작업({ model: "google", imageModel: "nano-banana-2.1" }))).toEqual(["nano-banana-2.1"]);
  });

  it("옛 작업(google, imageModel 없음)은 디테일형", () => {
    expect(고른값(작업({ model: "google" }))).toEqual(["nano-banana-pro"]);
  });

  it("숨긴 모델로 그린 작업은 보이는 기본(표준형)", () => {
    expect(고른값(작업({ model: "openai", imageModel: "gpt-image-2.5-sunburst" }))).toEqual(["gpt-image-2.5-flare"]);
  });

  it("카드는 받은 기본으로 고치기를 부른다", () => {
    const 받은것: string[] = [];
    act(() => {
      renderer = create(
        <SectionResultCard section={섹션} index={0} projectTitle="작업" editing={false} disabled={false}
          defaultImageModel="nano-banana-pro" onEditSection={(_, __, imageModel) => 받은것.push(imageModel)} />,
      );
    });
    act(() => {
      renderer.root.find((node) => node.type === "button" && 글자(node).includes("이 섹션 수정")).props.onClick();
    });
    expect(받은것).toEqual(["nano-banana-pro"]);
  });
});

describe("서버 키 확인은 고른 그림 모델의 분석 AI 로", () => {
  const 설정 = (openai: boolean, google: boolean) => ({
    serverOpenaiKeyConfigured: openai, serverGoogleKeyConfigured: google,
    knowledgeConfigured: false, knowledgeDocuments: 0, knowledgeChunks: 0, canManageKnowledge: false,
  }) as ServerConfig;

  it("**키가 있으면 막지 않는다**", () => {
    expect(missingServerKeyMessage(설정(true, false), "gpt-image-2.5-flare")).toBe("");
    expect(missingServerKeyMessage(설정(false, true), "nano-banana-pro")).toBe("");
    expect(missingServerKeyMessage(설정(false, true), "nano-banana-2.1")).toBe("");
  });

  it("**속도형(2.1)은 Google 키를 본다** — 고른 모델 이름으로 말한다", () => {
    expect(missingServerKeyMessage(설정(true, false), "nano-banana-2.1")).toContain("속도형");
    expect(missingServerKeyMessage(설정(false, true), "gpt-image-2.5-flare")).toContain("표준형");
  });

  it("서버 연결 딱지는 키 하나로 쓸 수 있는 모델들의 이름", () => {
    expect(providerModelNames("openai")).toBe("표준형");
    expect(providerModelNames("google")).toBe("디테일형·속도형");
  });
});

describe("화면 배선", () => {
  const wizard = 읽기("redesign-wizard.tsx");
  const panels = 읽기("redesign-panels.tsx");

  it("**만들기 단계는 공용 부품으로 고른다**", () => {
    expect(panels).toContain("<ImageModelPicker");
    expect(panels).not.toContain('(["openai", "google"] as const)');
  });

  it("**결과 화면의 고치기 칸은 작업의 모델로 시작한다**", () => {
    expect(읽기("redesign-results.tsx")).toContain("defaultImageModel={projectImageModel(project)}");
  });

  it("**분석 AI 는 이 요청의 그림 모델에서 나온다** — 이어 그리면 작업의 모델", () => {
    expect(wizard).toContain("const imageModel = requestImageModel(selectedImageModel, baseProject);");
    expect(wizard).toContain("const model = analysisProviderFor(imageModel);");
    expect(wizard).toMatch(/appendGenerateFields\(form, \{[\s\S]{0,300}model, imageModel, channel/);
    expect(wizard).not.toMatch(/imageModel: selectedImageModel/);
  });

  it("**고치기도 그림 모델과 분석 AI 를 함께 보낸다**", () => {
    expect(wizard).toMatch(/const model = analysisProviderFor\(imageModel\)/);
    expect(wizard).toMatch(/body: JSON\.stringify\(\{\s*model,\s*imageModel,/);
  });

  it("**서버 키 확인은 고른 그림 모델로**", () => {
    expect(wizard).not.toContain("missingServerKeyMessage(serverConfig, selectedImageModel)");
    expect(wizard.match(/missingServerKeyMessage\(serverConfig, imageModel\)/g)).toHaveLength(2);
  });

  it("**같은 요청인지 가를 때 그림 모델도 본다**", () => {
    expect(wizard).toMatch(/requestIdentityOf\(\{\s*model, imageModel,/);
  });
});

describe("옛 이름을 쓰지 않는다", () => {
  /**
   * 「정밀형」은 이제 어느 모델도 아니다. 「속도형」은 2.1 의 이름이라 손으로 적으면
   * 옛 Google(디테일형)에 붙는다 — 이름은 정본(`imageModelName`)에서만 받는다.
   */
  const 화면파일 = readdirSync(new URL("../", import.meta.url))
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));
  const 코어 = new URL("../../../../../packages/redesign-core/src/", import.meta.url);
  const 코어파일 = readdirSync(코어).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

  it.each(화면파일)("화면 %s", (name) => {
    const code = 주석을_뺀다(읽기(name));
    expect(code).not.toContain("정밀형");
    expect(code).not.toContain("속도형");
  });

  it.each(코어파일)("코어 %s", (name) => {
    const code = 주석을_뺀다(readFileSync(new URL(name, 코어), "utf8"));
    expect(code).not.toContain("정밀형");
    expect(code).not.toContain("속도형");
  });
});
