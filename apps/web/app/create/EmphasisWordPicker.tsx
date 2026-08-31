"use client";

import { Sparkles } from "lucide-react";
import { Badge, cn } from "@fixup/ui";
import { splitHeadlineWords } from "./emphasis-words";

/**
 * 제목에서 강조할 단어를 고른다.
 *
 * **글자를 이미지에 그려 주는 모드에서만 의미가 있다.** 텍스트편집 모드는 글자 없는
 * 사진을 만들고 카피를 편집기에서 얹으므로, 강조는 오버레이 서식으로 정한다.
 *
 * 타이핑이 아니라 **누르기**로 고른다. 이유가 있다:
 * 제목에 없는 단어를 적으면 모델이 강조할 대상을 못 찾는다. 제목을 쪼개서 보여주면
 * 그런 일이 생기지 않고, 같은 문구를 두 번 입력하는 수고도 없다.
 *
 * 아무것도 안 고르면 비워 둔다 — 그러면 모델이 알아서 한두 낱말을 고른다
 * (`pdp.image-prompt.ts` 의 기본 규칙). 그것도 꽤 잘 고르므로 기본값으로 둔다.
 */

interface EmphasisWordPickerProps {
  headline: string;
  selected: string[];
  onChange: (words: string[]) => void;
}

export function EmphasisWordPicker({ headline, selected, onChange }: EmphasisWordPickerProps) {
  const words = splitHeadlineWords(headline);

  if (words.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        제목을 먼저 적으면 강조할 낱말을 고를 수 있습니다.
      </p>
    );
  }

  const toggle = (word: string) => {
    onChange(selected.includes(word) ? selected.filter((item) => item !== word) : [...selected, word]);
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {words.map((word, index) => {
          const active = selected.includes(word);
          return (
            <button
              // 같은 낱말이 두 번 나올 수 있다. 인덱스를 함께 써야 키가 겹치지 않는다.
              key={`${word}-${index}`}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(word)}
              className={cn(
                "rounded-md border px-2 py-1 text-sm transition-colors",
                active
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-dashed bg-background text-foreground hover:border-primary/50 hover:bg-muted",
              )}
            >
              {word}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {selected.length === 0 ? (
          <Badge variant="secondary" className="gap-1">
            <Sparkles size={11} />
            AI 가 알아서 고릅니다
          </Badge>
        ) : (
          <>
            <Badge variant="secondary">{selected.length}낱말 강조</Badge>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              고른 것 지우기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
