"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Star, Trash2, X } from "lucide-react";
import { PRODUCT_LIMITS, productLabel, type ProductId } from "@fixup/pdp-core";
import { Badge, Button, Input } from "@fixup/ui";
import type { PreparedImageDraft } from "./pdp-drafts";
import { prepareProductImageFile } from "./pdp-utils";
import { SavedImagePicker } from "./SavedImagePicker";
import { UPLOAD_RIGHTS_NOTE } from "../../lib/rights/upload-notice";
import {
  addPhotos, addProduct, makePrimary, removePhoto, removeProduct, renameProduct, withFirstProduct,
  type PdpProductDraft,
} from "./products";

/**
 * **올리기 화면의 제품 칸**(설계 2026-10-08 §3.1).
 *
 * 같은 제품의 다른 각도는 한 칸에(사진 1~4장, 첫 장이 대표), 다른 제품은 칸을 더해(3개까지)
 * 넣는다. 칸을 고치는 판단은 `products.ts` 의 순수 함수가 하고, 여기는 그리고 부르기만 한다.
 *
 * 목록은 부르는 쪽이 쥔다(`products` · `onChange`). 사진 준비는 몇 초 걸리므로, 준비가 끝난 뒤에는
 * **그때의 목록**에 넣는다 — 기다리기 전 목록을 쥐고 있으면 그 사이 바꾼 이름·사진이 사라진다.
 */

type Prepare = (file: File) => Promise<PreparedImageDraft>;

export const NO_ROOM_MESSAGE = "사진 자리가 모두 찼습니다. 제품당 4장까지 넣을 수 있습니다.";
const NOT_IMAGE_MESSAGE = "이미지 파일만 업로드할 수 있습니다.";
const skippedMessage = (skipped: number) =>
  `사진은 제품당 ${PRODUCT_LIMITS.photos}장까지입니다. ${skipped}장은 넣지 않았습니다.`;

/** 사진 자리가 남은 첫 제품. 빈 목록이면 제품 1(처음 올리는 사진이 제품 1 을 만든다). */
const firstOpenProduct = (products: readonly PdpProductDraft[]): ProductId | null =>
  withFirstProduct(products).find((product) => product.photos.length < PRODUCT_LIMITS.photos)?.id ?? null;

/**
 * 하나씩 차례로 준비한다. 4천만 화소 사진 여러 장을 한꺼번에 캔버스에 올리면 휴대폰 브라우저가
 * 버티지 못한다. 하나가 실패하면 거기서 멈추고, 그 앞까지 준비한 것은 넣는다.
 */
async function prepareInOrder(files: readonly File[], prepare: Prepare) {
  const photos: PreparedImageDraft[] = [];
  for (const file of files) {
    try {
      photos.push(await prepare(file));
    } catch (error) {
      return { photos, error: error instanceof Error ? error.message : "이미지를 준비하지 못했습니다." };
    }
  }
  return { photos, error: undefined };
}

export interface Placement {
  products?: PdpProductDraft[];
  error?: string;
}

/**
 * 파일을 준비해 한 제품에 넣는다. `pick` 은 **준비가 끝난 뒤의 목록**으로 다시 고른다.
 * 넣을 수 없는 몫은 버리고 그 장수를 알린다 — 넘친 사진을 다른 제품 칸에 흘리면 다른 제품이 된다.
 */
async function placeFiles(
  current: () => readonly PdpProductDraft[],
  pick: (products: readonly PdpProductDraft[]) => ProductId | null,
  files: readonly File[],
  prepare: Prepare,
): Promise<Placement> {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (images.length === 0) return { error: NOT_IMAGE_MESSAGE };
  if (!pick(current())) return { error: NO_ROOM_MESSAGE };
  const prepared = await prepareInOrder(images, prepare);
  if (prepared.photos.length === 0) return { error: prepared.error };
  const latest = withFirstProduct(current());
  const id = pick(latest);
  if (!id) return { error: NO_ROOM_MESSAGE };
  const added = addPhotos(latest, id, prepared.photos);
  const messages = [prepared.error, added.skipped > 0 ? skippedMessage(added.skipped) : undefined].filter(Boolean);
  return { products: added.products, ...(messages.length ? { error: messages.join(" ") } : {}) };
}

/** 칸 바깥에 끌어다 놓거나 붙여넣은 사진: 사진 자리가 남은 첫 제품에 넣는다. */
export function dropIntoProducts(
  current: () => readonly PdpProductDraft[],
  files: readonly File[],
  prepare: Prepare = prepareProductImageFile,
): Promise<Placement> {
  return placeFiles(current, firstOpenProduct, files, prepare);
}

interface ProductSlotsProps {
  products: readonly PdpProductDraft[];
  onChange: (products: PdpProductDraft[]) => void;
  onError: (message: string) => void;
  /** 시험이 브라우저 캔버스 없이 돌도록 바꿔 끼우는 자리. */
  prepare?: Prepare;
}

export function ProductSlots({ products, onChange, onError, prepare = prepareProductImageFile }: ProductSlotsProps) {
  // 사진 준비를 기다린 뒤 읽을 목록. 렌더마다 맞춘다(기다리기 전 값을 쥐지 않으려고).
  const latest = useRef(products);
  latest.current = products;
  const [busy, setBusy] = useState<ProductId[]>([]);
  // 빈 목록이어도 「제품 1」 칸은 보인다 — 처음 올리는 자리다.
  const shown = withFirstProduct(products);
  const edit = (change: (current: PdpProductDraft[]) => PdpProductDraft[]) =>
    onChange(change(withFirstProduct(latest.current)));

  const addFiles = async (id: ProductId, files: readonly File[]) => {
    setBusy((current) => [...current, id]);
    const outcome = await placeFiles(() => latest.current, () => id, files, prepare);
    setBusy((current) => current.filter((busyId) => busyId !== id));
    if (outcome.products) onChange(outcome.products);
    if (outcome.error) onError(outcome.error);
  };

  return (
    <div className="mt-3 grid gap-3">
      {shown.map((product) => (
        <ProductSlotCard
          key={product.id}
          product={product}
          busy={busy.includes(product.id)}
          onRename={(name) => edit((current) => renameProduct(current, product.id, name))}
          onRemove={product.id === "p1" ? undefined : () => edit((current) => removeProduct(current, product.id))}
          onAddFiles={(files) => addFiles(product.id, files)}
          onPrimary={(index) => edit((current) => makePrimary(current, product.id, index))}
          onRemovePhoto={(index) => edit((current) => removePhoto(current, product.id, index))}
        />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {shown.length < PRODUCT_LIMITS.products ? (
          <Button type="button" variant="outline" size="sm" onClick={() => edit(addProduct)}>
            <Plus />
            제품 추가
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          같은 제품의 다른 각도는 한 칸에, 다른 제품은 칸을 추가해 넣어 주세요.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{UPLOAD_RIGHTS_NOTE}</p>
    </div>
  );
}

interface ProductSlotCardProps {
  product: PdpProductDraft;
  busy: boolean;
  onRename: (name: string) => void;
  /** 없으면 뺄 수 없는 칸(제품 1). */
  onRemove?: () => void;
  onAddFiles: (files: readonly File[]) => Promise<void>;
  onPrimary: (index: number) => void;
  onRemovePhoto: (index: number) => void;
}

function ProductSlotCard({ product, busy, onRename, onRemove, onAddFiles, onPrimary, onRemovePhoto }: ProductSlotCardProps) {
  const nameId = useId();
  const label = productLabel(product);
  return (
    <section aria-label={label} className="rounded-md bg-background p-3 shadow-[var(--shadow-ring)]">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={nameId} className="mb-1 block text-meta text-subtle-foreground">
            제품 이름(선택)
          </label>
          <Input
            id={nameId}
            value={product.name}
            placeholder={`제품 ${product.id.slice(1)}`}
            onChange={(event) => onRename(event.target.value)}
          />
          <p className="mt-1 text-xs text-subtle-foreground">
            {Array.from(product.name).length}/{PRODUCT_LIMITS.nameChars}자 · 비우면 「제품 {product.id.slice(1)}」로 부릅니다.
          </p>
        </div>
        {onRemove ? (
          <Button type="button" variant="ghost" size="sm" className="mt-5" onClick={onRemove}>
            <Trash2 />
            제품 빼기
          </Button>
        ) : null}
      </div>
      <PhotoGrid photos={product.photos} onPrimary={onPrimary} onRemovePhoto={onRemovePhoto} />
      <PhotoAdder count={product.photos.length} busy={busy} onAddFiles={onAddFiles} />
    </section>
  );
}

function PhotoGrid({
  photos,
  onPrimary,
  onRemovePhoto,
}: {
  photos: readonly PreparedImageDraft[];
  onPrimary: (index: number) => void;
  onRemovePhoto: (index: number) => void;
}) {
  if (photos.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">사진을 1장 이상 넣어 주세요. 배경이 단순한 제품컷이 분석이 안정적입니다.</p>;
  }
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {photos.map((photo, index) => (
        <li key={`${index}-${photo.fileName}`} className="min-w-0 overflow-hidden rounded-md bg-card shadow-[var(--shadow-ring)]">
          <div className="relative grid aspect-square place-items-center bg-canvas">
            <img alt={photo.fileName} data-zoomable className="h-full w-full cursor-zoom-in object-contain" src={photo.previewUrl} />
            {index === 0 ? <Badge variant="green" className="absolute left-1.5 top-1.5">대표</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-1 p-1.5">
            {index > 0 ? (
              <Button type="button" variant="ghost" size="sm" aria-label={`사진 ${index + 1} 대표로`} onClick={() => onPrimary(index)}>
                <Star />
                대표로
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" aria-label={`사진 ${index + 1} 빼기`} onClick={() => onRemovePhoto(index)}>
              <X />
              빼기
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PhotoAdder({ count, busy, onAddFiles }: { count: number; busy: boolean; onAddFiles: (files: readonly File[]) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = count >= PRODUCT_LIMITS.photos;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        accept="image/*"
        className="sr-only"
        multiple
        type="file"
        ref={inputRef}
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          // 같은 파일을 다시 골라도 바뀜이 일어나게 비운다.
          event.target.value = "";
          if (files.length) await onAddFiles(files);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={full || busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {busy ? "사진 준비 중" : "사진 더하기"}
      </Button>
      {full ? (
        <p className="text-xs text-muted-foreground">
          {`${PRODUCT_LIMITS.photos}장이 다 찼습니다. 다른 사진을 넣으려면 하나를 빼 주세요.`}
        </p>
      ) : (
        // 4장이 찼으면 숨긴다 — 골라도 넣을 자리가 없다.
        <SavedImagePicker label="저장된 이미지에서 고르기" onPick={(file) => void onAddFiles([file])} />
      )}
      <span className="text-xs text-subtle-foreground">{count}/{PRODUCT_LIMITS.photos}장</span>
    </div>
  );
}
