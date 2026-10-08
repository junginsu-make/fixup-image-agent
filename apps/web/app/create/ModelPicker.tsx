"use client";
import { useCreditPolicy } from "../_components/credit-policy-provider";

import { DEFAULT_IMAGE_MODEL } from "@fixup/pdp-core";
import type { ImageModelId } from "@fixup/pdp-core";
import { PDP_IMAGE_MODELS } from "../../lib/pdp/image-models";
import { ImageModelPicker } from "../_components/image-model-picker";

/**
 * 이미지 모델 선택.
 *
 * 공용 부품(`ImageModelPicker`)으로 다른 화면과 같은 등급 이름·설명을 보이고,
 * 차감량은 고른 모델 기준으로 한 줄 함께 띄운다 — 모르고 고르면 월 한도가 금방 사라진다.
 */

interface ModelPickerProps {
  value: ImageModelId;
  sectionCount: number;
  disabled?: boolean;
  onChange: (model: ImageModelId) => void;
}

export function ModelPicker({ value, sectionCount, disabled, onChange }: ModelPickerProps) {
  const creditPolicy = useCreditPolicy();
  const selected =
    PDP_IMAGE_MODELS.find((model) => model.id === value) ??
    PDP_IMAGE_MODELS.find((model) => model.id === DEFAULT_IMAGE_MODEL);
  const cost =
    creditPolicy === "image-v2"
      ? `${sectionCount}크레딧 차감`
      : `${(selected?.creditWeight ?? 1) * sectionCount}장 차감`;
  return (
    <div className="grid gap-2">
      <ImageModelPicker
        value={value}
        onChange={(id) => onChange(id as ImageModelId)}
        disabled={disabled}
        legend="이미지 생성 모델"
      />
      <p className="text-xs font-bold text-primary">{cost}</p>
    </div>
  );
}
