import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_SLOTS } from "@fixup/poster-core";

const f = vi.hoisted(() => ({ push: vi.fn(), fetch: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: f.push }), useSearchParams: () => f.params, usePathname: () => "/poster/saved" }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => <a {...props}>{children}</a> }));
vi.mock("../../_components/running-jobs", () => ({ useRunningJobs: () => ({ jobs: [], start: vi.fn(), finish: vi.fn(), stop: vi.fn() }) }));
vi.mock("../../_components/image-viewer", () => ({ downloadImage: vi.fn() }));
vi.mock("@fixup/ui", async (original) => {
  const actual = await original<Record<string, unknown>>();
  const Part = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return { ...actual,
    SidePanel: ({ open, onOpenChange, children }: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
      <section data-plan-open={open}>{open ? <><button onClick={() => onOpenChange(false)}>패널 닫기</button>{children}</> : null}</section>,
    SidePanelContent: Part, SidePanelBody: Part, SidePanelHeader: Part, SidePanelFooter: Part, SidePanelTitle: Part, SidePanelDescription: Part,
  };
});
import { PosterClient } from "../[id]/poster-client";

let view: ReactTestRenderer;
const project = { id: "saved", title: "저장된 이미지", status: "done", ratio: "square", modelId: "gpt-image-2", data: { instruction: "저장된 지시", variants: 1, promptMode: "assisted" as const, slots: { ...EMPTY_SLOTS, headline: "보존할 기획 문구" } } };
const images = [{ id: "saved-image", variantIndex: 0, generationRequestId: "req-1", selected: true, url: "/saved-result.png" }];
const label = (node: unknown): string => typeof node === "string" ? node : node && typeof node === "object" && "children" in node ? (node.children as unknown[]).map(label).join("") : "";
const button = (text: string) => view.root.findAllByType("button").find(node => label(node).includes(text))!;
const current = () => label(view.root.findAllByType("button").find(node => node.props["aria-current"] === "step"));

beforeEach(() => { f.push.mockReset(); f.fetch.mockReset(); f.params = new URLSearchParams(); vi.stubGlobal("fetch", f.fetch); vi.stubGlobal("window", { setInterval, clearInterval }); });
afterEach(() => { act(() => view?.unmount()); vi.unstubAllGlobals(); });

describe("saved poster plan navigation", () => {
  it("opens the saved plan from step 04, tracks the active step and preserves the result", () => {
    act(() => { view = create(<PosterClient project={project} images={images} />); });
    expect(current()).toContain("05 결과");
    expect(button("04 기획 확인").props.disabled).toBe(false);
    act(() => button("04 기획 확인").props.onClick());
    expect(current()).toContain("04 기획 확인");
    expect(view.root.findByProps({ "data-plan-open": true })).toBeTruthy();
    expect(view.root.findAll(node => node.type === "input" || node.type === "textarea").some(node => node.props.value === "보존할 기획 문구")).toBe(true);
    expect(view.root.findAllByType("img").some(node => node.props.src === "/saved-result.png")).toBe(true);
    act(() => button("패널 닫기").props.onClick());
    expect(current()).toContain("05 결과");
    act(() => button("04 기획 확인").props.onClick());
    expect(current()).toContain("04 기획 확인");
    act(() => button("05 결과").props.onClick());
    expect(view.root.findByProps({ "data-plan-open": false })).toBeTruthy();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.push).not.toHaveBeenCalled();
  });

  it("returns to an earlier step with the saved project id", () => {
    act(() => { view = create(<PosterClient project={project} images={images} />); });
    act(() => button("03 규격").props.onClick());
    expect(f.push).toHaveBeenCalledWith("/poster/new?from=saved&step=spec");
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("can reopen the plan after closing it before the first generation", () => {
    act(() => { view = create(<PosterClient project={project} images={[]} />); });
    expect(current()).toContain("04 기획 확인");
    act(() => button("패널 닫기").props.onClick());
    expect(current()).toContain("04 기획 확인");
    expect(button("05 결과").props.disabled).toBe(true);
    expect(button("04 기획 확인").props.disabled).toBe(false);
    act(() => button("04 기획 확인").props.onClick());
    expect(current()).toContain("04 기획 확인");
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("locks 04 while a generation is running, like the plan button", () => {
    f.fetch.mockReturnValue(new Promise(() => {}));
    act(() => { view = create(<PosterClient project={project} images={images} />); });
    act(() => button("04 기획 확인").props.onClick());
    act(() => button("1장 만들기").props.onClick());
    expect(current()).toContain("05 결과");
    expect(button("04 기획 확인").props.disabled).toBe(true);
  });

  it("keeps verbatim projects free of a planning step", () => {
    act(() => { view = create(<PosterClient project={{ ...project, data: { ...project.data, promptMode: "verbatim" } }} images={images} />); });
    expect(button("04 기획 확인")).toBeUndefined();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("never replans a completed result whose old saved slots are empty", async () => {
    f.fetch.mockResolvedValue({ json: async () => ({ ok: false, message: "Unexpected planning request" }) });
    await act(async () => { view = create(<PosterClient project={{ ...project, data: { ...project.data, slots: EMPTY_SLOTS } }} images={images} />); });
    act(() => button("04 기획 확인").props.onClick());
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
