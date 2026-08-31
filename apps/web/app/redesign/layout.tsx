import type { ReactNode } from "react";
import { StudioLayout } from "../_components/studio-layout";

export default function Layout({ children }: { children: ReactNode }) {
  return <StudioLayout>{children}</StudioLayout>;
}
