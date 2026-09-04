import { AI_BADGE_SETTING_KEY, aiBadgeEnabledFrom } from "@fixup/sns-core";
import { createSupabaseAdminClient } from "./supabase/admin";

/**
 * "AI 이미지" 표기를 켤지 끌지 읽고 쓴다.
 *
 * 코드에 박아 두면 끄고 싶을 때 배포를 해야 한다. 운영 설정이 모여 있는
 * `app_settings` 에 두고 관리자 화면에서 켜고 끈다. 줄이 없으면 꺼진 것이므로
 * 표를 미리 손볼 것은 없다 — 관리자가 처음 켜는 순간 줄이 생긴다.
 *
 * **DB 를 못 읽으면 끈 것으로 본다.** 표기는 그림 파일에 지울 수 없게 새겨진다.
 * 설정을 못 읽었다는 이유로 붙어 버리면 이미 내보낸 그림을 되돌릴 수 없지만,
 * 안 붙은 것은 켜고 다시 뽑으면 된다.
 */

export async function isAiBadgeEnabled(): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", AI_BADGE_SETTING_KEY)
      .maybeSingle();
    return aiBadgeEnabledFrom(data?.value as string | null | undefined);
  } catch {
    return false;
  }
}

export async function setAiBadgeEnabled(enabled: boolean): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("app_settings").upsert({
    key: AI_BADGE_SETTING_KEY,
    value: enabled ? "on" : "off",
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
