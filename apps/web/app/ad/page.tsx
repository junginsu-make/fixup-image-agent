import { notFound } from "next/navigation";
import { isAdExportEnabled } from "../../lib/ad/batch";
import { AdExportClient } from "./ad-export-client";

export const dynamic = "force-dynamic";

/**
 * 광고 규격 내보내기 화면.
 *
 * **기능 스위치가 꺼져 있으면 없는 쪽이다** (격리 계약 5). 라우트가 404 를 내는
 * 것과 짝을 맞춘다 — 화면만 열리고 버튼이 전부 실패하면 더 나쁘다.
 *
 * **다른 화면에 진입점을 달지 않았다.** 그러려면 기존 파일을 고쳐야 하는데,
 * 격리 계약 1 이 그것을 막는다(설계 §4.1). 3단계가 어차피 만들기 화면을
 * 건드리므로 진입점은 그때 함께 붙인다 — 계약을 깨는 시점을 한 번으로 모은다.
 */
export default function AdExportPage() {
  if (!isAdExportEnabled()) notFound();
  return <AdExportClient />;
}
