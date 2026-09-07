import { ChevronDown, ChevronUp, FolderOpen } from "lucide-react";
import { Badge, Button, Card, Input } from "@fixup/ui";
import type { ProjectItem } from "../../lib/teams/projects";
import { ConfirmSubmitButton } from "../admin/confirm-submit-button";
import { archiveProjectAction, createProjectAction, moveProjectAction, renameProjectAction } from "./actions";

/**
 * 프로젝트 탭 — 팀 아래 **한 겹**.
 *
 * 상세 화면이 없다. 프로젝트는 고르는 것이지 들어가는 곳이 아니다 — 골라
 * 두면 라이브러리·카드뉴스·이미지 화면이 그 프로젝트만 보여 준다.
 */
export function ProjectsTab({
  teamId,
  projects,
  canWrite,
}: {
  teamId: string | null;
  projects: ProjectItem[];
  canWrite: boolean;
}) {
  if (!teamId) {
    return (
      <div className="grid place-items-center gap-2 rounded-lg border border-dashed p-10 text-center">
        <FolderOpen className="h-6 w-6 text-subtle-foreground" />
        <p className="text-sm font-bold">팀이 있어야 프로젝트를 만듭니다</p>
        <p className="max-w-sm text-meta text-subtle-foreground">
          혼자 쓰는 사람에게 폴더를 만들게 하면, 나눌 이유가 없는 것을 나누는 일이 됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          작업물을 갈래로 나눕니다. 사이드바에서 하나를 고르면 라이브러리·카드뉴스·이미지 화면이
          모두 그 프로젝트만 보여 줍니다.
        </p>
        {canWrite ? (
          <form action={createProjectAction} className="flex items-center gap-2">
            <input type="hidden" name="teamId" value={teamId} />
            <Input
              name="name"
              required
              maxLength={60}
              placeholder="새 프로젝트 이름"
              className="h-9 w-52"
              aria-label="새 프로젝트 이름"
            />
            <Button type="submit" size="sm">만들기</Button>
          </form>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <FolderOpen className="h-6 w-6 text-subtle-foreground" />
          <p className="text-sm font-bold">아직 프로젝트가 없습니다</p>
          <p className="max-w-sm text-meta text-subtle-foreground">
            {canWrite
              ? "위에서 이름을 적어 만드세요. 만든 뒤 「작업물」 탭에서 무엇을 넣을지 고릅니다."
              : "팀장이 만들면 여기에 나옵니다."}
          </p>
        </div>
      ) : (
        <Card>
          <ul className="divide-y">
          {projects.map((project, index) => (
            <li key={project.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <FolderOpen className="h-4 w-4 flex-none text-subtle-foreground" aria-hidden />

              {canWrite ? (
                <form action={renameProjectAction} className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="hidden" name="projectId" value={project.id} />
                  <Input
                    name="name"
                    defaultValue={project.name}
                    maxLength={60}
                    aria-label={`${project.name} 이름`}
                    className="h-8 max-w-xs border-transparent bg-transparent px-1.5 hover:border-border focus:border-border"
                  />
                  <Button type="submit" variant="ghost" size="sm">이름 저장</Button>
                </form>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
              )}

              {/* 비어 있음을 감추지 않는다. 0 건인 것이 이름만 걸려 있으면,
                  눌러서 텅 빈 화면을 본 뒤에야 비었다는 걸 안다. */}
              <Badge variant={project.workCount ? "secondary" : "outline"}>
                {project.workCount}건
              </Badge>

              {canWrite ? (
                <span className="flex items-center gap-1">
                  <MoveButton
                    projectId={project.id}
                    direction="up"
                    disabled={index === 0}
                    label={`${project.name} 위로`}
                  />
                  <MoveButton
                    projectId={project.id}
                    direction="down"
                    disabled={index === projects.length - 1}
                    label={`${project.name} 아래로`}
                  />
                  <form action={archiveProjectAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <ConfirmSubmitButton
                      variant="ghost"
                      size="sm"
                      className="text-subtle-foreground"
                      confirmMessage={`「${project.name}」을 접습니다. 작업물은 지워지지 않고 「전체」로 돌아갑니다. 계속할까요?`}
                      pendingLabel="접는 중..."
                    >
                      접기
                    </ConfirmSubmitButton>
                  </form>
                </span>
              ) : null}
            </li>
          ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MoveButton({
  projectId,
  direction,
  disabled,
  label,
}: {
  projectId: string;
  direction: "up" | "down";
  disabled: boolean;
  label: string;
}) {
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <form action={moveProjectAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="direction" value={direction} />
      <Button type="submit" variant="ghost" size="icon" disabled={disabled} aria-label={label}>
        <Icon className="h-4 w-4" />
      </Button>
    </form>
  );
}
