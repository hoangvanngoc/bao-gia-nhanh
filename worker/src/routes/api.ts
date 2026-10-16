// Mèo Báo Giá: JSON API (đăng ký, đăng nhập, thông tin đơn vị, lưu / chia sẻ / chấp nhận báo giá, yêu cầu báo giá)
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { calcQuote, checkQuote, digitsOnly, normalizeQuote, renderQuoteHtml, validateTaxCode, vnd } from "../../../public/js/core.js";
import { createLoginToken, logout, requireAccount } from "../lib/auth";
import { marketingActive } from "../lib/consent";
import { mailProvider, sendMail } from "../lib/mail";
import { sendMarketingNotice, setMarketing } from "../lib/marketing";
import { page, privacyUrl } from "../lib/pages";
import { clean, EMAIL_RE, ictText, ictYmd, ID_RE, nowIso, randomId, randomSlug, sha256, SLUG_RE } from "../lib/util";

const api = new Hono<AppEnv>();

const body = async (c: { req: { json: () => Promise<unknown> } }) => {
  const b = await c.req.json().catch(() => null);
  return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
};

const origin = (url: string) => new URL(url).origin;

function later(c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }, p: Promise<unknown>) {
  const safe = p.catch((e) => console.error("background", e));
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    /* môi trường kiểm thử */
  }
}

/* ---------- Đăng ký, đăng nhập ---------- */

api.post("/auth/start", async (c) => {
  const b = await body(c);
  const email = clean(b?.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return c.json({ error: "Hãy kiểm tra lại địa chỉ email" }, 400);
  if (b?.consentPrivacy !== true) return c.json({ error: "Hãy đồng ý xử lý dữ liệu cá nhân (bắt buộc)" }, 400);
  const marketing = b?.consentMarketing === true;
  const now = nowIso();
  const db = c.env.DB;

  let acc = await db.prepare("SELECT id FROM accounts WHERE email = ?").bind(email).first<{ id: string }>();
  if (!acc) {
    acc = { id: randomId() };
    await db
      .prepare("INSERT INTO accounts (id, email, privacy_consent_at, marketing_consent, created_at) VALUES (?, ?, ?, 0, ?)")
      .bind(acc.id, email, now, now)
      .run();
  } else {
    await db.prepare("UPDATE accounts SET privacy_consent_at = ? WHERE id = ?").bind(now, acc.id).run();
  }

  // Cùng một email: tối đa 5 lần mỗi giờ
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE account_id = ? AND created_at > ?")
    .bind(acc.id, Date.now() - 3600_000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return c.json({ error: "Bạn đã yêu cầu email đăng nhập quá nhiều lần. Hãy thử lại sau" }, 429);

  // Đồng ý nhận email giới thiệu (không bắt buộc) chưa bật ngay ở đây. Chỉ bật khi chủ email đăng nhập xong qua link
  // (để không ai bật đồng ý thay cho email của người khác)
  const token = await createLoginToken(db, acc.id, marketing);
  const link = `${origin(c.req.url)}/auth/verify?t=${token}`;
  const text = `Bấm vào link dưới đây để đăng nhập. Link dùng được một lần trong 20 phút.\n\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`;
  await sendMail(c.env, email, `[${c.env.APP_NAME}] Link đăng nhập`, text);

  const dev = c.env.DEV_MODE === "1" && mailProvider(c.env) === "log";
  return c.json({ ok: true, message: "Đã gửi link đăng nhập vào email", ...(dev ? { devLink: link } : {}) });
});

api.post("/auth/logout", async (c) => {
  await logout(c);
  return c.json({ ok: true });
});

/* ---------- Thông tin của tôi ---------- */

type BizRow = {
  id: string;
  slug: string;
  name: string;
  owner: string;
  tax_code: string;
  address: string;
  phone: string;
  email: string;
  bank: string;
  notify_email: string;
  intro: string;
};

const bizOf = (env: Env, accountId: string) =>
  env.DB.prepare("SELECT id, slug, name, owner, tax_code, address, phone, email, bank, notify_email, intro FROM businesses WHERE account_id = ?")
    .bind(accountId)
    .first<BizRow>();

const bizJson = (b: BizRow, base: string) => ({
  slug: b.slug,
  name: b.name,
  owner: b.owner,
  taxCode: b.tax_code,
  address: b.address,
  phone: b.phone,
  email: b.email,
  bank: b.bank,
  notifyEmail: b.notify_email,
  intro: b.intro,
  requestUrl: `${base}/r/${b.slug}`,
});

api.get("/me", async (c) => {
  const a = c.get("account");
  if (!a) return c.json({ login: false });
  const b = await bizOf(c.env, a.id);
  const marketing = marketingActive(a.marketing_consent, a.marketing_consent_at);
  return c.json({
    login: true,
    email: a.email,
    marketing,
    marketingAt: marketing ? a.marketing_consent_at : null,
    business: b ? bizJson(b, origin(c.req.url)) : null,
  });
});

api.post("/me/marketing", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const on = (await body(c))?.consent === true;
  const was = marketingActive(a.marketing_consent, a.marketing_consent_at);
  const at = await setMarketing(c.env.DB, a.id, on);
  // Đồng ý hoặc rút lại thì gửi email xác nhận kết quả
  const notice = on || was;
  if (notice) later(c, sendMarketingNotice(c.env, origin(c.req.url), a, on ? "consent" : "withdraw", at));
  return c.json({ ok: true, marketing: on, marketingAt: on ? at : null, noticeSent: notice });
});

// Xóa tài khoản: xóa luôn thông tin đơn vị, báo giá, yêu cầu báo giá
api.post("/me/delete", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  await c.env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(a.id).run();
  await logout(c);
  return c.json({ ok: true });
});

function readBusiness(b: Record<string, unknown>) {
  const v = {
    name: clean(b.name, 120),
    owner: clean(b.owner, 60),
    taxCode: digitsOnly(b.taxCode).slice(0, 14),
    address: clean(b.address, 200),
    phone: clean(b.phone, 40),
    email: clean(b.email, 120),
    bank: clean(b.bank, 160),
    notifyEmail: clean(b.notifyEmail, 254).toLowerCase(),
    intro: clean(b.intro, 500),
  };
  if (!v.name) return { error: "Hãy nhập tên đơn vị" };
  if (v.taxCode && !validateTaxCode(v.taxCode)) return { error: "Mã số thuế phải có 10, 12 hoặc 13 chữ số" };
  if (v.notifyEmail && !EMAIL_RE.test(v.notifyEmail)) return { error: "Hãy kiểm tra lại email nhận thông báo" };
  return { v };
}

async function upsertBusiness(env: Env, accountId: string, v: NonNullable<ReturnType<typeof readBusiness>["v"]>) {
  const now = nowIso();
  const existing = await bizOf(env, accountId);
  if (existing) {
    await env.DB.prepare(
      "UPDATE businesses SET name=?, owner=?, tax_code=?, address=?, phone=?, email=?, bank=?, notify_email=?, intro=?, updated_at=? WHERE id=?",
    )
      .bind(v.name, v.owner, v.taxCode, v.address, v.phone, v.email, v.bank, v.notifyEmail, v.intro, now, existing.id)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO businesses (id, account_id, slug, name, owner, tax_code, address, phone, email, bank, notify_email, intro, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(randomId(), accountId, randomSlug(), v.name, v.owner, v.taxCode, v.address, v.phone, v.email, v.bank, v.notifyEmail, v.intro, now, now)
      .run();
  }
  return (await bizOf(env, accountId))!;
}

api.put("/business", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const r = readBusiness((await body(c)) ?? {});
  if (!r.v) return c.json({ error: r.error }, 400);
  const b = await upsertBusiness(c.env, a.id, r.v);
  return c.json({ ok: true, business: bizJson(b, origin(c.req.url)) });
});

/* ---------- Báo giá ---------- */

// Chỉ trả về trang in (không lưu, không cần đăng ký). Nhận JSON hoặc form quote=<JSON>
api.post("/render", async (c) => {
  let raw: unknown = null;
  const type = c.req.header("Content-Type") || "";
  if (type.includes("application/json")) raw = await c.req.json().catch(() => null);
  else {
    const f = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    try {
      raw = JSON.parse(String((f as Record<string, unknown>).quote ?? "null"));
    } catch {
      raw = null;
    }
  }
  if (!raw) return c.json({ error: "Không có nội dung báo giá" }, 400);
  const q = normalizeQuote(raw);
  try {
    return c.html(printPage(q));
  } catch {
    return c.json({ error: "Số tiền quá lớn" }, 400);
  }
});

export function printPage(q: ReturnType<typeof normalizeQuote>, opts: { acceptedAt?: string; acceptedName?: string } = {}) {
  return page({
    title: `Báo giá ${q.number || ""} ${q.client.name}`.trim(),
    css: ["/css/doc.css"],
    js: ["/js/print.js"],
    bodyClass: "print-page",
    body: `<div class="print-bar no-print"><button class="btn" type="button" data-print>In hoặc lưu PDF</button><span class="sub">Trong hộp thoại in, chọn "Lưu dưới dạng PDF" để tải về tệp PDF.</span></div>
<div class="sheet-scroll"><div class="sheet">${renderQuoteHtml(q, opts)}</div></div>`,
  });
}

api.post("/quotes", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const q = normalizeQuote(await body(c));
  const errs = checkQuote(q);
  if (errs.length) return c.json({ error: errs[0], errors: errs }, 400);
  let totals;
  try {
    totals = calcQuote(q);
  } catch {
    return c.json({ error: "Số tiền quá lớn" }, 400);
  }

  // Chưa có thông tin đơn vị thì tạo từ thông tin bên báo giá trong báo giá
  let biz = await bizOf(c.env, a.id);
  if (!biz) {
    const r = readBusiness({ ...q.supplier });
    if (!r.v) return c.json({ error: r.error }, 400);
    biz = await upsertBusiness(c.env, a.id, r.v);
  }

  // Số báo giá: BGYYYYMMDD-NNN (theo từng đơn vị, ngày theo giờ Việt Nam)
  const ymd = ictYmd();
  const seq = await c.env.DB.prepare(
    "UPDATE businesses SET seq = CASE WHEN seq_date = ?1 THEN seq + 1 ELSE 1 END, seq_date = ?1 WHERE id = ?2 RETURNING seq",
  )
    .bind(ymd, biz.id)
    .first<{ seq: number }>();
  q.number = `BG${ymd}-${String(seq!.seq).padStart(3, "0")}`;

  const id = randomId();
  const total = q.taxMode === "freelancer" ? totals.sum : totals.total;
  await c.env.DB.prepare(
    "INSERT INTO quotes (id, business_id, number, data, total, client_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, biz.id, q.number, JSON.stringify(q), total, q.client.name, nowIso())
    .run();
  return c.json({ ok: true, id, number: q.number, url: `${origin(c.req.url)}/q/${id}` }, 201);
});

api.get("/quotes", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const { results } = await c.env.DB.prepare(
    `SELECT q.id, q.number, q.client_name, q.total, q.created_at, q.accepted_at FROM quotes q
     JOIN businesses b ON b.id = q.business_id WHERE b.account_id = ? ORDER BY q.created_at DESC LIMIT 200`,
  )
    .bind(a.id)
    .all();
  return c.json({ quotes: results });
});

// Một báo giá của tôi (báo giá của tài khoản khác trả 404)
api.get("/quotes/:id", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
  const row = await c.env.DB.prepare(
    `SELECT q.id, q.number, q.data, q.total, q.created_at, q.accepted_at, q.accepted_name FROM quotes q
     JOIN businesses b ON b.id = q.business_id WHERE q.id = ? AND b.account_id = ?`,
  )
    .bind(id, a.id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ...row, data: JSON.parse(String(row.data)) });
});

api.delete("/quotes/:id", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
  const r = await c.env.DB.prepare("DELETE FROM quotes WHERE id = ? AND business_id IN (SELECT id FROM businesses WHERE account_id = ?)")
    .bind(id, a.id)
    .run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

// Khách bấm "Chấp nhận" trên link chia sẻ. Chỉ ai có link (= id báo giá) mới làm được
api.post("/quotes/:id/accept", async (c) => {
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
  const name = clean((await body(c))?.name, 60);
  const now = nowIso();
  const row = await c.env.DB.prepare(
    "UPDATE quotes SET accepted_at = ?, accepted_name = ? WHERE id = ? AND accepted_at IS NULL RETURNING business_id, number, client_name, total",
  )
    .bind(now, name || null, id)
    .first<{ business_id: string; number: string; client_name: string; total: number }>();
  if (!row) {
    const exists = await c.env.DB.prepare("SELECT accepted_at FROM quotes WHERE id = ?").bind(id).first<{ accepted_at: string }>();
    if (!exists) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, already: true, acceptedAt: ictText(exists.accepted_at) });
  }
  const to = await notifyAddress(c.env, row.business_id);
  if (to) {
    const text = [
      `Khách hàng đã chấp nhận báo giá.`,
      ``,
      `Số báo giá: ${row.number}`,
      `Khách hàng: ${row.client_name}${name ? ` (người chấp nhận: ${name})` : ""}`,
      `Giá trị: ${vnd(row.total)} đ`,
      `Thời điểm: ${ictText(now)} (giờ Việt Nam)`,
      ``,
      `${origin(c.req.url)}/q/${id}`,
    ].join("\n");
    later(c, sendMail(c.env, to, `[${c.env.APP_NAME}] Báo giá được chấp nhận: ${row.client_name} ${row.number}`, text));
  }
  return c.json({ ok: true, acceptedAt: ictText(now) });
});

async function notifyAddress(env: Env, businessId: string): Promise<string | null> {
  const r = await env.DB.prepare("SELECT b.notify_email, a.email FROM businesses b JOIN accounts a ON a.id = b.account_id WHERE b.id = ?")
    .bind(businessId)
    .first<{ notify_email: string; email: string }>();
  return r ? r.notify_email || r.email : null;
}

/* ---------- Yêu cầu báo giá (khách -> đơn vị) ---------- */

api.post("/r/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!SLUG_RE.test(slug)) return c.json({ error: "not found" }, 404);
  const b = await body(c);
  if (!b) return c.json({ error: "Yêu cầu không hợp lệ" }, 400);
  if (b.website) return c.json({ ok: true }); // ô ẩn, chỉ bot mới điền
  const name = clean(b.name, 60);
  const contact = clean(b.contact, 100);
  const details = clean(b.details, 3000);
  if (!name || !contact || !details) return c.json({ error: "Hãy nhập đủ tên, cách liên hệ và nội dung yêu cầu" }, 400);
  if (b.consent !== true) return c.json({ error: "Hãy đồng ý xử lý dữ liệu cá nhân" }, 400);

  const biz = await c.env.DB.prepare("SELECT id, name FROM businesses WHERE slug = ?").bind(slug).first<{ id: string; name: string }>();
  if (!biz) return c.json({ error: "not found" }, 404);

  const ipHash = await sha256(`mbg-ip:${c.req.header("CF-Connecting-IP") || "local"}`);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const [byIp, byBiz] = await c.env.DB.batch<{ n: number }>([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE ip_hash = ? AND created_at > ?").bind(ipHash, since),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE business_id = ? AND created_at > ?").bind(biz.id, day),
  ]);
  if ((byIp.results[0]?.n ?? 0) >= 5 || (byBiz.results[0]?.n ?? 0) >= 100) {
    return c.json({ error: "Có quá nhiều yêu cầu. Hãy thử lại sau ít phút" }, 429);
  }

  const id = randomId();
  const now = nowIso();
  await c.env.DB.prepare("INSERT INTO requests (id, business_id, name, contact, details, consent_at, ip_hash, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, biz.id, name, contact, details, now, ipHash, now)
    .run();

  const to = await notifyAddress(c.env, biz.id);
  if (to) {
    const text = `Bạn có yêu cầu báo giá mới.\n\nTên: ${name}\nLiên hệ: ${contact}\nThời điểm: ${ictText(now)} (giờ Việt Nam)\n\n${details}\n\nHộp báo giá: ${origin(c.req.url)}/app.html`;
    later(c, sendMail(c.env, to, `[${c.env.APP_NAME}] Yêu cầu báo giá mới: ${name}`, text));
  }
  return c.json({ ok: true });
});

api.get("/requests", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.name, r.contact, r.details, r.created_at FROM requests r
     JOIN businesses b ON b.id = r.business_id WHERE b.account_id = ? ORDER BY r.created_at DESC LIMIT 200`,
  )
    .bind(a.id)
    .all();
  return c.json({ requests: results });
});

api.get("/requests/:id", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
  const row = await c.env.DB.prepare(
    `SELECT r.id, r.name, r.contact, r.details, r.created_at FROM requests r
     JOIN businesses b ON b.id = r.business_id WHERE r.id = ? AND b.account_id = ?`,
  )
    .bind(id, a.id)
    .first();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

api.delete("/requests/:id", async (c) => {
  const a = requireAccount(c);
  if (a instanceof Response) return a;
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
  const r = await c.env.DB.prepare("DELETE FROM requests WHERE id = ? AND business_id IN (SELECT id FROM businesses WHERE account_id = ?)")
    .bind(id, a.id)
    .run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

api.get("/config", (c) => c.json({ appName: c.env.APP_NAME, ctaUrl: c.env.CTA_URL, privacyUrl: privacyUrl(c.env) }));

export default api;
