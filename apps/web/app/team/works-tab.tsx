import { Inbox } from "lucide-react";
import { Badge, Card } from "@fixup/ui";
import type { ProjectItem } from "../../lib/teams/projects";
import { workLabel, type TeamWork } from "../../lib/teams/project-store";
import { ProjectPicker } from "./project-picker";

/**
 * 작업물 탭 — 팀이 만든 것을 한 목록으로.
 *
 * 세 도구를 섞어서 낸다. 도구별로 나누면 「어느 도구로 만들었더라」를 먼저
 * 떠올려야 프로젝트에 넣을 수 있다. 만든 시각 순이면 그냥 최근 것부터 보인다.
 */
export function WorksTab({
  teamId,
  works,
  projects,
  canWrite,
}: {
  teamId: string | null;
  works: TeamWork[];
  projects: ProjectItem[];
  canWrite: boolean;
}) {
  if (!teamId) {
    return (
      <Empty
        title="팀이 있어야 여기가 채워집니다"
        detail="팀에 속한 사람이 만든 것이 한 목록으로 모입니다."
      />
    );
  }

  if (!works.length) {
    return (
      <Empty
        title="아직 팀 작업물이 없습니다"
        detail="팀원이 카드뉴스·이미지·상세페이지를 만들면 여기에 모입니다. 팀에 넣기 전에 만들어 둔 것도 배정할 때 함께 들어옵니다."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {projects.length
          ? "오른쪽에서 프로젝트를 고르면 그 갈래로 들어갑니다."
          : "먼저 「프로젝트」 탭에서 갈래를 만드세요. 만들기 전에는 넣을 곳이 없습니다."}
      </p>

      <Card>
        <ul className="divide-y">
        {works.map((work) => (
          <li key={`${work.table}:${work.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <Badge variant="outline" className="flex-none">{workLabel(work.table)}</Badge>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{work.title}</span>
              <span className="block text-meta text-subtle-foreground">
                {work.ownerEmail} · {work.updatedAt.slice(0, 10)}
              </span>
            </span>

            {canWrite && projects.length ? (
              <ProjectPicker
                teamId={teamId}
                table={work.table}
                workId={work.id}
                current={work.projectId}
                projects={projects}
              />
            ) : (
              <span className="text-meta text-subtle-foreground">
                {projects.find((project) => project.id === work.projectId)?.name ?? "분류 없음"}
              </span>
            )}
          </li>
        ))}
        </ul>
      </Card>
    </div>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid place-items-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <Inbox className="h-6 w-6 text-subtle-foreground" />
      <p className="text-sm font-bold">{title}</p>
      <p className="max-w-sm text-meta text-subtle-foreground">{detail}</p>
    </div>
  );
}
