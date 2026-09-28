import "server-only";
import nodemailer from "nodemailer";
import { createSupabaseAdminClient } from "../supabase/admin";
import type { CsTurn } from "./session";

/**
 * **문의를 남긴다**(2026-09-23 사용자 결정, 설계 §10).
 *
 * > 직접 문의를 원할 경우에는 관리자화면에 문의 내용과 로그를 기록하게 하고,
 * > ai.dev@fixupworld.com 으로 메일을 받을 수 있게 하세요.
 *
 * ── 왜 둘 다인가 ───────────────────────────────────────────
 *
 * 메일은 **빨리 알기** 위한 것이고 표는 **남기기** 위한 것이다. 메일만 두면
 * 지워지거나 묻히고, 표만 두면 아무도 안 본다.
 *
 * ── 순서가 중요하다 ────────────────────────────────────────
 *
 * **표에 먼저 넣고 그다음 보낸다.** 메일 발송 실패가 문의 접수를 막으면
 * 안 된다 — SMTP 가 잠깐 죽었다고 사용자의 문의가 사라지면, 그 사람은
 * 보냈다고 믿고 답을 기다린다.
 *
 * 못 보냈으면 `mailed_at` 이 빈 채로 남고 관리자 화면이 그것을 보여 준다.
 */

/** 받는 곳. 바뀔 때 배포가 필요하면 안 되므로 환경변수로 둔다. */
const 기본받는곳 = "ai.dev@fixupworld.com";

export interface InquiryInput {
  userId: string;
  email: string;
  question: string;
  turns: readonly CsTurn[];
  /** 봇이 찾은 근거. **빈 배열이면 못 찾았다는 뜻이다.** */
  sources: ReadonlyArray<{ name: string; href: string }>;
  page?: string;
}

export interface InquiryResult {
  ok: boolean;
  /** 표에는 들어갔는가. 메일과 따로 본다. */
  saved: boolean;
  mailed: boolean;
  /** 같은 물음을 이미 받았나. 사용자에게는 받은 것이 맞다. */
  duplicate?: boolean;
  message: string;
}

/**
 * **한 시간에 몇 건까지.**
 *
 * 이 라우트는 일부러 사용량 예약을 안 쓴다(답을 못 받아 온 사람을 한도로
 * 막으면 안 된다). 그래서 `reserve_generation` 의 시간당 셈이 안 걸리고,
 * **막는 것이 아무것도 없다** — 단추를 누르는 만큼 사람의 메일함에 쌓인다
 * (2026-09-28 독립 검토).
 *
 * 10 은 사람이 한 시간에 낼 문의로 넉넉하다. 환경변수로 바꿀 수 있다.
 */
const 기본시간당 = 10;

function 시간당한도(env: Record<string, string | undefined> = process.env): number {
  const 적힌것 = env.CS_INQUIRY_HOURLY_LIMIT;
  const 수 = Number(적힌것 ?? "");
  // 빈 글자는 `Number("")` 가 0 이라 그냥 쓰면 한도가 0 이 되어 다 막힌다.
  if (!적힌것 || !Number.isFinite(수)) return 기본시간당;
  return Math.min(100, Math.max(1, Math.floor(수)));
}

/** 대화가 길면 메일이 읽기 어렵다. 최근 것만 싣는다. */
const 메일에실을말 = 12;

function 메일본문(input: InquiryInput, id: string): string {
  const 대화 = input.turns
    .slice(-메일에실을말)
    .map((turn) => `${turn.role === "user" ? "사용자" : "도우미"}: ${turn.text}`)
    .join("\n");

  const 근거 = input.sources.length
    ? input.sources.map((s) => `  - ${s.name} ${s.href}`).join("\n")
    : input.turns.length === 0
      // 대화가 지워진 뒤 남긴 문의다. 근거가 없는 것과 알 수 없는 것을 가른다.
      ? "  (대화가 남아 있지 않아 알 수 없습니다.)"
      : "  (봇이 근거를 찾지 못했습니다. 설명서에 그 글이 없다는 뜻일 수 있습니다.)";

  const 사이트 = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

  return [
    `보낸 사람: ${input.email}`,
    `화면: ${input.page || "(모름)"}`,
    "",
    "── 물음 ──",
    input.question,
    "",
    "── 그때까지의 대화 ──",
    대화 || "(없음)",
    "",
    "── 봇이 찾은 근거 ──",
    근거,
    "",
    사이트 ? `관리자 화면: ${사이트}/admin/system#cs-${id}` : "",
  ].filter(Boolean).join("\n");
}

async function 메일보낸다(input: InquiryInput, id: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 465);
  if (!host || !user || !pass || !Number.isFinite(port)) return false;

  try {
    const transport = nodemailer.createTransport({
      host, port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || user,
      to: process.env.CS_INQUIRY_EMAIL?.trim() || 기본받는곳,
      // 답장하면 그 사람에게 바로 간다.
      replyTo: input.email,
      subject: `[FormWith] 문의 · ${input.email}`,
      text: 메일본문(input, id),
    });
    return true;
  } catch (error) {
    // 메일이 안 가도 문의는 남는다. 조용히 넘기지 않고 로그에 적는다.
    console.warn("[cs] 문의 메일을 못 보냈습니다", error);
    return false;
  }
}

/**
 * **이미 받은 것인가, 너무 자주 오는가.**
 *
 * 한 번 읽어 둘 다 본다. **못 읽으면 통과시킨다** — 이 검사는 편의이고 문의를
 * 남기는 것이 목적이다. 검사가 안 되면 문의를 버리는 쪽이 더 나쁘다.
 */
async function 최근것(
  db: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
): Promise<{ questions: string[]; count: number } | null> {
  const 한시간전 = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("cs_inquiries")
    .select("question")
    .eq("user_id", userId)
    .gte("created_at", 한시간전);

  if (error || !data) return null;
  const rows = data as Array<{ question?: unknown }>;
  return {
    questions: rows.map((row) => String(row.question ?? "")),
    count: rows.length,
  };
}

export async function saveInquiry(input: InquiryInput): Promise<InquiryResult> {
  const db = createSupabaseAdminClient();

  const 최근 = await 최근것(db, input.userId);
  if (최근) {
    /*
      **같은 물음은 한 번만 남긴다.** 보냈는지 몰라 다시 누르는 일이 잦고,
      그때마다 줄이 늘면 담당자가 같은 것을 세 번 읽는다. 사용자에게는
      「받았다」가 맞는 말이라 실패로 알리지 않는다.
    */
    if (최근.questions.includes(input.question)) {
      return {
        ok: true, saved: false, mailed: false, duplicate: true,
        message: "이미 받은 문의입니다. 확인하고 답해 드리겠습니다.",
      };
    }
    const 한도 = 시간당한도();
    if (최근.count >= 한도) {
      return {
        ok: false, saved: false, mailed: false,
        message: `한 시간에 ${한도}건까지 남길 수 있습니다. 잠시 후 다시 시도해 주세요.`,
      };
    }
  }

  const { data, error } = await db
    .from("cs_inquiries")
    .insert({
      user_id: input.userId,
      question: input.question,
      /*
        **적힌 모양대로 넣는다**(202609280002 주석: `[{"role":…,"text":…}]`).
        말에 붙은 근거는 `evidence` 가 따로 들고 있으므로, 여기 또 넣으면
        같은 주소가 두 군데 남아 나중에 어느 쪽이 참인지 헷갈린다.
      */
      transcript: input.turns.map(({ role, text }) => ({ role, text })),
      evidence: input.sources,
      page: input.page ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false, saved: false, mailed: false,
      message: `문의를 남기지 못했습니다: ${error?.message ?? "알 수 없는 까닭"}`,
    };
  }

  const id = String(data.id);
  const mailed = await 메일보낸다(input, id);
  if (mailed) {
    /*
      **이 실패를 조용히 넘기면 거짓이 남는다.** 갱신이 안 되면 `mailed_at` 이
      빈 채 남고, 관리자 화면은 「메일 못 보냄」을 붙인다 — 담당자는 이미 받은
      메일을 못 받은 것으로 읽는다. 응답의 `mailed` 와도 어긋난다.
    */
    const { error: 갱신오류 } = await db
      .from("cs_inquiries")
      .update({ mailed_at: new Date().toISOString() })
      .eq("id", id);
    if (갱신오류) console.warn("[cs] 메일 보낸 때를 못 적었습니다", id, 갱신오류.message);
  }

  /*
    **메일을 못 보냈어도 성공이다.** 사용자에게 중요한 것은 「내 문의가
    접수됐는가」이고, 그것은 표에 들어간 순간 참이다. 메일은 담당자가 빨리
    아는 수단일 뿐이다.
  */
  return {
    ok: true, saved: true, mailed,
    message: "문의를 남겼습니다. 확인하고 답해 드리겠습니다.",
  };
}
