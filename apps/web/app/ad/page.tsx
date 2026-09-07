import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioLayout } from "../_components/studio-layout";
// 스위치만 읽는다 — `batch` 를 지나면 sharp 를 통째로 끌고 온다.
import { isAdExportEnabled } from "../../lib/ad/feature";
import { AdExportClient } from "./ad-export-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "광고 규격으로 내보내기",
  description: "만들어 둔 그림에서 포털 광고 규격을 뽑습니다.",
};

/**
 * 광고 규격 내보내기 화면.
 *
 * **기능 스위치가 꺼져 있으면 없는 쪽이다** (격리 계약 5). 라우트가 404 를 내는
 * 것과 짝을 맞춘다 — 화면만 열리고 버튼이 전부 실패하면 더 나쁘다.
 *
 * **셸을 씌운다.** 2단계에서는 격리 계약 1 이 기존 파일을 막아 최소 페이지로
 * 뒀는데, 그러면 이 화면만 사이드바·사용량·계정 메뉴·「만드는 중」 패널 없이
 * 떠서 **다른 화면으로 돌아갈 길이 없다.** 3단계가 계약을 이미 깼으므로 함께
 * 맞춘다 — `/sns/new`·`/poster/new` 와 같은 모양이다.
 *
 * **스위치를 먼저 본다.** `layout.tsx` 로 씌우면(`/library` 방식) 기능이 꺼져
 * 있어도 셸이 회원·사용량을 조회한다. 없는 화면을 위해 그 일을 할 이유가 없다.
 */
export default function AdExportPage() {
  if (!isAdExportEnabled()) notFound();
  return <StudioLayout><AdExportClient /></StudioLayout>;
}
