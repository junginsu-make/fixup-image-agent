import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@fixup/ui";
import { neighborsOf } from "./topics";

/**
 * 설명서 페이지 맨 아래.
 *
 * 읽고 나면 바로 해 보고 싶어진다. 도구로 가는 문을 여기 둔다 — 다시
 * 사이드바에서 찾게 만들지 않는다.
 */
export function GuideFooter({
  href,
  toolHref,
  toolLabel,
}: {
  href: string;
  toolHref?: string;
  toolLabel?: string;
}) {
  const { prev, next } = neighborsOf(href);

  return (
    <div className="grid gap-5 border-t pt-6">
      {toolHref ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">읽으셨으면 바로 만들어 보세요.</p>
          <Button asChild>
            <Link href={toolHref}>
              {toolLabel ?? "열기"}
              <ExternalLink className="size-4" />
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {prev ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={prev.href}>
              <ArrowLeft className="size-4" />
              {prev.label}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={next.href}>
              {next.label}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
