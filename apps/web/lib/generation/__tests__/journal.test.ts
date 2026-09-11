import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm, writeFile, appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("server-only",()=>({}));
import { replayAcceptanceJournal } from "../journal";
let root:string;let parent:string;
const row=()=>JSON.stringify({runId:randomUUID(),attemptId:randomUUID(),providerRequestId:randomUUID()});
beforeEach(async()=>{parent=await realpath(tmpdir());root=await mkdtemp(path.join(parent,"fixup-journal-"));});
afterEach(async()=>{const target=await realpath(root);if(path.dirname(target)!==parent||!path.basename(target).startsWith("fixup-journal-"))throw new Error("Unexpected cleanup target");await rm(target,{recursive:true});});
it("does not consume a partial line or replay a confirmed prefix",async()=>{
  const second=row();await writeFile(path.join(root,"accepted.jsonl"),`${row()}\n${second.slice(0,20)}`);
  const apply=vi.fn(async()=>true);expect(await replayAcceptanceJournal(root,apply)).toBe(1);
  await appendFile(path.join(root,"accepted.jsonl"),`${second.slice(20)}\n`);
  expect(await replayAcceptanceJournal(root,apply)).toBe(1);expect(await replayAcceptanceJournal(root,apply)).toBe(0);expect(apply).toHaveBeenCalledTimes(2);
});
it("persists confirmed progress when a later DB recovery fails",async()=>{
  await writeFile(path.join(root,"accepted.jsonl"),`${row()}\n${row()}\n`);
  const apply=vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("DB unavailable"));
  await expect(replayAcceptanceJournal(root,apply)).rejects.toThrow("DB unavailable");
  const recovered=vi.fn(async()=>true);expect(await replayAcceptanceJournal(root,recovered)).toBe(1);expect(recovered).toHaveBeenCalledOnce();
});
it("keeps a live-lease record pending",async()=>{
  await writeFile(path.join(root,"accepted.jsonl"),`${row()}\n`);
  expect(await replayAcceptanceJournal(root,async()=>false)).toBe(0);
  expect(await replayAcceptanceJournal(root,async()=>true)).toBe(1);
});
