import type { ReactNode } from "react";
import { StudioLayout } from "../_components/studio-layout";
import { requireAdmin } from "../../lib/membership/server";
import { AdminTabs } from "./admin-tabs";

export default async function Layout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <StudioLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h1">관리자</h1>
          <AdminTabs />
        </div>
        {children}
      </div>
    </StudioLayout>
  );
}
