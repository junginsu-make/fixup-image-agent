"use client";

import { useRef } from "react";
import type { ProjectItem } from "../../lib/teams/projects";
import { moveWorkAction } from "./actions";

/**
 * 작업물 한 줄의 프로젝트 고르개.
 *
 * 고르면 바로 보낸다. 「저장」 버튼을 따로 두면 줄마다 버튼이 하나씩 더 붙고,
 * 여러 줄을 고쳐 놓고 한 줄만 저장하는 일이 생긴다.
 */
export function ProjectPicker({
  teamId,
  table,
  workId,
  current,
  projects,
}: {
  teamId: string;
  table: string;
  workId: string;
  current: string | null;
  projects: ProjectItem[];
}) {
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action={moveWorkAction} className="flex-none">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="workId" value={workId} />
      <select
        name="projectId"
        defaultValue={current ?? ""}
        aria-label="프로젝트 고르기"
        onChange={() => form.current?.requestSubmit()}
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">분류 없음</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.name}</option>
        ))}
      </select>
    </form>
  );
}
