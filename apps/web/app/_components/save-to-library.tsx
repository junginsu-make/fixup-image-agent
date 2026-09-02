"use client";

import * as React from "react";
import { Button } from "@fixup/ui";

/**
 * 만든 결과를 참고 이미지로 보관한다.
 *
 * 새 표를 만들지 않는다. 라이브러리의 참고 이미지에 들어가면 그 뒤로는
 * **카드뉴스·포스터·상세페이지가 전부 쓸 수 있다.** 잘 나온 결과를 다음
 * 작업의 기준으로 삼는 것이 이 버튼의 목적이다.
 */
export function SaveToLibrary({
  fileUrl, title, className,
}: {
  /** 결과 이미지를 내려받을 수 있는 주소. data: URL 도 된다. */
  fileUrl: string;
  title: string;
  className?: string;
}) {
  return <SaveImagesToLibrary images={[{ fileUrl, title }]} className={className} />;
}

/**
 * 여러 장을 한 번에 보관한다.
 *
 * 상세페이지·리디자인은 섹션이 여러 장 나온다. 낱장 버튼을 장마다 두면
 * 화면이 버튼밭이 되므로 결과 액션 줄에 하나만 둔다.
 */
export function SaveImagesToLibrary({
  images, className, disabled = false,
}: {
  images: Array<{ fileUrl: string; title: string }>;
  className?: string;
  disabled?: boolean;
}) {
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (!images.length) return setError("보관할 이미지가 아직 없습니다.");
    setState("saving");
    setError(null);
    try {
      for (const image of images) {
        const response = await fetch(image.fileUrl);
        if (!response.ok) throw new Error("결과 이미지를 읽지 못했습니다.");
        const blob = await response.blob();
        const form = new FormData();
        form.set("id", crypto.randomUUID());
        form.set("title", image.title);
        // 용도로 거르지 않는다. 어디서 만들었든 세 도구가 다 쓴다.
        form.set("purpose", "both");
        form.set("file", new File([blob], `${image.title}.png`, { type: blob.type || "image/png" }));
        const saved = await (await fetch("/api/reference-images", { method: "POST", body: form })).json();
        if (!saved.ok) throw new Error(saved.message ?? "보관하지 못했습니다.");
      }
      setState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "보관하지 못했습니다.");
      setState("idle");
    }
  }

  const many = images.length > 1;
  return (
    <span className={className}>
      <Button size="sm" variant="ghost" disabled={disabled || state !== "idle"} onClick={() => void save()}>
        {state === "saving" ? "보관하는 중…"
          : state === "saved" ? "라이브러리에 보관됨"
            : many ? `참고 이미지로 보관 · ${images.length}장` : "참고 이미지로 보관"}
      </Button>
      {error ? <span role="alert" className="ml-2 text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
