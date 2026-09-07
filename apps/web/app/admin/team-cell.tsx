"use client";

import { useRef } from "react";
import { Crown } from "lucide-react";
import { assignTeamFromAdmin, setTeamRoleFromAdmin } from "./actions";

export interface TeamOption {
  id: string;
  name: string;
}

export interface MemberTeam {
  teamId: string;
  teamName: string;
  role: "leader" | "member";
}

/**
 * 회원 명단의 팀 칸.
 *
 * **넣고 빼는 것을 고르개 하나로 한다.** 「빼기」 버튼을 따로 두면 칸에
 * 버튼이 둘이 되고, 옮기려면 빼고 다시 넣는 두 걸음이 된다. 목록에서 「팀
 * 없음」을 고르는 것이 곧 빼기다.
 *
 * 고르면 바로 보낸다 — 「저장」을 따로 두면 줄마다 버튼이 하나씩 더 붙고,
 * 여러 줄을 고쳐 놓고 한 줄만 저장하는 일이 생긴다.
 */
export function TeamCell({
  userId,
  email,
  team,
  teams,
}: {
  userId: string;
  email: string;
  team?: MemberTeam;
  teams: TeamOption[];
}) {
  const form = useRef<HTMLFormElement>(null);

  if (!teams.length) {
    // 팀이 하나도 없으면 고를 것이 없다. 빈 고르개를 놓으면 눌러 보고서야 안다.
    return <span className="text-xs text-muted-foreground">팀 없음</span>;
  }

  return (
    <div className="grid gap-1">
      <form ref={form} action={assignTeamFromAdmin}>
        <input type="hidden" name="userId" value={userId} />
        <select
          name="teamId"
          defaultValue={team?.teamId ?? ""}
          aria-label={`${email} 소속 팀`}
          onChange={(event) => {
            // 되돌릴 수 있는 일이지만, 그 사람이 올린 참고 이미지가 팀 것이
            // 되는 것은 놀랄 만한 일이라 한 번 묻는다.
            const next = event.target.value;
            const message = next
              ? `${email} 을 「${teams.find((t) => t.id === next)?.name}」에 넣습니다.\n\n이 회원이 만든 작업물과 참고 이미지도 함께 팀으로 갑니다.`
              : `${email} 을 팀에서 뺍니다.\n\n작업물과 참고 이미지는 개인 것으로 돌아갑니다.`;
            if (window.confirm(message)) form.current?.requestSubmit();
            else event.target.value = team?.teamId ?? "";
          }}
          // 폭을 내용에 맞춘다. `w-full` 로 두면 표에서 팀 칸이 화면을 다 먹는다.
          className="h-8 w-[9rem] rounded-md border bg-background px-2 text-xs"
        >
          <option value="">팀 없음</option>
          {teams.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </form>

      {/* 팀장은 소속이 있을 때만 뜻이 있다. */}
      {team ? (
        <form action={setTeamRoleFromAdmin}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="role" value={team.role === "leader" ? "member" : "leader"} />
          <button
            type="submit"
            className={`flex items-center gap-1 text-[11px] ${
              team.role === "leader" ? "text-primary" : "text-subtle-foreground hover:text-foreground"
            }`}
          >
            {/* 왕관 색이 지금 자리, 글자가 누르면 될 자리. `/team` 화면과 같다. */}
            <Crown className="h-3 w-3" />
            {team.role === "leader" ? "팀원으로" : "팀장으로"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
