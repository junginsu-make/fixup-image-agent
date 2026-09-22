import type { Metadata } from "next";
import { CostLabFrame } from "./cost-lab-frame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "비용 전략실",
  description: "생성량·API·서버·DB 비용과 성장에 따른 운영비를 함께 예상합니다.",
};

/**
 * 비용 전략실.
 *
 * **관리자 문지기는 `admin/layout.tsx` 가 이미 한다**(`requireAdmin()`). 앱
 * 셸도 거기서 씌운다 — 사이드바와 머리말이 그대로 따라온다.
 *
 * **머리말을 겹쳐 두지 않는다.** 처음에는 여기에도 「ADMIN · 비용 전략실 ·
 * 설명」을 얹었는데, 도구가 제 이름과 한 줄 설명을 스스로 그린다. 같은 말이
 * 두 번 나오면서 **80px 을 먹고 「대시보드 안에 또 대시보드」로 보였다**
 * (2026-09-11 운영자 지적). 돌아가는 길은 사이드바의 「관리자」다.
 */
export default function CostLabPage() {
  return <CostLabFrame />;
}
