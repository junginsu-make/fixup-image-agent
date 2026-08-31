import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, ShieldCheck } from "lucide-react";
import { Button, Badge } from "@fixup/ui";
import { PublicPage } from "../_components/public-shell";

const samples = [
  { src: "/samples/1.jpg", category: "뷰티", title: "프리미엄 앰플 상세페이지" },
  { src: "/samples/2.jpg", category: "라이프", title: "제품 중심 전환형 구성" },
  { src: "/samples/3.jpg", category: "푸드", title: "신뢰 정보를 강조한 구성" },
  { src: "/samples/4.jpg", category: "브랜드", title: "모바일 세로형 상세페이지" },
];

const showcase: { facts: string[]; sections: { src: string; label?: string }[] } = {
  facts: ["히알루론산 2%", "나이아신아마이드 2%", "임상 수분 68%↑", "무향료·무색소", "인증 제2024-…호"],
  sections: [
    { src: "/demo-sections/mood-a.jpg" },
    { src: "/demo-sections/01-hero.jpg", label: "히어로 · 후킹" },
    { src: "/demo-sections/02-problem.jpg", label: "문제 공감" },
    { src: "/demo-sections/03-benefit.jpg", label: "베네핏" },
    { src: "/demo-sections/mood-b.jpg" },
    { src: "/demo-sections/04-usp.jpg", label: "USP 차별점" },
    { src: "/demo-sections/05-trust.jpg", label: "근거 · 신뢰" },
    { src: "/demo-sections/06-howto.jpg", label: "사용법" },
    { src: "/demo-sections/mood-c.jpg" },
    { src: "/demo-sections/07-review.jpg", label: "후기" },
    { src: "/demo-sections/08-faq.jpg", label: "FAQ · 오퍼" },
  ],
};

export default function DemoPage() {
  return (
    <PublicPage>
      <main>
        <section className="border-b bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 sm:py-16">
            <Badge variant="secondary"><Eye className="mr-1.5 h-3.5 w-3.5" /> 로그인 없는 고정 결과물 데모</Badge>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">가입 전에 결과물부터 확인하세요</h1>
            <p className="mx-auto mt-5 max-w-2xl leading-7 text-muted-foreground">아래 이미지는 미리 완성된 예시입니다. 이 페이지는 AI를 호출하지 않고 이미지 크레딧도 사용하지 않습니다.</p>
            <div className="mx-auto mt-7 flex max-w-xl flex-col justify-center gap-3 text-left text-sm sm:flex-row sm:text-center">
              <span className="flex items-center justify-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> 개인정보 입력 없음</span>
              <span className="flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 고정 샘플로 안전하게 확인</span>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-2">
          {samples.map((sample) => (
            <article key={sample.src} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="border-b px-4 py-4 sm:px-5">
                <Badge variant="outline">{sample.category}</Badge>
                <h2 className="mt-2 font-extrabold">{sample.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">프레임 안을 스크롤해 전체 구성을 확인하세요.</p>
              </div>
              <div className="max-h-[680px] overflow-y-auto bg-muted/30" tabIndex={0} aria-label={`${sample.title} 전체 이미지 스크롤 영역`}>
                <Image src={sample.src} alt={sample.title} width={920} height={1648} className="block h-auto w-full" sizes="(min-width: 768px) 50vw, 100vw" />
              </div>
            </article>
          ))}
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="text-center">
              <Badge variant="secondary">전사 기반 리디자인</Badge>
              <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">데일리 수분 세럼 · 예시</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">원본 상세페이지의 성분·인증·시험 수치까지 전사해 근거로 삼았습니다.</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {showcase.facts.map((fact) => (
                  <Badge key={fact} variant="outline">{fact}</Badge>
                ))}
              </div>
            </div>
            <div className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="max-h-[1000px] overflow-y-auto bg-muted/30" tabIndex={0} aria-label="데일리 수분 세럼 예시 전체 상세페이지 스크롤 영역">
                {showcase.sections.map((section) => (
                  <figure key={section.src} className="border-t first:border-t-0">
                    {section.label ? (
                      <figcaption className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card/95 px-4 py-2.5 backdrop-blur">
                        <span className="text-xs font-bold text-muted-foreground">{section.label}</span>
                      </figcaption>
                    ) : null}
                    <Image src={section.src} alt={section.label ?? "제품 무드 컷"} width={768} height={1376} className="block h-auto w-full" sizes="(min-width: 768px) 768px, 100vw" />
                  </figure>
                ))}
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">가상 제품 예시(데모) · 전사 → 사실추출 → 리디자인 파이프라인 결과</p>
          </div>
        </section>

        <section className="border-t bg-card">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-14 text-center sm:px-6 sm:py-20">
            <h2 className="text-2xl font-black sm:text-3xl">내 상품으로 직접 만들어 보세요</h2>
            <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">이메일 인증과 관리자 승인 후 제공된 이미지 크레딧으로 생성할 수 있습니다.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild><Link href="/signup">가입 신청 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button size="lg" variant="outline" asChild><Link href="/">서비스 소개로 돌아가기</Link></Button>
            </div>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
