import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Images,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Badge, Button, Card, CardContent } from "@fixup/ui";
import { OnboardingSteps, PublicPage } from "./_components/public-shell";

const benefits = [
  "유튜브·웹·검색에서 소재를 모아 두기",
  "레퍼런스를 그대로 따라 만드는 카드뉴스와 포스터",
  "상품 사진 한 장에서 상세페이지 만들기",
  "만든 결과를 다음 작업의 기준으로 재사용",
];

const features = [
  {
    icon: Sparkles,
    title: "카드뉴스 만들기",
    description: "유튜브 자막이나 기사 본문을 가져와 레퍼런스에 맞춘 여러 장으로 만듭니다.",
  },
  {
    icon: Images,
    title: "포스터 만들기",
    description: "따라 만들 포스터 한 장을 고르면 레이아웃·서체·색을 가져와 내용만 바꿉니다.",
  },
  {
    icon: Wand2,
    title: "상세페이지 만들기 · 리디자인",
    description: "상품 사진에서 구성안을 잡고 섹션을 만들거나, 기존 페이지를 진단해 다시 설계합니다.",
  },
  {
    icon: FileSearch,
    title: "모아 두고 다시 쓰기",
    description: "채널을 등록하면 소재가 쌓입니다. 참고 이미지와 만든 결과물을 라이브러리에서 함께 씁니다.",
  },
];

export default function HomePage() {
  return (
    <PublicPage>
      <main>
        <section className="relative overflow-hidden border-b">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.14),transparent_34%),radial-gradient(circle_at_85%_65%,hsl(var(--primary)/0.08),transparent_28%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:py-28">
            <div>
              <Badge variant="secondary" className="mb-5">승인 회원 전용 AI 제작 도구</Badge>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.12] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                모아 둔 소재를
                <span className="block text-primary">팔리는 콘텐츠로</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                카드뉴스·포스터·상세페이지를 한 곳에서 만듭니다. 소재를 모아 두면 세 도구가 함께
                끌어다 씁니다. 가입 전에는 고정 결과물 데모로 먼저 확인할 수 있습니다.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/demo">결과물 먼저 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/signup">가입 신청</Link>
                </Button>
              </div>
              <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-[520px]">
              <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-2xl" />
              <div className="relative grid grid-cols-2 gap-3 rounded-[1.75rem] border bg-card/90 p-3 shadow-2xl backdrop-blur sm:gap-4 sm:p-4">
                <div className="overflow-hidden rounded-2xl border bg-muted">
                  <Image src="/samples/1.jpg" alt="AI가 만든 화장품 상세페이지 예시" width={920} height={1648} priority className="h-auto w-full" />
                </div>
                <div className="mt-10 overflow-hidden rounded-2xl border bg-muted">
                  <Image src="/samples/3.jpg" alt="AI가 만든 식품 상세페이지 예시" width={920} height={1648} priority className="h-auto w-full" />
                </div>
                <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border bg-background/95 px-4 py-2 text-xs font-bold shadow-lg sm:text-sm">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  고정 샘플 · AI 호출 없음
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b bg-card" aria-label="이용 정책 요약">
          <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 text-sm sm:grid-cols-3 sm:px-6">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><span><strong>운영자 키 보호</strong><br /><span className="text-muted-foreground">브라우저에 AI 키를 입력하지 않음</span></span></div>
            <div className="flex items-center gap-3"><FileSearch className="h-5 w-5 shrink-0 text-primary" /><span><strong>분석은 이미지 크레딧 미차감</strong><br /><span className="text-muted-foreground">남용 방지를 위한 시간당 제한만 적용</span></span></div>
            <div className="flex items-center gap-3"><Images className="h-5 w-5 shrink-0 text-primary" /><span><strong>성공 결과만 차감</strong><br /><span className="text-muted-foreground">실패한 이미지는 크레딧으로 정산하지 않음</span></span></div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-extrabold text-primary">하나의 스튜디오</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">처음부터 만들기도, 기존 페이지를 고치기도</h2>
            <p className="mt-4 leading-7 text-muted-foreground">작업 목적에 맞는 도구를 선택하고 결과를 같은 방식으로 검토할 수 있습니다.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="h-full">
                <CardContent className="p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-lg font-extrabold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-y bg-muted/35">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div>
              <p className="text-sm font-extrabold text-primary">가입부터 첫 생성까지</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">지금 어느 단계인지 명확하게</h2>
              <p className="mt-4 leading-7 text-muted-foreground">운영자 AI 키로 생성하는 서비스라 이메일 확인과 관리자 승인 후 이용할 수 있습니다.</p>
              <Button variant="outline" asChild className="mt-6"><Link href="/signup">가입 신청하기</Link></Button>
            </div>
            <div className="rounded-2xl border bg-background p-5 shadow-sm sm:p-8">
              <OnboardingSteps current={1} />
              <div className="mt-8 rounded-xl bg-primary/5 p-4 text-sm leading-6">
                <strong>가입 전 확인이 필요하면?</strong>
                <p className="mt-1 text-muted-foreground">데모는 로그인 없이 볼 수 있고, AI를 호출하거나 이미지 크레딧을 사용하지 않습니다.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">결과물을 확인한 뒤 시작하세요</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-muted-foreground">회원가입 전에 완성 예시를 충분히 살펴보고, 필요한 경우에만 가입을 신청할 수 있습니다.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild><Link href="/demo">무료 데모 보기 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button size="lg" variant="outline" asChild><Link href="/signup">가입 신청</Link></Button>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
