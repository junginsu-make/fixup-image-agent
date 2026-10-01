import { redirect } from "next/navigation";
import { AuthShell } from "../../_components/auth-shell";
import { requireSignedIn } from "../../../lib/membership/server";
import { needsOnboarding } from "../../../lib/membership/onboarding";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { cleanProfileText, PROFILE_LIMITS } from "../../../lib/membership/profile-extras";
import { HOME_AFTER_LOGIN } from "../../../lib/routes";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const { profile, user } = await requireSignedIn();
  if (profile.status !== "active" || !profile.email_confirmed_at) redirect("/access");
  if (!needsOnboarding(profile)) redirect(HOME_AFTER_LOGIN);
  const db = await createSupabaseServerClient();
  const [{ data: extra }, { data: auth }] = await Promise.all([
    db.from("profiles").select("display_name,referrer_input").eq("id", user.id).single(), db.auth.getUser(),
  ]);
  const metadata = auth.user?.user_metadata ?? {};
  const providerName = [metadata.full_name, metadata.name, metadata.preferred_username].find(value => typeof value === "string");
  const name = cleanProfileText(extra?.display_name ?? providerName, PROFILE_LIMITS.name) ?? "";
  return <AuthShell title="가입 정보를 확인해 주세요" description="처음 한 번만 확인합니다. 별도 비밀번호는 필요하지 않습니다." step={2}>
    <OnboardingForm email={profile.email} name={name} referrer={extra?.referrer_input ?? ""} />
  </AuthShell>;
}
