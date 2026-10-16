// Mèo Báo Giá: kiểm thử tích hợp trên máy
// Chuẩn bị: cd worker && npx wrangler d1 migrations apply meo-bao-gia --local && npx wrangler dev --var DEV_MODE:1
// Chạy: node test/e2e-local.mjs http://localhost:8787
import assert from "node:assert/strict";

const BASE = process.argv[2] || "http://localhost:8787";
const RUN = Date.now().toString(36);
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (e) {
    results.push(["FAIL", name, e.message]);
  }
};

async function call(path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

async function login(email, consentMarketing = false) {
  const s = await call("/api/auth/start", { method: "POST", body: { email, consentPrivacy: true, consentMarketing } });
  assert.equal(s.status, 200, s.text);
  assert.ok(s.json.devLink, "link đăng nhập DEV_MODE");
  const t = new URL(s.json.devLink).searchParams.get("t");
  const page = await call(`/auth/verify?t=${t}`);
  assert.equal(page.status, 200);
  const v = await fetch(`${BASE}/auth/verify`, { method: "POST", redirect: "manual", body: new URLSearchParams({ t }) });
  assert.equal(v.status, 303);
  const token = v.headers.get("X-Session-Token");
  assert.ok(token);
  const again = await fetch(`${BASE}/auth/verify`, { method: "POST", redirect: "manual", body: new URLSearchParams({ t }) });
  assert.equal(again.status, 400, "một link không dùng được hai lần");
  return token;
}

const quote = {
  taxMode: "vat",
  vatRate: 10,
  vatIncluded: false,
  date: "2026-10-09",
  validUntil: "2026-11-08",
  supplier: { name: "Nội Thất Mẫu", owner: "Nguyễn Văn A", taxCode: "0100109106", address: "Hà Nội", phone: "0900 000 000" },
  client: { name: "Quán Cà Phê Mẫu" },
  items: [
    { name: "Tháo dỡ", spec: "gói", qty: 1, unitPrice: 800000 },
    { name: "Vách thạch cao", spec: "m2", qty: 12.5, unitPrice: 85000 },
    { name: "Sơn tường", spec: "m2", qty: 40, unitPrice: 15000 },
    { name: "Đèn LED", spec: "bộ", qty: 8, unitPrice: 45000 },
    { name: "Dọn phế thải", spec: "chuyến", qty: 2, unitPrice: 180000 },
  ],
  notes: "Giá chưa gồm VAT",
};

let A, B, qid, slug, rid;

await step("Thiếu đồng ý bắt buộc thì từ chối đăng ký", async () => {
  const r = await call("/api/auth/start", { method: "POST", body: { email: "x@example.com", consentPrivacy: false } });
  assert.equal(r.status, 400);
});
await step("A đăng nhập bằng email", async () => (A = await login(`owner-a-${RUN}@example.com`)));
await step("B đăng nhập bằng email", async () => (B = await login(`owner-b-${RUN}@example.com`)));
await step("Lưu khi chưa đăng nhập trả 401", async () => {
  const r = await call("/api/quotes", { method: "POST", body: quote });
  assert.equal(r.status, 401);
});
await step("A lưu báo giá, số BGYYYYMMDD-NNN", async () => {
  const r = await call("/api/quotes", { method: "POST", token: A, body: quote });
  assert.equal(r.status, 201, r.text);
  assert.match(r.json.number, /^BG\d{8}-\d{3}$/);
  assert.match(r.json.id, /^[A-Za-z0-9_-]{22}$/);
  qid = r.json.id;
  const r2 = await call("/api/quotes", { method: "POST", token: A, body: quote });
  const [d1, n1] = r.json.number.split("-");
  assert.equal(r2.json.number, `${d1}-${String(Number(n1) + 1).padStart(3, "0")}`, "cùng ngày thì số kế tiếp");
});
await step("Máy chủ tự tính lại tiền", async () => {
  const r = await call(`/api/quotes/${qid}`, { token: A });
  assert.equal(r.status, 200);
  // 800.000 + 1.062.500 + 600.000 + 360.000 + 360.000 = 3.182.500 + VAT 318.250
  assert.equal(r.json.total, 3_500_750);
});
await step("Mở link chia sẻ", async () => {
  const r = await call(`/q/${qid}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Ba triệu năm trăm nghìn bảy trăm năm mươi đồng"));
  assert.ok(r.text.includes("data-accept"));
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
});
await step("Trang in", async () => {
  const r = await call(`/q/${qid}/print`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('class="doc"'));
});
await step("Khách chấp nhận, lần hai báo đã chấp nhận", async () => {
  const r = await call(`/api/quotes/${qid}/accept`, { method: "POST", body: { name: "Trần Thị B" } });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.acceptedAt);
  const r2 = await call(`/api/quotes/${qid}/accept`, { method: "POST", body: {} });
  assert.equal(r2.json.already, true);
  const page = await call(`/q/${qid}`);
  assert.ok(page.text.includes("đã được chấp nhận"));
});
await step("Chấp nhận báo giá không tồn tại trả 404", async () => {
  const r = await call(`/api/quotes/AAAAAAAAAAAAAAAAAAAAAA/accept`, { method: "POST", body: {} });
  assert.equal(r.status, 404);
});
await step("A có thông tin đơn vị và trang nhận yêu cầu", async () => {
  const me = await call("/api/me", { token: A });
  slug = me.json.business.slug;
  assert.match(slug, /^[a-z0-9]{10}$/);
  const bad = await call("/api/business", { method: "PUT", token: A, body: { name: "Nội Thất Mẫu", taxCode: "01001091" } });
  assert.equal(bad.status, 400, "mã số thuế sai định dạng bị từ chối");
  const page = await call(`/r/${slug}`);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes("Nội Thất Mẫu"));
});
await step("Yêu cầu báo giá: thiếu đồng ý trả 400, đủ thì nhận", async () => {
  const no = await call(`/api/r/${slug}`, { method: "POST", body: { name: "Khách", contact: "0911 111 222", details: "Sửa bếp", consent: false } });
  assert.equal(no.status, 400);
  const ok = await call(`/api/r/${slug}`, { method: "POST", body: { name: "Khách", contact: "0911 111 222", details: "Nhờ báo giá sửa bếp", consent: true } });
  assert.equal(ok.status, 200, ok.text);
});
await step("Token của A xem được danh sách yêu cầu", async () => {
  const r = await call("/api/requests", { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.json.requests.length, 1);
  rid = r.json.requests[0].id;
  const one = await call(`/api/requests/${rid}`, { token: A });
  assert.equal(one.status, 200);
});
await step("IDOR: token của B không đọc hay xóa được yêu cầu, báo giá của A", async () => {
  const list = await call("/api/requests", { token: B });
  assert.equal(list.json.requests.length, 0);
  assert.equal((await call(`/api/requests/${rid}`, { token: B })).status, 404);
  assert.equal((await call(`/api/requests/${rid}`, { method: "DELETE", token: B })).status, 404);
  assert.equal((await call(`/api/quotes/${qid}`, { token: B })).status, 404);
  assert.equal((await call(`/api/quotes/${qid}`, { method: "DELETE", token: B })).status, 404);
  assert.equal((await call(`/api/quotes`, { token: B })).json.quotes.length, 0);
  assert.equal((await call(`/api/requests/${rid}`, { token: A })).status, 200, "yêu cầu của A vẫn còn");
});
await step("Không token hoặc token giả đều trả 401", async () => {
  assert.equal((await call("/api/requests")).status, 401);
  assert.equal((await call("/api/requests", { token: "x".repeat(43) })).status, 401);
});
await step("Request ghi từ trang khác trả 403", async () => {
  const r = await call(`/api/r/${slug}`, { method: "POST", headers: { Origin: "https://evil.example" }, body: { name: "a", contact: "b", details: "c", consent: true } });
  assert.equal(r.status, 403);
});
await step("Dựng trang in không cần đăng ký", async () => {
  const r = await call("/api/render", { method: "POST", body: { ...quote, client: { name: "<script>alert(1)</script>" } } });
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("&lt;script&gt;"));
  assert.ok(!r.text.includes("<script>alert(1)"));
});
await step("Đồng ý nhận email: mặc định tắt, bật tắt được, có email xác nhận", async () => {
  const me = await call("/api/me", { token: B });
  assert.equal(me.json.marketing, false, "không đánh dấu thì đang tắt");
  const on = await call("/api/me/marketing", { method: "POST", token: B, body: { consent: true } });
  assert.equal(on.json.marketing, true);
  assert.equal(on.json.noticeSent, true);
  assert.ok(on.json.marketingAt);
  assert.equal((await call("/api/me", { token: B })).json.marketing, true);
  const off = await call("/api/me/marketing", { method: "POST", token: B, body: { consent: false } });
  assert.equal(off.json.marketing, false);
  assert.equal(off.json.noticeSent, true, "rút lại cũng có email xác nhận");
  const again = await call("/api/me/marketing", { method: "POST", token: B, body: { consent: false } });
  assert.equal(again.json.noticeSent, false, "đang tắt rồi thì không gửi lại email");
});
await step("Đồng ý đánh dấu lúc đăng ký chỉ bật khi đăng nhập xong qua link", async () => {
  const email = `owner-c-${RUN}@example.com`;
  const s = await call("/api/auth/start", { method: "POST", body: { email, consentPrivacy: true, consentMarketing: true } });
  assert.equal(s.status, 200, s.text);
  const C = await login(email, true);
  assert.equal((await call("/api/me", { token: C })).json.marketing, true, "đăng nhập xong thì bật");
  await call("/api/me/marketing", { method: "POST", token: C, body: { consent: false } });
  // Người khác dùng email của C, đánh dấu đồng ý rồi chỉ yêu cầu email đăng nhập
  const x = await call("/api/auth/start", { method: "POST", body: { email, consentPrivacy: true, consentMarketing: true } });
  assert.equal(x.status, 200, x.text);
  assert.equal((await call("/api/me", { token: C })).json.marketing, false, "không dùng link thì đồng ý không bật");
});
await step("Link hủy nhận: token sai trả 404", async () => {
  assert.equal((await call(`/m/off?t=${"x".repeat(43)}`)).status, 404);
  assert.equal((await call("/m/off")).status, 404);
});
await step("Nội dung xin đồng ý: mục đích, dữ liệu, thời gian lưu, quyền từ chối", async () => {
  const r = await call(`/r/${slug}`);
  for (const s of ["Mục đích", "Dữ liệu thu thập", "Thời gian lưu", "Bạn có quyền không đồng ý"]) assert.ok(r.text.includes(s), s);
  const idx = await call("/");
  for (const s of ["Mục đích", "Thời gian lưu", "Nhận email giới thiệu (không bắt buộc)", "Không đồng ý thì bạn vẫn dùng mọi tính năng"]) assert.ok(idx.text.includes(s), s);
  assert.ok(!/name="consentMarketing"[^>]*checked/.test(idx.text), "ô đồng ý nhận email mặc định không được đánh dấu");
});
await step("Trang yêu cầu không tồn tại trả 404", async () => {
  assert.equal((await call("/r/zzzzzzzzzz")).status, 404);
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed} đạt, ${failed} lỗi`);
process.exit(failed ? 1 : 0);
