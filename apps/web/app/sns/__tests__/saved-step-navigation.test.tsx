import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SnsFlowState } from "../../api/sns/flow-service";

const f = vi.hoisted(() => ({ push: vi.fn(), fetch: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: f.push }), useSearchParams: () => f.params, usePathname: () => "/sns/saved" }));
vi.mock("../../_components/running-jobs", () => ({ useRunningJobs: () => ({ jobs: [], start: vi.fn(), finish: vi.fn(), stop: vi.fn() }) }));
vi.mock("../[id]/copy-review", () => ({ CopyReview: ({ flow }: { flow: SnsFlowState }) => <div data-saved-copy>{flow.cards[0]?.copy.headline}</div> }));
// eslint-disable-next-line @next/next/no-img-element -- Test fixture exposes the preserved image URL directly.
vi.mock("../[id]/result-board", () => ({ ResultBoard: ({ flow }: { flow: SnsFlowState }) => <img src={flow.cards[0]?.assetUrl} alt="보존된 카드" /> }));
import { SnsProjectClient } from "../[id]/project-client";

const project = { id: "saved", title: "저장된 카드뉴스", status: "done", ratio: "square", data: { flow: { stage: "result", cards: [{ index: 0, kind: "generated", role: "cover", status: "done", copy: { headline: "보존된 원고", body: "본문", accent: "", footnote: "" }, assetPath: "saved.png", assetUrl: "/saved.png" }], planningIssues: [], copyIssues: [], costs: [] } } };
let view: ReactTestRenderer;
const label = (node: unknown): string => typeof node === "string" ? node : node && typeof node === "object" && "children" in node ? (node.children as unknown[]).map(label).join("") : "";
const button = (text: string) => view.root.findAllByType("button").find(node => label(node).includes(text))!;
const current = () => label(view.root.findAllByType("button").find(node => node.props["aria-current"] === "step"));
beforeEach(() => { f.push.mockReset(); f.fetch.mockReset(); f.params = new URLSearchParams(); f.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ project }) }); vi.stubGlobal("fetch", f.fetch); });
afterEach(() => { act(() => view?.unmount()); vi.unstubAllGlobals(); });
async function open() { await act(async () => { view = create(<SnsProjectClient projectId="saved" />); }); }

describe("saved card news navigation", () => {
  it("returns from 05 to saved copy and back to the same result without regeneration", async () => {
    await open();
    expect(current()).toContain("05 결과");
    act(() => button("04 원고 확인").props.onClick());
    expect(current()).toContain("04 원고 확인");
    expect(label(view.root.findByProps({ "data-saved-copy": true }))).toBe("보존된 원고");
    expect(button("05 결과").props.disabled).toBe(false);
    act(() => button("05 결과").props.onClick());
    expect(view.root.findByType("img").props.src).toBe("/saved.png");
    expect(current()).toContain("05 결과");
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.fetch.mock.calls[0]![1]).toBeUndefined();
    expect(f.push).not.toHaveBeenCalled();
  });

  it("opens 04 when returning from earlier steps with view=copy", async () => {
    f.params = new URLSearchParams("view=copy");
    await open();
    expect(current()).toContain("04 원고 확인");
    expect(label(view.root.findByProps({ "data-saved-copy": true }))).toBe("보존된 원고");
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not offer an empty result before generation", async () => {
    f.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ project: { ...project, data: { flow: { ...project.data.flow, stage: "copy", cards: [] } } } }) });
    f.params = new URLSearchParams("view=result");
    await open();
    expect(current()).toContain("04 원고 확인");
    expect(button("05 결과").props.disabled).toBe(true);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it("can show preserved images even when the saved stage is copy", async () => {
    f.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ project: { ...project, data: { flow: { ...project.data.flow, stage: "copy" } } } }) });
    f.params = new URLSearchParams("view=result");
    await open();
    expect(current()).toContain("05 결과");
    expect(view.root.findByType("img").props.src).toBe("/saved.png");
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});
