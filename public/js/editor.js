// Mèo Báo Giá: trình soạn báo giá (nhập liệu, xem trước, in, tạo link chia sẻ)
import { amountInWords, calcQuote, checkQuote, digitsOnly, esc, formatTaxCode, normalizeQuote, PIT_THRESHOLD, renderQuoteHtml, validateTaxCode, vnd } from "./core.js";
import { fitSheets } from "./fit.js";

const $ = (s, el = document) => el.querySelector(s);
const ed = $("#editor");
const field = (name) => ed.querySelector(`[name="${name}"]`);
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* hết chỗ lưu thì vẫn soạn tiếp được */
    }
  },
};

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => ymd(new Date(Date.now() + n * 86_400_000));

// Số báo giá khi chưa đăng nhập: đánh số theo ngày ngay trên trình duyệt (khi lưu, máy chủ đánh số lại)
function draftNumber() {
  const today = ymd(new Date()).replace(/-/g, "");
  const s = store.get("mbg.seq", { d: "", n: 0 });
  const n = s.d === today ? s.n + 1 : 1;
  store.set("mbg.seq", { d: today, n });
  return `BG${today}-${String(n).padStart(3, "0")}`;
}

const EMPTY_SUPPLIER = { name: "", owner: "", taxCode: "", address: "", phone: "", email: "", bank: "" };

function blank(supplier) {
  return {
    title: "BÁO GIÁ",
    number: draftNumber(),
    date: ymd(new Date()),
    validUntil: addDays(30),
    taxMode: "vat",
    vatRate: 10,
    vatIncluded: false,
    rounding: { mode: "round", unit: 1 },
    supplier: { ...EMPTY_SUPPLIER, ...(supplier ?? {}) },
    client: { name: "", person: "", phone: "", address: "" },
    items: [{ name: "", spec: "", qty: 1, unitPrice: 0 }],
    notes: "",
  };
}

const SAMPLE_NAME = "Studio Thiết Kế Mẫu";

function sample() {
  const q = blank({
    name: SAMPLE_NAME,
    owner: "Nguyễn Văn A",
    taxCode: "0100000000",
    address: "Số 00 phố ..., quận ..., Hà Nội",
    phone: "0900 000 000",
    email: "hello@example.com",
    bank: "0000000000 - Ngân hàng ... - NGUYEN VAN A",
  });
  q.client = { name: "Quán Cà Phê Mẫu", person: "Chị B", phone: "0280 000 0000", address: "TP. Hồ Chí Minh" };
  q.items = [
    { name: "Thiết kế menu", spec: "bộ", qty: 1, unitPrice: 3_500_000 },
    { name: "In menu A3 hai mặt, cán màng", spec: "tờ", qty: 20, unitPrice: 45_000 },
    { name: "Sticker dán cửa 10x10 cm", spec: "cái", qty: 50, unitPrice: 12_000 },
  ];
  q.notes = "Đã bao gồm 2 lần chỉnh sửa thiết kế. Giao hàng trong 5 ngày làm việc sau khi duyệt mẫu. Thanh toán 50% khi xác nhận, 50% khi giao hàng.";
  return q;
}

// Bản nháp cũ thiếu trường mới thì bù vào
function migrate(d) {
  if (!d || typeof d !== "object") return null;
  const b = blank(d.supplier);
  return { ...b, ...d, supplier: { ...b.supplier, ...(d.supplier ?? {}) }, client: { ...b.client, ...(d.client ?? {}) }, rounding: { ...b.rounding, ...(d.rounding ?? {}) } };
}

let state = migrate(store.get("mbg.draft", null)) ?? sample();
let seal = store.get("mbg.seal", "");

/* ---------- Ô nhập <-> trạng thái ---------- */

const simple = {
  number: ["number"],
  date: ["date"],
  validUntil: ["validUntil"],
  title: ["title"],
  notes: ["notes"],
  "s.name": ["supplier", "name"],
  "s.owner": ["supplier", "owner"],
  "s.taxCode": ["supplier", "taxCode"],
  "s.address": ["supplier", "address"],
  "s.phone": ["supplier", "phone"],
  "s.email": ["supplier", "email"],
  "s.bank": ["supplier", "bank"],
  "c.name": ["client", "name"],
  "c.person": ["client", "person"],
  "c.phone": ["client", "phone"],
  "c.address": ["client", "address"],
};

function fillForm() {
  for (const [name, path] of Object.entries(simple)) {
    const v = path.reduce((o, k) => o?.[k], state) ?? "";
    field(name).value = name === "s.taxCode" ? formatTaxCode(v) : v;
  }
  for (const r of ed.querySelectorAll('[name="taxMode"]')) r.checked = r.value === state.taxMode;
  for (const r of ed.querySelectorAll('[name="vatRate"]')) r.checked = Number(r.value) === Number(state.vatRate);
  for (const r of ed.querySelectorAll('[name="vatIncluded"]')) r.checked = r.value === (state.vatIncluded ? "1" : "0");
  field("roundMode").value = state.rounding.mode;
  field("roundUnit").value = String(state.rounding.unit);
  renderItems();
  renderSeal();
}

ed.addEventListener("input", (e) => {
  const t = e.target;
  if (t.closest("#items")) return onItemInput(t);
  if (simple[t.name]) {
    const path = simple[t.name];
    let o = state;
    for (const k of path.slice(0, -1)) o = o[k];
    o[path.at(-1)] = t.value;
  } else if (t.name === "taxMode") state.taxMode = t.value;
  else if (t.name === "vatRate") state.vatRate = Number(t.value);
  else if (t.name === "vatIncluded") state.vatIncluded = t.value === "1";
  else if (t.name === "roundMode") state.rounding.mode = t.value;
  else if (t.name === "roundUnit") state.rounding.unit = Number(t.value);
  else return;
  update();
});
ed.addEventListener("change", (e) => {
  if (e.target.name === "s.taxCode") e.target.value = formatTaxCode(e.target.value);
});

/* ---------- Hạng mục ---------- */

// Đơn giá: chỉ lấy chữ số (người dùng gõ 1.500.000 hay 1,500,000 đều được)
const money = (v) => Number(digitsOnly(v)) || 0;
// Số lượng: nhận cả dấu phẩy thập phân (2,5)
const qtyOf = (v) => Number(String(v).replace(/\s/g, "").replace(",", ".")) || 0;

function renderItems() {
  const box = $("#items");
  box.innerHTML = "";
  state.items.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.dataset.i = i;
    row.innerHTML = `
      <label class="f-name">Hạng mục<input data-k="name" maxlength="160"></label>
      <label class="f-spec">ĐVT<input data-k="spec" maxlength="60" placeholder="cái, bộ, giờ"></label>
      <label class="f-qty">SL<input data-k="qty" inputmode="decimal"></label>
      <label class="f-price">Đơn giá<input data-k="unitPrice" inputmode="numeric"></label>
      <button class="icon-btn f-del" type="button" data-del aria-label="Xóa hạng mục ${i + 1}">×</button>
      <span class="amt" data-amt></span>`;
    row.querySelector('[data-k="name"]').value = it.name;
    row.querySelector('[data-k="spec"]').value = it.spec;
    row.querySelector('[data-k="qty"]').value = String(it.qty).replace(".", ",");
    row.querySelector('[data-k="unitPrice"]').value = vnd(it.unitPrice);
    box.append(row);
  });
}

function onItemInput(t) {
  const row = t.closest(".item-row");
  const it = state.items[Number(row.dataset.i)];
  const k = t.dataset.k;
  if (!it || !k) return;
  it[k] = k === "qty" ? qtyOf(t.value) : k === "unitPrice" ? money(t.value) : t.value;
  update();
}

$("#items").addEventListener("focusout", (e) => {
  if (e.target.dataset.k === "unitPrice") e.target.value = vnd(money(e.target.value));
});
$("#items").addEventListener("click", (e) => {
  if (!e.target.closest("[data-del]")) return;
  const i = Number(e.target.closest(".item-row").dataset.i);
  state.items.splice(i, 1);
  if (!state.items.length) state.items.push({ name: "", spec: "", qty: 1, unitPrice: 0 });
  renderItems();
  update();
});
$("#add-item").addEventListener("click", () => {
  if (state.items.length >= 50) return;
  state.items.push({ name: "", spec: "", qty: 1, unitPrice: 0 });
  renderItems();
  update();
  $("#items .item-row:last-child input").focus();
});

/* ---------- Con dấu / chữ ký (chỉ lưu trên trình duyệt) ---------- */

function renderSeal() {
  const img = $("[data-seal-preview]");
  img.hidden = !seal;
  $("[data-seal-clear]").hidden = !seal;
  if (seal) img.src = seal;
}

$("[data-seal-file]").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 5_000_000) return alert("Hãy chọn ảnh nhỏ hơn 5MB");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return alert("Không đọc được ảnh");
  const max = 320;
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * r);
  canvas.height = Math.round(bmp.height * r);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  seal = canvas.toDataURL("image/png");
  store.set("mbg.seal", seal);
  e.target.value = "";
  renderSeal();
  update();
});
$("[data-seal-clear]").addEventListener("click", () => {
  seal = "";
  store.set("mbg.seal", "");
  renderSeal();
  update();
});

/* ---------- Xem trước và tổng tiền ---------- */

const TAX_NOTE = {
  vat: "Ghi riêng tiền hàng và thuế GTGT. Thuế suất 8% là mức giảm theo nghị quyết của Quốc hội, chỉ áp dụng cho một số hàng hóa, dịch vụ và trong thời hạn nghị quyết còn hiệu lực. Hãy kiểm tra với kế toán.",
  direct: "Hộ kinh doanh, cá nhân kinh doanh nộp thuế theo phương pháp trực tiếp: không ghi dòng thuế GTGT riêng, chỉ ghi tổng tiền. Hãy kiểm tra với kế toán.",
  freelancer: `Cá nhân làm dịch vụ, không ký hợp đồng lao động: bên trả tiền khấu trừ 10% thuế TNCN khi khoản chi từ ${vnd(PIT_THRESHOLD)} đồng trở lên. Báo giá ghi cả số thực nhận. Hãy kiểm tra với kế toán.`,
};

function current(keepSeal = true) {
  const q = structuredClone(state);
  q.supplier.seal = keepSeal ? seal : "";
  return normalizeQuote(q, { keepSeal });
}

function update() {
  store.set("mbg.draft", state);
  for (const el of ed.querySelectorAll("[data-vat]")) el.hidden = state.taxMode !== "vat";
  $("[data-tax-note]").textContent = TAX_NOTE[state.taxMode];

  const hint = $("[data-tax-hint]");
  const n = digitsOnly(state.supplier.taxCode).length;
  const ok = validateTaxCode(state.supplier.taxCode);
  hint.className = "hint" + (n ? (ok ? " good" : n > 13 || n === 11 ? " bad" : "") : "");
  hint.textContent = !n ? "10 số, 13 số (chi nhánh) hoặc 12 số CCCD" : ok ? "Đúng định dạng" : n > 13 || n === 11 ? "Sai định dạng, hãy kiểm tra lại" : `Mới có ${n} chữ số`;

  const q = current(true);
  let t;
  try {
    t = calcQuote(q);
    $("#sheet").innerHTML = renderQuoteHtml(q);
  } catch {
    $("#totals").innerHTML = '<p class="msg bad">Số tiền quá lớn. Hãy kiểm tra lại số lượng hoặc đơn giá.</p>';
    return;
  }
  ed.querySelectorAll("#items [data-amt]").forEach((el, i) => (el.textContent = t.lines[i] != null ? `Thành tiền ${vnd(t.lines[i])} đ` : ""));

  const rows = [];
  if (q.taxMode === "vat") rows.push(["Cộng tiền hàng", t.supply], [`Thuế GTGT ${t.rate}%`, t.vat], ["Tổng cộng", t.total, true]);
  else if (q.taxMode === "direct") rows.push(["Tổng cộng", t.total, true]);
  else rows.push(["Tổng tiền dịch vụ", t.sum], ["Thuế TNCN khấu trừ 10%", -t.pit], ["Thực nhận", t.net, true]);
  const head = q.taxMode === "freelancer" ? t.sum : t.total;
  $("#totals").innerHTML =
    rows.map(([k, v, big]) => `<div class="row${big ? " big" : ""}"><span>${k}</span><span>${v < 0 ? "- " : ""}${vnd(Math.abs(v))} đ</span></div>`).join("") +
    `<div class="words">Bằng chữ: ${amountInWords(head)}</div>`;
  fitSheets();
}

/* ---------- In, lưu, đăng ký ---------- */

function showErrors(list) {
  $("#errors").innerHTML = list.map((e) => `<li>${esc(e)}</li>`).join("");
}

$("#print").addEventListener("click", () => {
  showErrors([]);
  window.print();
});

$("#save").addEventListener("click", async () => {
  const q = current(false);
  const errs = checkQuote(q);
  showErrors(errs);
  if (errs.length) return;
  const btn = $("#save");
  btn.disabled = true;
  try {
    const res = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      $("#signup").hidden = false;
      $("#signup [name=email]").focus();
      return;
    }
    if (!res.ok) return showErrors(data.errors ?? [data.error ?? "Không lưu được"]);
    state.number = data.number;
    field("number").value = data.number;
    update();
    $("#share-out").classList.add("on");
    $("[data-share-msg]").textContent = `Đã lưu với số báo giá ${data.number}.`;
    $("[data-share-url]").value = data.url;
  } finally {
    btn.disabled = false;
  }
});

$("[data-copy]").addEventListener("click", async () => {
  const input = $("[data-share-url]");
  try {
    await navigator.clipboard.writeText(input.value);
    $("[data-copy]").textContent = "Đã chép";
  } catch {
    input.select();
  }
});

$("#signup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const msg = $("[data-signup-msg]");
  if (!f.consentPrivacy.checked) {
    msg.className = "msg bad";
    msg.textContent = "Hãy đánh dấu đồng ý xử lý dữ liệu cá nhân (bắt buộc)";
    return;
  }
  const res = await fetch("/api/auth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: f.email.value, consentPrivacy: true, consentMarketing: f.consentMarketing.checked }),
  });
  const data = await res.json().catch(() => ({}));
  msg.className = res.ok ? "msg good" : "msg bad";
  msg.textContent = res.ok ? 'Đã gửi link đăng nhập vào email. Đăng nhập xong, quay lại trang này và bấm "Tạo link chia sẻ" lần nữa. Nội dung đang soạn vẫn còn.' : data.error;
  if (data.devLink) {
    const a = document.createElement("a");
    a.href = data.devLink;
    a.className = "dev-link";
    a.textContent = `Link đăng nhập (chế độ phát triển): ${data.devLink}`;
    msg.after(a);
  }
});

$("#reset").addEventListener("click", () => {
  if (!confirm("Xóa khách hàng, hạng mục, ghi chú để làm báo giá mới? Thông tin đơn vị báo giá được giữ lại.")) return;
  state = blank(state.supplier);
  $("#share-out").classList.remove("on");
  showErrors([]);
  fillForm();
  update();
});

/* ---------- Khởi động ---------- */

fillForm();
update();

fetch("/api/config")
  .then((r) => r.json())
  .then((c) => {
    if (c.ctaUrl) document.querySelectorAll("[data-cta]").forEach((a) => (a.href = c.ctaUrl));
    if (c.privacyUrl) document.querySelectorAll("[data-privacy]").forEach((a) => (a.href = c.privacyUrl));
  })
  .catch(() => {});

fetch("/api/me")
  .then((r) => r.json())
  .then((me) => {
    if (!me.login) return;
    const b = me.business;
    // Đã đăng nhập và có thông tin đơn vị: điền vào nếu ô đơn vị đang trống hoặc còn là dữ liệu mẫu
    if (b && (!state.supplier.name || state.supplier.name === SAMPLE_NAME)) {
      state.supplier = { name: b.name, owner: b.owner, taxCode: b.taxCode, address: b.address, phone: b.phone, email: b.email, bank: b.bank };
      fillForm();
      update();
    }
  })
  .catch(() => {});
