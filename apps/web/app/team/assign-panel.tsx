"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import {
  Button,
  Input,
  SidePanel,
  SidePanelBody,
  SidePanelContent,
  SidePanelDescription,
  SidePanelFooter,
  SidePanelHeader,
  SidePanelTitle,
} from "@fixup/ui";
import { assignMemberAction } from "./actions";

export interface Candidate {
  userId: string;
  email: string;
  workCount: number;
}

/**
 * 팀원 넣기 — 오른쪽 슬라이드 창.
 *
 * 설계에는 「두 열 이동 모달」로 적혀 있는데, 이 앱의 다른 자리(생성 결과·
 * 라이브러리)가 모두 오른쪽 슬라이드다. 같은 일에 두 가지 창이 뜨면 어느
 * 쪽이 무엇인지 매번 다시 익혀야 한다. 두 열을 한 열 + 고른 것 요약으로
 * 바꾼 것도 같은 이유다 — 오른쪽 열은 왼쪽에 이미 켜진 체크와 같은 것을
 * 두 번 보여줄 뿐이다.
 *
 * **고르기 전에 무엇이 따라가는지 말한다.** 사람마다 「작업물 N건」이 붙는다.
 * 지난 초안이 팀에 공개되는 일은 놀랄 만한 일이라, 누르고 나서 알면 늦다.
 */
export function AssignPanel({
  teamId,
  teamName,
  candidates,
}: {
  teamId: string;
  teamName: string;
  candidates: Candidate[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? candidates.filter((row) => row.email.toLowerCase().includes(needle))
      : candidates;
  }, [candidates, query]);

  const pickedWork = candidates
    .filter((row) => picked.includes(row.userId))
    .reduce((sum, row) => sum + row.workCount, 0);

  const toggle = (userId: string) =>
    setPicked((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" />
        팀원 넣기
        {candidates.length > 0 ? (
          <span className="rounded-full bg-primary-soft px-1.5 text-[11px] font-bold text-primary tabular-nums">
            {candidates.length}
          </span>
        ) : null}
      </Button>

      <SidePanelContent>
        <SidePanelHeader>
          <SidePanelTitle>{teamName} · 팀원 넣기</SidePanelTitle>
          <SidePanelDescription>
            아직 어느 팀에도 없는 회원만 나옵니다. 넣으면 그 사람이 만들어 둔 작업물도 함께
            팀으로 가고, 팀에서 빼면 다시 개인 작업으로 돌아갑니다.
          </SidePanelDescription>
        </SidePanelHeader>

        <SidePanelBody>
          {candidates.length === 0 ? (
            <p className="py-10 text-center text-sm text-subtle-foreground">
              미배정 회원이 없습니다. 모든 회원이 어딘가의 팀에 있습니다.
            </p>
          ) : (
            <form id="assign-form" action={assignMemberAction} className="grid gap-3">
              <input type="hidden" name="teamId" value={teamId} />

              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="메일 주소로 찾기"
                aria-label="메일 주소로 찾기"
                className="h-9"
              />

              <ul className="grid gap-1">
                {shown.map((row) => {
                  const on = picked.includes(row.userId);
                  return (
                    <li key={row.userId}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                          on ? "border-primary/40 bg-primary-soft" : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="userId"
                          value={row.userId}
                          checked={on}
                          onChange={() => toggle(row.userId)}
                          className="h-4 w-4 flex-none accent-[var(--primary)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{row.email}</span>
                          <span className="block text-meta text-subtle-foreground">
                            {row.workCount > 0
                              ? `작업물 ${row.workCount}건이 함께 들어갑니다`
                              : "함께 들어갈 작업물이 없습니다"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {shown.length === 0 ? (
                <p className="py-6 text-center text-meta text-subtle-foreground">
                  「{query}」와 맞는 회원이 없습니다.
                </p>
              ) : null}
            </form>
          )}
        </SidePanelBody>

        {candidates.length > 0 ? (
          <SidePanelFooter>
            <p className="mr-auto text-meta text-subtle-foreground">
              {picked.length === 0
                ? "넣을 회원을 고르세요"
                : `${picked.length}명 · 작업물 ${pickedWork}건이 함께 이동합니다`}
            </p>
            <Button type="submit" form="assign-form" size="sm" disabled={picked.length === 0}>
              팀에 넣기
            </Button>
          </SidePanelFooter>
        ) : null}
      </SidePanelContent>
    </SidePanel>
  );
}
