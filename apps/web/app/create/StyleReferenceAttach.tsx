"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import type { StyleReferenceView } from "./StyleReferenceCard";
import { SavedImagePicker, type SavedImageSource } from "./SavedImagePicker";

/**
 * 시나리오 화면에서 레퍼런스를 바로 첨부한다.
 *
 * 설정 화면에도 올리는 곳이 있지만, "이 상품은 이런 느낌으로 만들고 싶다"고
 * 생각하는 순간은 여기다. 설정으로 나갔다 오게 하면 작업 흐름이 끊긴다.
 *
 * 올린 것을 곧바로 이 페이지의 레퍼런스로 쓴다. 사용자가 직접 고른 것이므로
 * 다시 추천을 돌려 다른 것이 뽑히면 오히려 배신이다.
 *
 * **이미 계정에 있는 이미지도 고를 수 있다.** 레퍼런스로 등록해 둔 것과 지난 작업물이
 * 모두 대상이다 — 같은 이미지를 파일로 다시 올리게 하면 안 된다.
 */

interface StyleReferenceAttachProps {
  onAttached: (reference: StyleReferenceView) => void;
}

export function StyleReferenceAttach({ onAttached }: StyleReferenceAttachProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (file) await attach(file);
  };

  /**
   * @param existing 이미 계정에 레퍼런스로 등록돼 있는 것이면 그 정보. 있으면
   *   등록 요청을 보내지 않는다 — 같은 이미지가 두 벌 쌓이고 분석이 한 번 더 돈다.
   */
  const attach = async (file: File, existing?: SavedImageSource) => {
    setBusy(true);
    setMessage("이미지를 읽고 있습니다…");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      const mimeType = file.type || "image/png";
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60);

      if (existing?.origin === "reference") {
        onAttached({
          id: existing.referenceId,
          name,
          description: existing.description,
          imageBase64: base64,
          mimeType,
          reason: "직접 고르신 레퍼런스입니다.",
        });
        setMessage("");
        return;
      }

      const response = await fetch("/api/pdp/style-references", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, source: "upload", imageBase64: base64, mimeType }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        id?: string;
        description?: string;
        message?: string;
      };

      if (!body.ok || !body.id) {
        setMessage(body.message ?? "레퍼런스로 등록하지 못했습니다.");
        return;
      }

      onAttached({
        id: body.id,
        name,
        description: body.description ?? "",
        imageBase64: base64,
        mimeType,
        reason: "직접 첨부하신 이미지입니다.",
      });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이미지를 읽지 못했습니다.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="grid gap-2">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files)}
      />
      {/*
        인물 칸의 '사진 올리기'와 같은 모양이어야 한다. 하는 일이 같은 자리인데
        생김새가 다르면 사용자는 다른 기능으로 읽는다.
      */}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/50 hover:bg-muted disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={15} className="flex-none animate-spin text-primary" />
        ) : (
          <ImagePlus size={15} className="flex-none text-primary" />
        )}
        {/* "분석하는 중"이라고 쓰면 안 된다 — 분석은 곁다리고, 붙이는 일 자체가 아니다. */}
        <span className="min-w-0 truncate">{busy ? "붙이는 중…" : "사진 올리기"}</span>
      </button>

      {/* 계정에 이미 있는 이미지를 파일로 다시 올리게 하지 않는다. */}
      <SavedImagePicker
        label="라이브러리에서 고르기"
        origin="reference"
        onPick={(file, source) => void attach(file, source)}
      />

      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
