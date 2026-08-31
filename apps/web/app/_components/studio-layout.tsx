import type { ReactNode } from "react";
import { AppShell } from "@fixup/ui";
import { requireActiveMember, getUsageSummary } from "../../lib/membership/server";
import { GuideDialog } from "./guide-dialog";
import { StudioActions } from "./studio-actions";

export async function StudioLayout({ children }: { children: ReactNode }) {
  const membership = await requireActiveMember();
  const usage = await getUsageSummary(membership.user.id);
  return (
    <AppShell
      isAdmin={membership.profile.role === "admin"}
      actions={
        <StudioActions email={membership.profile.email} usage={usage}>
          <GuideDialog />
        </StudioActions>
      }
    >
      {children}
    </AppShell>
  );
}
