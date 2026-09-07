import type { Metadata } from "next";
import { StudioLayout } from "../../_components/studio-layout";
import { PosterNewClient } from "../new-client";
import { isAdExportEnabled } from "../../../lib/ad/feature";

export const metadata: Metadata = {
  title: "이미지 만들기",
  description: "참고 이미지·규격·한 줄 지시로 이미지 작업을 시작합니다.",
};

/**
 * **스위치를 여기서 내려 준다** (설계 §10 3-c).
 *
 * `isAdExportEnabled()` 는 `process.env.AD_EXPORT` 를 읽는데, `new-client.tsx` 는
 * `"use client"` 라 그 값이 **`undefined` 로 읽힌다** — Next 는 `NEXT_PUBLIC_*`
 * 만 클라이언트 번들에 넣는다. 화면이 스스로는 스위치를 볼 수 없다.
 *
 * `NEXT_PUBLIC_AD_EXPORT` 를 새로 만들면 **스위치가 둘이 되고**, 「생성은 되는데
 * 내보내기가 꺼져 있다」는 반쪽 상태가 생긴다. 스위치는 하나로 유지한다.
 */
export default function PosterNewPage() {
  return <StudioLayout><PosterNewClient adEnabled={isAdExportEnabled()} /></StudioLayout>;
}
