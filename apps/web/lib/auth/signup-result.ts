type SignupData = {
  user: { identities?: unknown[]; invited_at?: string } | null;
  session: object | null;
};

type SignupError = { code?: string; status?: number; message: string };

export type SignupResult = {
  kind: "existing" | "confirmation" | "authenticated" | "mail-error" | "error";
  message: string;
};

/** Supabase can return success with no email for an already confirmed account. */
export function signupResult(data: SignupData | null, error: SignupError | null): SignupResult {
  if (error) {
    if (["user_already_exists", "email_exists"].includes(error.code ?? "") || /user already registered/i.test(error.message)) {
      return { kind: "existing", message: "이미 가입된 이메일입니다." };
    }
    if (error.code === "over_email_send_rate_limit" || /email rate limit exceeded/i.test(error.message)) {
      return { kind: "mail-error", message: "인증 메일 발송 요청이 많아 지금은 보낼 수 없습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요." };
    }
    if (error.code === "email_address_invalid") {
      return { kind: "error", message: "이메일 주소를 확인해 주세요." };
    }
    if (error.code === "email_address_not_authorized" || /error sending (confirmation )?(email|mail)|smtp/i.test(error.message)) {
      return { kind: "mail-error", message: "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요." };
    }
    if (error.code === "captcha_failed") {
      return { kind: "error", message: "보안 확인에 실패했습니다. 다시 확인해 주세요." };
    }
    if (error.status === 429 || error.code === "over_request_rate_limit") {
      return { kind: "error", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." };
    }
    if (error.code === "weak_password") {
      return { kind: "error", message: "더 안전한 비밀번호를 입력해 주세요. 영문·숫자·특수문자를 조합해 주세요." };
    }
    return { kind: "error", message: "회원가입 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요." };
  }
  if (!data?.user) {
    return { kind: "error", message: "가입 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (data.session) return { kind: "authenticated", message: "회원가입이 완료되었습니다." };
  // Invited users can also have hidden identities, but receive confirmation mail.
  if (data.user.identities?.length === 0 && !data.user.invited_at) {
    return { kind: "existing", message: "이미 가입된 이메일입니다." };
  }
  return { kind: "confirmation", message: "가입 요청을 접수했습니다." };
}
