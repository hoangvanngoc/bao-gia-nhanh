// Báo Giá Nhanh: lưu đồng ý nhận email giới thiệu, link hủy nhận, email xác nhận kết quả, tác vụ dọn dẹp hằng ngày
import type { Env } from "../env";
import { marketingCutoffIso, marketingNotice, REQUEST_TTL_MS, UNVERIFIED_TTL_MS, type NoticeKind } from "./consent";
import { sendMail } from "./mail";
import { ictText, nowIso, randomId } from "./util";

/** Token hủy nhận của tài khoản, chưa có thì tạo. Token này chỉ dùng được để tắt đồng ý nhận email */
export async function unsubToken(db: D1Database, accountId: string): Promise<string> {
  const row = await db
    .prepare("UPDATE accounts SET unsub_token = COALESCE(unsub_token, ?) WHERE id = ? RETURNING unsub_token")
    .bind(randomId(32), accountId)
    .first<{ unsub_token: string }>();
  return row!.unsub_token;
}

/** Bật hoặc tắt đồng ý và ghi lại thời điểm. Hạn 2 năm tính từ thời điểm bật */
export async function setMarketing(db: D1Database, accountId: string, on: boolean): Promise<string> {
  const at = nowIso();
  await db.prepare("UPDATE accounts SET marketing_consent = ?, marketing_consent_at = ? WHERE id = ?").bind(on ? 1 : 0, at, accountId).run();
  return at;
}

/** Gửi email xác nhận đồng ý / rút lại / hết hạn. Chưa cấu hình gửi mail thì sendMail chỉ ghi log */
export async function sendMarketingNotice(env: Env, base: string, acc: { id: string; email: string }, kind: NoticeKind, at: string) {
  const offUrl = kind === "consent" && base ? `${base}/m/off?t=${await unsubToken(env.DB, acc.id)}` : undefined;
  const m = marketingNotice({
    kind,
    when: ictText(at),
    email: acc.email,
    app: env.APP_NAME,
    operator: env.OPERATOR_NAME || env.APP_NAME,
    contact: env.CTA_URL,
    appUrl: base ? `${base}/app.html` : "",
    offUrl,
  });
  await sendMail(env, acc.email, m.subject, m.text, { unsubscribeUrl: offUrl });
}

/**
 * Dọn dẹp hằng ngày (cron trong wrangler.toml, 10 giờ sáng giờ Việt Nam)
 * - Xóa yêu cầu báo giá đã quá 1 năm
 * - Xóa email đăng ký không hoàn tất đăng nhập trong 7 ngày
 * - Tắt đồng ý nhận email đã quá 2 năm và gửi email xác nhận
 */
export async function dailyCleanup(env: Env, now = Date.now()) {
  const db = env.DB;
  await db.batch([
    db.prepare("DELETE FROM requests WHERE created_at < ?").bind(new Date(now - REQUEST_TTL_MS).toISOString()),
    db.prepare("DELETE FROM accounts WHERE verified_at IS NULL AND created_at < ?").bind(new Date(now - UNVERIFIED_TTL_MS).toISOString()),
  ]);
  const at = new Date(now).toISOString();
  const { results } = await db
    .prepare("UPDATE accounts SET marketing_consent = 0, marketing_consent_at = ? WHERE marketing_consent = 1 AND marketing_consent_at < ? RETURNING id, email")
    .bind(at, marketingCutoffIso(now))
    .all<{ id: string; email: string }>();
  const base = (env.APP_URL || "").replace(/\/+$/, "");
  for (const a of results) await sendMarketingNotice(env, base, a, "expired", at).catch((e) => console.error("marketing notice", e));
}
