// Báo Giá Nhanh: công cụ làm báo giá cho hộ kinh doanh, doanh nghiệp nhỏ, freelancer Việt Nam, kèm trang nhận yêu cầu báo giá
// Giao diện tĩnh (trình soạn, hộp báo giá) phục vụ từ ../public, Worker này lo API và trang chia sẻ, trang yêu cầu.
import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { loadAccount } from "./lib/auth";
import { dailyCleanup } from "./lib/marketing";
import { notFoundPage, privacyUrl, setPrivacyUrl } from "./lib/pages";
import api from "./routes/api";
import pages from "./routes/pages";

const app = new Hono<AppEnv>();

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

// Header bảo mật. Chặn Referrer để địa chỉ link chia sẻ không lọt sang trang khác
app.use("*", async (c, next) => {
  setPrivacyUrl(privacyUrl(c.env));
  await next();
  c.header("Content-Security-Policy", CSP);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  if (/^\/(api|auth|m)\//.test(c.req.path)) c.header("Cache-Control", "no-store");
  if (/^\/(q|r|auth|m)\//.test(c.req.path)) c.header("X-Robots-Tag", "noindex, nofollow");
});

// Giới hạn số request theo người truy cập
app.use("*", async (c, next) => {
  if (c.env.LIMITER && c.req.method !== "GET") {
    const key = c.req.header("CF-Connecting-IP") || "local";
    const { success } = await c.env.LIMITER.limit({ key });
    if (!success) return c.json({ error: "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút" }, 429);
  }
  await next();
});

// Không nhận request ghi gửi từ trang khác (lớp chặn thứ hai, ngoài cookie SameSite=Lax)
app.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const o = c.req.header("Origin");
    // Do Referrer-Policy: no-referrer, form cùng trang (xác nhận đăng nhập, hủy nhận) cũng gửi Origin "null".
    // Khi đó dựa vào header Sec-Fetch-Site do trình duyệt gắn để biết có cùng trang không
    if (o === "null") {
      if (c.req.header("Sec-Fetch-Site") !== "same-origin") return c.json({ error: "origin not allowed" }, 403);
    } else if (o && o !== new URL(c.req.url).origin) return c.json({ error: "origin not allowed" }, 403);
  }
  await next();
});

app.use("*", loadAccount);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/api", api);
app.route("/", pages);

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.html(notFoundPage(), 404)));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Có lỗi xảy ra. Hãy thử lại sau ít phút" }, 500);
});

export default {
  fetch: app.fetch,
  // Dọn dẹp hằng ngày: xóa yêu cầu báo giá và email chưa xác minh đã quá hạn, tắt đồng ý nhận email quá 2 năm (wrangler.toml [triggers])
  async scheduled(_ctrl: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dailyCleanup(env));
  },
};
