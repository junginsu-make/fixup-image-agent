import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@fixup/ui";
import { CostLabFrame } from "./cost-lab-frame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "비용 전략실",
  description: "판매가·크레딧·마진을 바꿔 보는 시뮬레이션입니다.",
};

/**
 * 비용 전략실.
 *
 * **관리자 문지기는 `admin/layout.tsx` 가 이미 한다**(`requireAdmin()`). 앱
 * 셸도 거기서 씌운다 — 이 화면은 다른 화면과 같은 사이드바·머리말 안에 선다.
 *
 * 도구 자체는 창 안에서 돈다. 까닭은 `cost-lab-frame.tsx` 에 적었다.
 */
export default function CostLabPage() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid">
          <p className="text-meta text-subtle-foreground">ADMIN</p>
          <h1 className="mt-1 text-h1">비용 전략실</h1>
          <p className="mt-2 text-body text-muted-foreground">
            판매가·크레딧·마진을 바꿔 보는 <strong>시뮬레이션</strong>입니다. 실제 요금이나 장부는
            바뀌지 않습니다.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">관리자로</Link>
        </Button>
      </div>

      <CostLabFrame />
    </div>
  );
}
