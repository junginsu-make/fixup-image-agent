import type { ReactNode } from "react";
import { StudioLayout } from "../_components/studio-layout";
import { requireAdmin } from "../../lib/membership/server";
import { AdminTabs } from "./admin-tabs";
import { countNewInquiries } from "../../lib/cs/inquiry-store";
import { markAdminVisit } from "../../lib/analytics/admin-marker";

export default async function Layout({ children }: { children: ReactNode }) {
  const { user } = await requireAdmin();
  // 기다리지 않는다. 방문 분석이 관리자 화면을 늦추면 안 된다(이유는 admin-marker.ts).
  void markAdminVisit(user.id);
  /*
    **탭에 적을 수**(설계 §10.3). 못 읽으면 0 이라 화면은 그대로 열린다 —
    마이그레이션 전 서버에는 이 표가 없다.
  */
  const newInquiries = await countNewInquiries();
  return (
    <StudioLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h1">관리자</h1>
          <AdminTabs newInquiries={newInquiries} />
        </div>
        {children}
      </div>
    </StudioLayout>
  );
}
