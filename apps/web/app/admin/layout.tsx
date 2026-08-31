import type { ReactNode } from "react";
import { StudioLayout } from "../_components/studio-layout";
import { requireAdmin } from "../../lib/membership/server";

export default async function Layout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <StudioLayout>{children}</StudioLayout>;
}
