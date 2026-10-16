// Báo Giá Nhanh: hộp báo giá
import { brandPicker } from "./brand.js";
import { esc, formatTaxCode, LOGO_MAX, validateTaxCode, vnd } from "./core.js";
import { logoFromFile } from "./image.js";

const $ = (s) => document.querySelector(s);
const api = async (path, opts = {}) => {
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Không xử lý được yêu cầu"), { status: res.status });
  return data;
};
const when = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const BIZ_FIELDS = ["name", "owner", "taxCode", "address", "phone", "email", "bank", "tagline", "website", "notifyEmail", "intro"];
// Logo và màu không phải ô nhập chữ nên giữ riêng
const brand = { logo: "", brandColor: "" };

function renderLogo() {
  const img = $("[data-logo-preview]");
  img.hidden = !brand.logo;
  $("[data-logo-clear]").hidden = !brand.logo;
  if (brand.logo) img.src = brand.logo;
}
const refreshBrand = brandPicker($("[data-swatches]"), $("[data-color-hint]"), () => brand.brandColor, (c) => (brand.brandColor = c));

$("[data-logo-file]").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const hint = $("[data-logo-hint]");
  try {
    brand.logo = await logoFromFile(file, LOGO_MAX);
    hint.className = "hint";
    hint.textContent = 'Bấm "Lưu" để cập nhật logo.';
  } catch (err) {
    hint.className = "hint bad";
    hint.textContent = err.message;
  }
  e.target.value = "";
  renderLogo();
});
$("[data-logo-clear]").addEventListener("click", () => {
  brand.logo = "";
  renderLogo();
});

async function start() {
  fetch("/api/config")
    .then((r) => r.json())
    .then((c) => {
      if (c.ctaUrl) document.querySelectorAll("[data-cta]").forEach((a) => (a.href = c.ctaUrl));
      if (c.privacyUrl) document.querySelectorAll("[data-privacy]").forEach((a) => (a.href = c.privacyUrl));
    })
    .catch(() => {});
  const me = await api("/api/me");
  if (!me.login) {
    $("#login").hidden = false;
    return;
  }
  $("#dash").hidden = false;
  $("[data-email]").textContent = me.email;
  $("#marketing").checked = me.marketing;
  showBusiness(me.business);
  loadRequests();
  loadQuotes();
}

function showBusiness(b) {
  const f = $("#biz-form").elements;
  if (b) for (const k of BIZ_FIELDS) f[k].value = b[k] ?? "";
  if (b) f.taxCode.value = formatTaxCode(b.taxCode);
  if (b) Object.assign(brand, { logo: b.logo || "", brandColor: b.brandColor || "" });
  renderLogo();
  refreshBrand();
  $("[data-req-link]").innerHTML = b
    ? `<p class="sub small">Gắn địa chỉ này lên Facebook, Zalo OA, website hoặc bio Instagram. Khách tự gửi yêu cầu báo giá, có yêu cầu mới bạn sẽ nhận email.</p>
       <div class="copy-row"><input readonly value="${esc(b.requestUrl)}" aria-label="Địa chỉ trang nhận yêu cầu báo giá"><a class="btn small" href="${esc(b.requestUrl)}" target="_blank" rel="noopener">Mở</a></div>`
    : `<p class="empty">Lưu thông tin đơn vị để có địa chỉ trang nhận yêu cầu báo giá.</p>`;
}

async function loadRequests() {
  const { requests } = await api("/api/requests");
  $("#requests").innerHTML = requests.length
    ? requests
        .map(
          (r) => `<li data-id="${esc(r.id)}"><div class="top"><span>${esc(r.name)}</span><span class="meta">${when(r.created_at)}</span></div>
          <span class="meta">${esc(r.contact)}</span><p class="details">${esc(r.details)}</p>
          <div class="row-actions"><button class="btn link" type="button" data-del-req>Xóa</button></div></li>`,
        )
        .join("")
    : `<li><p class="empty">Chưa có yêu cầu nào.</p></li>`;
}

async function loadQuotes() {
  const { quotes } = await api("/api/quotes");
  $("#quotes").innerHTML = quotes.length
    ? quotes
        .map(
          (q) => `<li data-id="${esc(q.id)}"><div class="top"><span>${esc(q.number)} · ${esc(q.client_name)}</span><span>${vnd(q.total)} đ</span></div>
          <span class="meta">${when(q.created_at)} ${q.accepted_at ? `<span class="badge ok">Đã chấp nhận ${when(q.accepted_at)}</span>` : `<span class="badge">Chờ khách phản hồi</span>`}</span>
          <div class="row-actions"><a href="/q/${esc(q.id)}" target="_blank" rel="noopener">Mở link chia sẻ</a><button class="btn link" type="button" data-copy-quote>Sao chép link</button><button class="btn link" type="button" data-del-quote>Xóa</button></div></li>`,
        )
        .join("")
    : `<li><p class="empty">Chưa có báo giá nào. Bấm "Tạo link chia sẻ" trong trình soạn, báo giá sẽ được lưu ở đây.</p></li>`;
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const msg = $("[data-login-msg]");
  try {
    const d = await api("/api/auth/start", {
      method: "POST",
      body: JSON.stringify({ email: f.email.value, consentPrivacy: f.consentPrivacy.checked, consentMarketing: f.consentMarketing.checked }),
    });
    msg.className = "msg good";
    msg.textContent = "Đã gửi link đăng nhập vào email. Hãy mở link trong vòng 20 phút.";
    if (d.devLink) msg.insertAdjacentHTML("afterend", `<a class="dev-link" href="${esc(d.devLink)}">Link đăng nhập (chế độ phát triển)</a>`);
  } catch (err) {
    msg.className = "msg bad";
    msg.textContent = err.message;
  }
});

$("#biz-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const msg = $("[data-biz-msg]");
  const body = { ...Object.fromEntries(BIZ_FIELDS.map((k) => [k, f[k].value])), ...brand };
  if (body.taxCode && !validateTaxCode(body.taxCode)) {
    msg.className = "msg bad";
    msg.textContent = "Mã số thuế phải có 10, 12 hoặc 13 chữ số";
    return;
  }
  try {
    const d = await api("/api/business", { method: "PUT", body: JSON.stringify(body) });
    showBusiness(d.business);
    msg.className = "msg good";
    msg.textContent = "Đã lưu";
  } catch (err) {
    msg.className = "msg bad";
    msg.textContent = err.message;
  }
});

document.addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-id]");
  if (e.target.matches("[data-del-req]") && confirm("Xóa yêu cầu này?")) {
    await api(`/api/requests/${li.dataset.id}`, { method: "DELETE" });
    li.remove();
  } else if (e.target.matches("[data-del-quote]") && confirm("Xóa báo giá này? Link chia sẻ cũng sẽ không mở được nữa.")) {
    await api(`/api/quotes/${li.dataset.id}`, { method: "DELETE" });
    li.remove();
  } else if (e.target.matches("[data-copy-quote]")) {
    await navigator.clipboard?.writeText(`${location.origin}/q/${li.dataset.id}`).catch(() => {});
    e.target.textContent = "Đã chép";
  }
});

$("#marketing").addEventListener("change", async (e) => {
  const msg = $("[data-marketing-msg]");
  try {
    const d = await api("/api/me/marketing", { method: "POST", body: JSON.stringify({ consent: e.target.checked }) });
    msg.textContent = `${d.marketing ? `Đã đồng ý nhận email giới thiệu (${when(d.marketingAt)})` : "Đã tắt email giới thiệu"}. ${d.noticeSent ? "Email xác nhận đã được gửi." : ""}`;
  } catch (err) {
    e.target.checked = !e.target.checked;
    msg.textContent = err.message;
  }
});
$("#logout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/";
});
$("#delete").addEventListener("click", async () => {
  if (!confirm("Xóa tài khoản, thông tin đơn vị, báo giá và yêu cầu báo giá đã nhận. Không thể khôi phục. Tiếp tục?")) return;
  await api("/api/me/delete", { method: "POST" });
  location.href = "/";
});

start().catch((err) => {
  document.querySelector("main").insertAdjacentHTML("afterbegin", `<p class="msg bad">${esc(err.message)}</p>`);
});
