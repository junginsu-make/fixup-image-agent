import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDisabledRoute } from "../../lib/access/routes";
import { HOME_AFTER_LOGIN } from "../../lib/routes";
import { StudioLayout } from "../_components/studio-layout";
import { InboxClient } from "./inbox-client";

export const metadata: Metadata = {
  title: "수집함",
  description: "수집된 카드뉴스 소재를 읽고 제작 후보로 고릅니다.",
};

export default function InboxPage() {
  /**
   * **꺼 둔 화면이다.** 사이드바에서 빼는 것만으로는 주소를 치면 열린다.
   *
   * 역할 규칙(`PAGE_ACCESS`)으로는 못 막는다 — `canAccessPage()` 가 관리자를
   * 무조건 통과시킨다. 켤 때는 `lib/access/routes.ts` 의 `disabled` 한 줄만
   * 지우면 이 문도 같이 열린다.
   */
  if (isDisabledRoute("/inbox")) redirect(HOME_AFTER_LOGIN);

  return (
    <StudioLayout>
      <InboxClient />
    </StudioLayout>
  );
}
