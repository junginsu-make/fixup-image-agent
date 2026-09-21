"use client";

import { Users } from "lucide-react";
import { personSourceConflict } from "@fixup/pdp-core";
import type { PersonSource, ReferenceModelUsage } from "@fixup/pdp-core";
import { Button } from "@fixup/ui";

/**
 * 인물 사진과 저장 캐릭터를 **둘 다 골랐을 때** 누구를 쓸지 묻는다.
 *
 * ── 왜 물어야 하나 ───────────────────────────────────────────
 *
 * 전에는 서버가 **말없이 업로드 쪽을 쓰고 캐릭터를 버렸다.** 캐릭터를 방금 고른
 * 사용자는 자기 선택이 무시된 것을 **이미지가 나온 뒤에야** 안다. 한 장에 값이
 * 든다.
 *
 * 설계 §6: 「우선순위로 하나를 **조용히 버리지 않는다**.」
 *
 * ── 왜 둘 다 못 쓰나 ─────────────────────────────────────────
 *
 * 2026-07-30 실측에서 얼굴 참조가 둘이면 모델이 절충해 **제3의 인물**을
 * 만들었다. 그래서 「둘 다」는 선택지가 아니다.
 */

export function PersonSourceChoice({
  uploadedName,
  characterId,
  uploadedUsage,
  value,
  onSelect,
}: {
  /** 올린 인물 사진의 이름. 없으면 충돌이 아니다. */
  uploadedName?: string;
  /** 고른 캐릭터. 없으면 충돌이 아니다. */
  characterId?: string;
  /** 올린 사진을 어디에 쓰는가. 대표컷에만 쓰면 나머지는 캐릭터가 나온다. */
  uploadedUsage?: ReferenceModelUsage | null;
  value?: PersonSource;
  onSelect: (next: PersonSource) => void;
}) {
  if (!personSourceConflict({ hasUploadedPerson: Boolean(uploadedName), hasCharacter: Boolean(characterId) })) {
    return null;
  }

  // 안 골랐으면 서버도 업로드를 쓴다. 화면이 그 사실을 보여 준다.
  const 지금 = value ?? "uploaded";

  return (
    <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 p-3.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Users size={14} className="shrink-0 text-warning" />
        <span className="text-sm font-bold">이 페이지에 누가 나오나요?</span>
      </div>
      <p className="mb-2.5 text-sm text-muted-foreground">
        인물 사진과 캐릭터를 모두 고르셨습니다. 얼굴을 둘 보내면 모델이 섞어서 제3의 인물을 만들기 때문에, 한 쪽만
        씁니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={지금 === "uploaded" ? "default" : "outline"}
          onClick={() => onSelect("uploaded")}
        >
          {`올린 사진 (${uploadedName})`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={지금 === "character" ? "default" : "outline"}
          onClick={() => onSelect("character")}
        >
          저장한 캐릭터
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {지금 === "uploaded"
          ? uploadedUsage === "hero-only"
            /*
              **「이 페이지」라고 말하면 거짓이다.** 올린 사진은 대표컷에만
              붙고(`usesUploadedPerson`), 나머지 섹션에는 캐릭터 각도가 실린다.
            */
            ? "대표컷에는 올린 사진이 나오고, 나머지 섹션에는 캐릭터가 나옵니다."
            : "고른 캐릭터는 나오지 않습니다."
          : "올린 인물 사진은 나오지 않습니다."}
      </p>
    </div>
  );
}
