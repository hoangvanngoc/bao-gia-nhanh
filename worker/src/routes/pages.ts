// Báo Giá Nhanh: các trang máy chủ dựng (báo giá chia sẻ, trang in, trang nhận yêu cầu, xác nhận đăng nhập)
import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { esc, normalizeQuote, renderQuoteHtml } from "../../../public/js/core.js";
import { consumeLoginToken } from "../lib/auth";
import { marketingActive } from "../lib/consent";
import { sendMarketingNotice, setMarketing } from "../lib/marketing";
import { entrustLine, notFoundPage, page } from "../lib/pages";
import { ictText, ID_RE, SLUG_RE, TOKEN_RE } from "../lib/util";
import { printPage } from "./api";

const pages = new Hono<AppEnv>();

async function loadQuote(db: D1Database, id: string) {
  if (!ID_RE.test(id)) return null;
  const row = await db
    .prepare("SELECT q.data, q.accepted_at, q.accepted_name, b.slug FROM quotes q JOIN businesses b ON b.id = q.business_id WHERE q.id = ?")
    .bind(id)
    .first<{ data: string; accepted_at: string | null; accepted_name: string | null; slug: string }>();
  if (!row) return null;
  return {
    q: normalizeQuote(JSON.parse(row.data)),
    acceptedAt: row.accepted_at ? ictText(row.accepted_at) : "",
    acceptedName: row.accepted_name ?? "",
    slug: row.slug,
  };
}

// Link chia sẻ khách nhận được
pages.get("/q/:id", async (c) => {
  const r = await loadQuote(c.env.DB, c.req.param("id"));
  if (!r) return c.html(notFoundPage("Không tìm thấy báo giá"), 404);
  const { q } = r;
  const acceptBox = r.acceptedAt
    ? `<p class="accept-done" data-accepted>Báo giá này đã được chấp nhận lúc ${esc(r.acceptedAt)}.</p>`
    : `<form class="accept" data-accept="${esc(c.req.param("id"))}">
  <label>Họ tên người chấp nhận (không bắt buộc)<input name="name" maxlength="60" autocomplete="name"></label>
  <button class="btn" type="submit">Chấp nhận báo giá này</button>
  <p class="sub small">Khi bấm chấp nhận, ${esc(q.supplier.name)} sẽ nhận được thời điểm bạn chấp nhận. Việc này chưa phải là ký hợp đồng hay thanh toán.</p>
  <p class="sub small">Không ghi tên vẫn chấp nhận được. Nếu ghi, tên được lưu cùng báo giá này để làm bằng chứng chấp nhận và bị xóa khi ${esc(q.supplier.name)} xóa báo giá hoặc xóa tài khoản.</p>
  <p class="msg" role="status"></p>
</form>`;
  return c.html(
    page({
      title: `Báo giá ${q.number} từ ${q.supplier.name}`,
      css: ["/css/doc.css"],
      js: ["/js/share.js"],
      bodyClass: "share-page",
      body: `<header class="share-head wrap no-print">
  <div class="share-brand">${q.supplier.logo ? `<img src="${esc(q.supplier.logo)}" alt="${esc(q.supplier.name)}">` : ""}<div><p class="eyebrow">Báo giá ${esc(q.number)}</p><h1 class="page-h">Báo giá từ ${esc(q.supplier.name)}</h1></div></div>
  <div class="share-actions"><a class="btn ghost" href="/q/${esc(c.req.param("id"))}/print">Xem bản in</a></div>
</header>
<main class="wrap share-main">
  <div class="sheet-scroll"><div class="sheet">${renderQuoteHtml(q, { acceptedAt: r.acceptedAt, acceptedName: r.acceptedName })}</div></div>
  <aside class="share-side no-print">${acceptBox}
  <p class="sub small">Cần báo giá cho việc khác? <a href="/r/${esc(r.slug)}">Gửi yêu cầu báo giá tới ${esc(q.supplier.name)}</a></p></aside>
</main>`,
      footer: `Báo giá được tạo bằng <a href="/">Báo Giá Nhanh</a>, miễn phí và không cần đăng ký.`,
    }),
  );
});

pages.get("/q/:id/print", async (c) => {
  const r = await loadQuote(c.env.DB, c.req.param("id"));
  if (!r) return c.html(notFoundPage("Không tìm thấy báo giá"), 404);
  return c.html(printPage(r.q, { acceptedAt: r.acceptedAt, acceptedName: r.acceptedName }));
});

// Trang nhận yêu cầu báo giá của từng đơn vị
pages.get("/r/:slug", async (c) => {
  const slug = c.req.param("slug");
  const b = SLUG_RE.test(slug)
    ? await c.env.DB.prepare("SELECT name, intro, logo, tagline FROM businesses WHERE slug = ?").bind(slug).first<{ name: string; intro: string; logo: string; tagline: string }>()
    : null;
  if (!b) return c.html(notFoundPage("Không tìm thấy trang nhận yêu cầu báo giá"), 404);
  return c.html(
    page({
      title: `Yêu cầu báo giá · ${b.name}`,
      js: ["/js/request.js"],
      body: `<main class="wrap narrow request">
  <div class="share-brand">${b.logo ? `<img src="${esc(b.logo)}" alt="${esc(b.name)}">` : ""}<div><p class="eyebrow">${esc(b.tagline) || "Yêu cầu báo giá"}</p>
  <h1 class="page-h">Gửi yêu cầu báo giá tới ${esc(b.name)}</h1></div></div>
  <p class="sub">${esc(b.intro) || "Hãy cho biết công việc cần làm, thời gian và ngân sách dự kiến. Chúng tôi sẽ xem và gửi báo giá cho bạn."}</p>
  <form class="card form" data-request="${esc(slug)}">
    <label>Họ tên hoặc tên công ty<input name="name" required maxlength="60" autocomplete="name"></label>
    <label>Cách liên hệ (điện thoại, Zalo hoặc email)<input name="contact" required maxlength="100" autocomplete="email"></label>
    <label>Nội dung yêu cầu<textarea name="details" required maxlength="3000" rows="7" placeholder="Ví dụ: làm lại biển hiệu cửa hàng, ngang 3 m, muốn lắp trong tháng 11"></textarea></label>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <fieldset class="consent">
      <legend>Đồng ý xử lý dữ liệu cá nhân (bắt buộc)</legend>
      <p>Mục đích: tư vấn và phản hồi báo giá</p>
      <p>Dữ liệu thu thập: họ tên hoặc tên công ty, cách liên hệ, nội dung yêu cầu. Để chống gửi tràn, địa chỉ IP chỉ được lưu dưới dạng mã băm, không lưu bản gốc</p>
      <p>Bên nhận: ${esc(b.name)}</p>
      <p>Thời gian lưu: tự xóa sau 1 năm kể từ ngày gửi. Xóa sớm hơn nếu ${esc(b.name)} xóa yêu cầu hoặc xóa tài khoản</p>
      ${entrustLine()}
      <p>Bạn có quyền không đồng ý. Khi đó bạn không gửi được yêu cầu qua trang này.</p>
      <label class="check"><input type="checkbox" name="consent" required> Tôi đồng ý với nội dung trên</label>
    </fieldset>
    <button class="btn" type="submit">Gửi yêu cầu báo giá</button>
    <p class="msg" role="status"></p>
  </form>
</main>`,
      footer: `Trang nhận yêu cầu được tạo bằng <a href="/">Báo Giá Nhanh</a>.`,
    }),
  );
});

// Link hủy nhận email giới thiệu (trong email). Bấm là tắt ngay, không cần đăng nhập, không mất phí
async function marketingOff(c: Context<AppEnv>) {
  const t = c.req.query("t") ?? "";
  const acc = TOKEN_RE.test(t)
    ? await c.env.DB.prepare("SELECT id, email, marketing_consent, marketing_consent_at FROM accounts WHERE unsub_token = ?")
        .bind(t)
        .first<{ id: string; email: string; marketing_consent: number; marketing_consent_at: string | null }>()
    : null;
  if (!acc) return c.html(notFoundPage("Link hủy nhận không hợp lệ. Nếu bạn đã xóa tài khoản thì mọi dữ liệu đã bị xóa"), 404);
  if (marketingActive(acc.marketing_consent, acc.marketing_consent_at)) {
    const at = await setMarketing(c.env.DB, acc.id, false);
    const p = sendMarketingNotice(c.env, new URL(c.req.url).origin, acc, "withdraw", at).catch((e) => console.error("marketing notice", e));
    try {
      c.executionCtx.waitUntil(p);
    } catch {
      /* môi trường kiểm thử */
    }
  }
  return c.html(
    page({
      title: "Hủy nhận email giới thiệu",
      body: `<main class="wrap narrow"><h1 class="page-h">Đã tắt email giới thiệu</h1>
<p class="sub">${esc(c.env.OPERATOR_NAME || c.env.APP_NAME)} sẽ không gửi email giới thiệu tới ${esc(acc.email)} nữa. Bạn cũng sẽ nhận email xác nhận. Email đăng nhập và thông báo yêu cầu, chấp nhận báo giá vẫn được gửi như bình thường.</p>
<p><a class="btn ghost" href="/app.html">Hộp báo giá</a></p></main>`,
    }),
  );
}
pages.get("/m/off", marketingOff);
pages.post("/m/off", marketingOff);

// Mở link trong email thì phải bấm thêm một nút (để trình quét bảo mật email mở trước link không dùng mất token)
pages.get("/auth/verify", (c) => {
  const t = c.req.query("t") ?? "";
  if (!TOKEN_RE.test(t)) return c.html(notFoundPage("Link đăng nhập không hợp lệ"), 400);
  return c.html(
    page({
      title: "Đăng nhập",
      body: `<main class="wrap narrow"><h1 class="page-h">Hoàn tất đăng nhập</h1>
<form method="post" action="/auth/verify" class="card form"><input type="hidden" name="t" value="${esc(t)}"><button class="btn" type="submit">Đăng nhập</button></form></main>`,
    }),
  );
});

pages.post("/auth/verify", async (c) => {
  const f = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const ok = await consumeLoginToken(c, String((f as Record<string, unknown>).t ?? ""));
  if (!ok) return c.html(notFoundPage("Link đăng nhập đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới"), 400);
  return c.redirect("/app.html", 303);
});

export default pages;
