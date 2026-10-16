// Báo Giá Nhanh: đăng nhập bằng link email + phiên. Không dùng mật khẩu. Không lưu token gốc, chỉ lưu mã băm
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Account, AppEnv } from "../env";
import { sendMarketingNotice, setMarketing } from "./marketing";
import { randomId, sha256, TOKEN_RE } from "./util";

export const COOKIE = "bgn_s";
const SESSION_DAYS = 30;
const LOGIN_MINUTES = 20;

/** Tìm tài khoản từ cookie hoặc Authorization: Bearer */
export async function loadAccount(c: Context<AppEnv>, next: Next) {
  const bearer = c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer || getCookie(c, COOKIE);
  let account: Account | null = null;
  if (token && TOKEN_RE.test(token)) {
    const row = await c.env.DB.prepare(
      `SELECT a.id, a.email, a.marketing_consent, a.marketing_consent_at FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
      .bind(await sha256(token), Date.now())
      .first<Account>();
    account = row ?? null;
  }
  c.set("account", account);
  await next();
}

export function requireAccount(c: Context<AppEnv>): Account | Response {
  const a = c.get("account");
  if (!a) return c.json({ error: "Bạn cần đăng nhập", login: true }, 401);
  return a;
}

/** Tạo token cho link đăng nhập và trả về token gốc. marketing là đồng ý nhận email (không bắt buộc), chỉ ghi nhận khi đăng nhập xong */
export async function createLoginToken(db: D1Database, accountId: string, marketing = false): Promise<string> {
  const token = randomId(32);
  const now = Date.now();
  await db
    .prepare("INSERT INTO login_tokens (token_hash, account_id, expires_at, created_at, marketing) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256(token), accountId, now + LOGIN_MINUTES * 60_000, now, marketing ? 1 : 0)
    .run();
  return token;
}

/** Dùng token một lần duy nhất rồi đặt cookie phiên. Thành công trả về true */
export async function consumeLoginToken(c: Context<AppEnv>, token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const now = Date.now();
  const row = await c.env.DB.prepare(
    "UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING account_id, marketing",
  )
    .bind(now, await sha256(token), now)
    .first<{ account_id: string; marketing: number }>();
  if (!row) return false;
  const session = randomId(32);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(
      await sha256(session),
      row.account_id,
      now + SESSION_DAYS * 86_400_000,
      now,
    ),
    c.env.DB.prepare("UPDATE accounts SET verified_at = COALESCE(verified_at, ?) WHERE id = ?").bind(new Date().toISOString(), row.account_id),
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    c.env.DB.prepare("DELETE FROM login_tokens WHERE expires_at < ?").bind(now - 86_400_000),
  ]);
  setCookie(c, COOKIE, session, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: SESSION_DAYS * 86_400,
  });
  c.header("X-Session-Token", session); // cho người dùng dòng lệnh / API (trình duyệt dùng cookie)

  // Đồng ý nhận email (không bắt buộc) đánh dấu lúc đăng ký chỉ được ghi nhận lúc này, khi chủ email đã đăng nhập qua link.
  // Đồng ý lại thì hạn 2 năm tính lại từ đầu. Tắt trong hộp báo giá hoặc bằng link trong email
  if (row.marketing) {
    const acc = await c.env.DB.prepare("SELECT id, email FROM accounts WHERE id = ?").bind(row.account_id).first<{ id: string; email: string }>();
    if (acc) {
      const at = await setMarketing(c.env.DB, acc.id, true);
      const p = sendMarketingNotice(c.env, new URL(c.req.url).origin, acc, "consent", at).catch((e) => console.error("marketing notice", e));
      try {
        c.executionCtx.waitUntil(p);
      } catch {
        /* môi trường kiểm thử */
      }
    }
  }
  return true;
}

export async function logout(c: Context<AppEnv>) {
  const token = getCookie(c, COOKIE) || c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (token && TOKEN_RE.test(token)) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
}
