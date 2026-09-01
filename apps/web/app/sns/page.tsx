import Link from "next/link";
import type { Metadata } from "next";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
import { StudioLayout } from "../_components/studio-layout";

export const metadata: Metadata = { title: "카드뉴스", description: "카드뉴스 프로젝트를 만들고 관리합니다." };

export default function SnsPage() {
  return <StudioLayout><div className="grid gap-8"><header><p className="text-meta text-subtle-foreground">CARD NEWS</p><h1 className="mt-1 text-h1">카드뉴스</h1><p className="mt-2 text-body text-muted-foreground">수집한 내용이나 직접 쓴 글을 레퍼런스에 맞춰 여러 장의 카드로 만듭니다.</p></header><Card><CardHeader><CardTitle>새 프로젝트</CardTitle><CardDescription>내용·이미지·규격을 먼저 정한 뒤 원고를 확인합니다.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/sns/new">카드뉴스 만들기</Link></Button></CardContent></Card></div></StudioLayout>;
}
