import type { ReactNode } from "react";
import { StudioLayout } from "../_components/studio-layout";
import { GuideNav } from "./_components/guide-nav";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <StudioLayout>
      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10">
        <GuideNav />
        <div className="grid min-w-0 gap-8 pb-4">{children}</div>
      </div>
    </StudioLayout>
  );
}
