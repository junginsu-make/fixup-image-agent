"use client";

import Link from "next/link";
import { Button } from "@fixup/ui";
import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_HREF } from "../ad-ask";

/**
 * **광고 물음 줄 · 규격 안내 줄**(2026-10-06 설계 A5).
 *
 * 둘 다 대화에 남은 도우미 줄이다. 물음 줄의 단추는 **마지막 줄일 때만** 화면이 넘긴다 —
 * 지난 물음의 단추를 누르면 지금 맥락과 다른 지시로 값이 나간다. 단추 대신 말로 답해도 된다.
 */
export function EasyAdQuestion({ body, bubble, onChoose }: {
  body: string;
  bubble: string;
  onChoose?: (answer: string) => void;
}) {
  return (
    <div className="grid max-w-[85%] gap-2">
      <p className={bubble}>{body}</p>
      {onChoose ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onChoose(AD_CHOICE_IMAGE)}>{AD_CHOICE_IMAGE}</Button>
          <Button size="sm" variant="secondary" onClick={() => onChoose(AD_CHOICE_SPECS)}>{AD_CHOICE_SPECS}</Button>
        </div>
      ) : null}
    </div>
  );
}

/** 규격 안내 줄. 상세페이지 안내처럼 그 줄에 도구로 가는 단추를 단다. */
export function EasyAdGuide({ body, bubble }: { body: string; bubble: string }) {
  return (
    <div className="grid max-w-[85%] gap-2">
      <p className={bubble}>{body}</p>
      <Button asChild size="sm" variant="secondary" className="w-fit">
        <Link href={AD_HREF}>광고소재 열기</Link>
      </Button>
    </div>
  );
}
