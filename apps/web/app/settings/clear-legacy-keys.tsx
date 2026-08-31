"use client";

import { useEffect } from "react";
import { UNIFIED_SETTINGS_STORAGE_KEY } from "@fixup/shared";

export function ClearLegacyKeys() {
  useEffect(() => {
    window.localStorage.removeItem(UNIFIED_SETTINGS_STORAGE_KEY);
  }, []);
  return null;
}
