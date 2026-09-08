"use client";

import { Info } from "lucide-react";
import type { AdNotice } from "./export-rules";

/**
 * **이후에 사람이 해야 할 일**을 규격 칸 안에서 말한다.
 *
 * 사용자 요청(2026-09-08): 「로고와 같은 사용자가 반드시 알아야 하거나 이후
 * 작업을 해야 할 부분이 있다면 해당 섹션에서 안내 메시지를 보여주세요.」
 *
 * **줄마다 붙는 경고와 다른 자리다.** 크롭·축소·작음 경고는 결과물 옆에서
 * 「이것을 보세요」라고 하고, 이 상자는 규격을 **고르는 자리**에서 「나중에
 * 이것을 하세요」라고 한다. 결과가 나온 뒤에 알면 늦는 것들이다.
 *
 * 모양은 지어내지 않는다 — `create/ScenarioEditor.tsx:335` 의 안내 상자와
 * 같은 것을 쓴다. 이 저장소에서 「알아 두세요」는 저 모양이다.
 *
 * **빨간색을 안 쓴다.** 고장이 아니라 할 일이라, 오류 상자와 같은 색이면
 * 사용자는 뭔가 잘못됐다고 읽는다.
 */
export function ActionNotices({ notices }: { notices: AdNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="grid gap-2">
      {notices.map((notice) => (
        <div
          key={notice.key}
          className="rounded-md border border-primary/25 bg-primary-soft/40 p-3.5"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
            <Info size={14} className="text-primary" />
            {notice.title}
          </div>
          <p className="text-sm text-muted-foreground">{notice.body}</p>
        </div>
      ))}
    </div>
  );
}
