// Mèo Báo Giá: gửi email qua Gmail API (Google Workspace) hoặc Resend. Không có cả hai thì chỉ ghi log
// Thứ tự chọn: đủ GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN thì dùng Gmail, không thì có RESEND_API_KEY dùng Resend
import type { Env } from "../env";
import { b64url, buildMime, textToHtml } from "./mime";

export type MailOptions = {
  replyTo?: string;
  /** Link hủy nhận. Có thì gắn header List-Unsubscribe và List-Unsubscribe-Post (hủy bằng một cú bấm) */
  unsubscribeUrl?: string;
};

export const mailProvider = (env: Env): "gmail" | "resend" | "log" =>
  env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN ? "gmail" : env.RESEND_API_KEY ? "resend" : "log";

export async function sendMail(env: Env, to: string, subject: string, text: string, opts: MailOptions = {}): Promise<void> {
  const provider = mailProvider(env);
  if (provider === "log") {
    console.log(`[mail skipped] to=${to} subject=${subject}\n${text}`);
    return;
  }
  const html = textToHtml(text);
  const headers: Record<string, string> = {};
  if (opts.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${opts.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  if (provider === "gmail") {
    const raw = buildMime({ from: env.MAIL_FROM, to, subject, text, html, replyTo: opts.replyTo, headers });
    return gmailSend(env, raw);
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text, html, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}), headers }),
  });
  if (!res.ok) throw new Error(`resend ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/* ---------- Gmail API ---------- */

// Access token giữ trong bộ nhớ của instance Worker tới 1 phút trước khi hết hạn (không giữ secret gốc)
let cached: { token: string; until: number; key: string } | null = null;

async function gmailAccessToken(env: Env): Promise<string> {
  const key = env.GMAIL_CLIENT_ID!;
  if (cached && cached.key === key && cached.until > Date.now()) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      refresh_token: env.GMAIL_REFRESH_TOKEN!,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`gmail token ${res.status} ${data.error ?? ""}`.trim());
  cached = { token: data.access_token, until: Date.now() + Math.max(0, (data.expires_in ?? 3600) - 60) * 1000, key };
  return data.access_token;
}

async function gmailSend(env: Env, raw: string): Promise<void> {
  const send = (token: string) =>
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(raw) }),
    });
  let res = await send(await gmailAccessToken(env));
  if (res.status === 401) {
    // Token hết hạn sớm thì lấy lại đúng một lần
    cached = null;
    res = await send(await gmailAccessToken(env));
  }
  if (!res.ok) throw new Error(`gmail send ${res.status} ${(await res.text()).slice(0, 200)}`);
}
