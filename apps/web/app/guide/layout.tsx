import type { ReactNode } from "react";
import { StudioLayout } from "../_components/studio-layout";
import { GuideNav } from "./_components/guide-nav";
import { isAdminReader } from "./_components/viewer";

export default async function Layout({ children }: { children: ReactNode }) {
  /*
    목차에서 관리자 전용 장을 뺄지 여기서 한 번만 정한다. 목차는 클라이언트
    컴포넌트라(지금 보고 있는 장을 알아야 한다) 스스로 회원 정보를 못 읽는다.
  */
  const isAdmin = await isAdminReader();

  return (
    <StudioLayout>
      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10">
        <GuideNav isAdmin={isAdmin} />
        <div className="grid min-w-0 gap-8 pb-4">{children}</div>
      </div>
    </StudioLayout>
  );
}
