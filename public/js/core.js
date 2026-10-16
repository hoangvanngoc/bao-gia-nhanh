// Báo Giá Nhanh: module dùng chung để tính tiền, đọc số, dựng HTML báo giá
// Trình soạn thảo trên trình duyệt và Worker (máy chủ) dùng chung file này. Máy chủ luôn tự tính lại tiền.

/* ---------- Mã số thuế ---------- */

/** Chỉ giữ lại chữ số */
export function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

/**
 * Kiểm tra định dạng mã số thuế (chỉ kiểm độ dài, không kiểm chữ số kiểm tra):
 * - 10 số: doanh nghiệp, tổ chức, hộ kinh doanh
 * - 13 số (0123456789-001): đơn vị phụ thuộc, chi nhánh
 * - 12 số: số CCCD dùng làm mã số thuế cá nhân
 */
export function validateTaxCode(input) {
  const n = digitsOnly(input).length;
  return n === 10 || n === 12 || n === 13;
}

/** 13 số thành 0123456789-001, còn lại giữ nguyên */
export function formatTaxCode(input) {
  const d = digitsOnly(input);
  if (d.length === 13) return `${d.slice(0, 10)}-${d.slice(10)}`;
  if (d.length === 10 || d.length === 12) return d;
  return String(input ?? "");
}

/* ---------- Đọc số tiền bằng chữ ---------- */

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const MAX_WORDS = 10n ** 18n - 1n;
const BILLION = 1_000_000_000n;

/** Đọc một nhóm ba chữ số. full = đọc cả "không trăm", "linh" (nhóm không đứng đầu) */
function readTriple(n, full) {
  const h = Math.floor(n / 100);
  const t = Math.floor(n / 10) % 10;
  const u = n % 10;
  const w = [];
  if (h || full) w.push(DIGITS[h], "trăm");
  if (t === 0) {
    if (u && (h || full)) w.push("linh");
  } else if (t === 1) w.push("mười");
  else w.push(DIGITS[t], "mươi");
  if (u) {
    if (u === 1 && t >= 2) w.push("mốt");
    else if (u === 5 && t >= 1) w.push("lăm");
    else w.push(DIGITS[u]);
  }
  return w.join(" ");
}

/** Số nhỏ hơn một tỷ */
function readBelowBillion(n, leading) {
  const groups = [Math.floor(n / 1_000_000), Math.floor(n / 1000) % 1000, n % 1000];
  const names = ["triệu", "nghìn", ""];
  const out = [];
  let first = leading;
  groups.forEach((g, i) => {
    if (!g) return;
    out.push(readTriple(g, !first) + (names[i] ? ` ${names[i]}` : ""));
    first = false;
  });
  return out.join(" ");
}

function readBig(n, leading) {
  if (n < BILLION) return readBelowBillion(Number(n), leading);
  const hi = n / BILLION;
  const lo = n % BILLION;
  const head = `${readBig(hi, leading)} tỷ`;
  return lo ? `${head} ${readBelowBillion(Number(lo), false)}` : head;
}

/**
 * Đọc số nguyên thành chữ tiếng Việt (chữ thường): 1050000 -> "một triệu không trăm năm mươi nghìn"
 * Nhận số nguyên từ 0 đến dưới 10^18.
 */
export function toVietnameseNumber(value) {
  let n;
  try {
    n = typeof value === "bigint" ? value : BigInt(typeof value === "number" ? Math.trunc(value) : String(value).replace(/[.,\s]/g, ""));
  } catch {
    throw new RangeError("Chỉ đọc được số nguyên");
  }
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) throw new RangeError("Số tiền ngoài phạm vi");
  if (n < 0n || n > MAX_WORDS) throw new RangeError("Số tiền ngoài phạm vi");
  if (n === 0n) return "không";
  return readBig(n, true);
}

/** "Một triệu hai trăm nghìn đồng" */
export function amountInWords(value) {
  const s = `${toVietnameseNumber(value)} đồng`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 1.234.567 */
export function vnd(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

/* ---------- Làm tròn ---------- */

export const ROUND_MODES = ["floor", "round", "ceil"]; // làm tròn xuống, làm tròn, làm tròn lên
export const ROUND_UNITS = [1, 10, 100, 1000];

/** n / d làm tròn theo đơn vị unit (số nguyên không âm). Tính bằng BigInt cho chính xác */
export function roundDiv(n, d, mode = "round", unit = 1) {
  const N = BigInt(n);
  const D = BigInt(d) * BigInt(unit);
  if (N < 0n || D <= 0n) throw new RangeError("Không tính số âm");
  let q = N / D;
  const r = N % D;
  if (mode === "ceil" && r > 0n) q += 1n;
  else if (mode === "round" && r * 2n >= D) q += 1n;
  return Number(q * BigInt(unit));
}

/* ---------- Tính báo giá ---------- */

export const TAX_MODES = {
  vat: "Có thuế GTGT (phương pháp khấu trừ)",
  direct: "Không tách thuế GTGT (hộ kinh doanh, phương pháp trực tiếp)",
  freelancer: "Cá nhân, khấu trừ thuế TNCN 10%",
};

export const VAT_RATES = [10, 8, 5, 0];

/** Ngưỡng khấu trừ thuế TNCN 10% cho cá nhân không ký hợp đồng lao động (mỗi lần chi trả) */
export const PIT_THRESHOLD = 2_000_000;
export const PIT_RATE = 10;

export const LIMITS = {
  items: 50,
  qty: 1_000_000,
  unitPrice: 1_000_000_000_000, // 1.000 tỷ
  total: 1_000_000_000_000_000, // 1 triệu tỷ (vẫn trong phạm vi số nguyên an toàn)
};

/**
 * Tính tiền báo giá
 * - vat + vatIncluded=false: đơn giá chưa thuế. Thuế GTGT = cộng tiền hàng x thuế suất
 * - vat + vatIncluded=true:  đơn giá đã gồm thuế. Thuế GTGT = tổng x r/(100+r), tiền hàng = tổng - thuế
 * - direct: không ghi dòng thuế GTGT riêng, chỉ ghi tổng (cần kiểm tra với kế toán)
 * - freelancer: khấu trừ thuế TNCN 10% nếu tổng từ 2.000.000 đ trở lên (cần kiểm tra với kế toán)
 */
export function calcQuote(q) {
  const mode = ROUND_MODES.includes(q?.rounding?.mode) ? q.rounding.mode : "round";
  const unit = ROUND_UNITS.includes(Number(q?.rounding?.unit)) ? Number(q.rounding.unit) : 1;
  const rate = VAT_RATES.includes(Number(q?.vatRate)) ? Number(q.vatRate) : 10;
  const lines = (q?.items ?? []).map((it) => {
    const q100 = Math.round(Number(it.qty || 0) * 100);
    const price = Math.trunc(Number(it.unitPrice || 0));
    return roundDiv(BigInt(q100) * BigInt(price), 100, mode, unit);
  });
  const sum = lines.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(sum) || sum > LIMITS.total) throw new RangeError("Tổng tiền quá lớn");

  const out = { lines, sum, rate, supply: sum, vat: 0, total: sum, pit: 0, net: sum };
  const tax = q?.taxMode;
  if (tax === "vat") {
    if (q.vatIncluded) {
      out.vat = roundDiv(BigInt(sum) * BigInt(rate), 100 + rate, mode, unit);
      out.supply = sum - out.vat;
      out.total = sum;
    } else {
      out.vat = roundDiv(BigInt(sum) * BigInt(rate), 100, mode, unit);
      out.total = sum + out.vat;
    }
    out.net = out.total;
  } else if (tax === "freelancer") {
    out.pit = sum >= PIT_THRESHOLD ? roundDiv(BigInt(sum) * BigInt(PIT_RATE), 100, mode, unit) : 0;
    out.net = sum - out.pit;
  }
  return out;
}

/* ---------- Làm sạch dữ liệu vào (máy chủ chỉ dùng dữ liệu đã qua hàm này) ---------- */

const str = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEAL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

/* ---------- Thương hiệu ---------- */

/** Độ dài tối đa của logo (chuỗi data URL, khoảng 110KB ảnh) */
export const LOGO_MAX = 150_000;
/** Màu chủ đạo mặc định của mẫu báo giá */
export const DEFAULT_BRAND = "#111111";
/** Bảng màu gợi ý: đều đủ tương phản trên nền trắng */
export const BRAND_SWATCHES = ["#111111", "#0f766e", "#1d4ed8", "#b4232a", "#c2410c", "#7e22ce", "#15803d", "#334155"]; // chữ thường, khớp cleanColor

/** Logo hợp lệ (data URL png/jpeg/webp, không quá LOGO_MAX), không hợp lệ trả chuỗi rỗng */
export function cleanLogo(v) {
  return typeof v === "string" && v.length <= LOGO_MAX && SEAL.test(v) ? v : "";
}

/** Màu #rrggbb, không hợp lệ trả chuỗi rỗng */
export function cleanColor(v) {
  return typeof v === "string" && COLOR.test(v) ? v.toLowerCase() : "";
}

/** Tỷ lệ tương phản của màu với nền trắng (WCAG). Dưới 4.5 thì chữ màu này khó đọc */
export function contrastOnWhite(hex) {
  if (!COLOR.test(hex || "")) return 21;
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return 1.05 / (lum + 0.05);
}

export function normalizeQuote(input, { keepSeal = false } = {}) {
  const q = input && typeof input === "object" ? input : {};
  const s = q.supplier ?? {};
  const c = q.client ?? {};
  const items = Array.isArray(q.items) ? q.items.slice(0, LIMITS.items) : [];
  return {
    title: str(q.title, 60) || "BÁO GIÁ",
    number: str(q.number, 20),
    date: DATE.test(q.date) ? q.date : "",
    validUntil: DATE.test(q.validUntil) ? q.validUntil : "",
    taxMode: q.taxMode in TAX_MODES ? q.taxMode : "vat",
    vatRate: VAT_RATES.includes(Number(q.vatRate)) ? Number(q.vatRate) : 10,
    vatIncluded: Boolean(q.vatIncluded),
    rounding: {
      mode: ROUND_MODES.includes(q?.rounding?.mode) ? q.rounding.mode : "round",
      unit: ROUND_UNITS.includes(Number(q?.rounding?.unit)) ? Number(q.rounding.unit) : 1,
    },
    supplier: {
      name: str(s.name, 120),
      owner: str(s.owner, 60),
      taxCode: digitsOnly(s.taxCode).slice(0, 13),
      address: str(s.address, 200),
      phone: str(s.phone, 40),
      email: str(s.email, 120),
      bank: str(s.bank, 160),
      website: str(s.website, 120),
      tagline: str(s.tagline, 120),
      brandColor: cleanColor(s.brandColor),
      logo: cleanLogo(s.logo),
      seal: keepSeal && typeof s.seal === "string" && s.seal.length < 400_000 && SEAL.test(s.seal) ? s.seal : "",
    },
    client: {
      name: str(c.name, 120),
      person: str(c.person, 60),
      phone: str(c.phone, 40),
      address: str(c.address, 200),
    },
    items: items
      .map((it) => ({
        name: str(it?.name, 160),
        spec: str(it?.spec, 60),
        qty: clampNum(it?.qty, 0, LIMITS.qty, 2),
        unitPrice: clampNum(it?.unitPrice, 0, LIMITS.unitPrice, 0),
      }))
      .filter((it) => it.name || it.unitPrice),
    notes: str(q.notes, 1000),
  };
}

function clampNum(v, min, max, decimals) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, ""));
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(n * f) / f));
}

/** Kiểm tra báo giá có đủ để xuất không: trả về danh sách lỗi (rỗng là đạt) */
export function checkQuote(q) {
  const errs = [];
  if (!q.supplier.name) errs.push("Hãy nhập tên đơn vị báo giá");
  if (q.supplier.taxCode && !validateTaxCode(q.supplier.taxCode)) errs.push("Mã số thuế phải có 10, 12 hoặc 13 chữ số");
  if (!q.client.name) errs.push("Hãy nhập tên khách hàng (bên nhận báo giá)");
  if (!q.items.length) errs.push("Hãy nhập ít nhất một hạng mục");
  return errs;
}

/* ---------- HTML báo giá ---------- */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function fmtDate(d) {
  if (!DATE.test(d || "")) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function longDate(d) {
  if (!DATE.test(d || "")) return "Ngày ... tháng ... năm ......";
  const [y, m, day] = d.split("-");
  return `Ngày ${Number(day)} tháng ${Number(m)} năm ${y}`;
}

function fmtQty(n) {
  return Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

/**
 * HTML báo giá một trang A4 (dùng cùng doc.css)
 * opts.acceptedAt: có chuỗi thời điểm chấp nhận thì hiện dấu đã chấp nhận
 */
export function renderQuoteHtml(q, opts = {}) {
  const t = calcQuote(q);
  const s = q.supplier;
  const c = q.client;
  const vatLabel =
    q.taxMode === "vat"
      ? q.vatIncluded
        ? `đã bao gồm thuế GTGT ${t.rate}%`
        : `đã cộng thuế GTGT ${t.rate}%`
      : q.taxMode === "direct"
        ? "giá trọn gói, không tách thuế GTGT"
        : "trước khi khấu trừ thuế TNCN";
  const headline = q.taxMode === "freelancer" ? t.sum : t.total;
  const minRows = 8;
  const rows = q.items
    .map(
      (it, i) => `<tr>
<td class="c">${i + 1}</td><td>${esc(it.name)}</td><td class="c">${esc(it.spec)}</td>
<td class="n">${fmtQty(it.qty)}</td><td class="n">${vnd(it.unitPrice)}</td><td class="n">${vnd(t.lines[i])}</td></tr>`,
    )
    .join("");
  const blanks = Array.from({ length: Math.max(0, minRows - q.items.length) }, () => `<tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");

  let sumRows = "";
  if (q.taxMode === "vat") {
    sumRows = `<tr><th>Cộng tiền hàng</th><td class="n">${vnd(t.supply)}</td></tr>
<tr><th>Thuế GTGT (${t.rate}%)</th><td class="n">${vnd(t.vat)}</td></tr>
<tr class="strong"><th>Tổng cộng</th><td class="n">${vnd(t.total)}</td></tr>`;
  } else if (q.taxMode === "direct") {
    sumRows = `<tr class="strong"><th>Tổng cộng</th><td class="n">${vnd(t.total)}</td></tr>`;
  } else {
    sumRows = `<tr><th>Tổng tiền dịch vụ</th><td class="n">${vnd(t.sum)}</td></tr>
<tr><th>Thuế TNCN khấu trừ (${PIT_RATE}%)</th><td class="n">${t.pit ? `- ${vnd(t.pit)}` : "0"}</td></tr>
<tr class="strong"><th>Thực nhận</th><td class="n">${vnd(t.net)}</td></tr>`;
  }

  const seal = s.seal ? `<img class="seal" src="${esc(s.seal)}" alt="Con dấu">` : "";
  const accepted = opts.acceptedAt
    ? `<div class="accepted">Đã chấp nhận báo giá: ${esc(opts.acceptedAt)}${opts.acceptedName ? `, ${esc(opts.acceptedName)}` : ""}</div>`
    : "";

  // Dải thương hiệu đầu trang: chỉ hiện khi có logo, khẩu hiệu hoặc website
  const brandBar =
    s.logo || s.tagline || s.website
      ? `<header class="brand-bar">
  ${s.logo ? `<img class="brand-logo" src="${esc(s.logo)}" alt="${esc(s.name)}">` : ""}
  <div class="brand-text"><strong class="brand-name">${esc(s.name)}</strong>${s.tagline ? `<span class="brand-tagline">${esc(s.tagline)}</span>` : ""}${s.website ? `<span class="brand-web">${esc(s.website)}</span>` : ""}</div>
</header>`
      : "";
  const brandStyle = s.brandColor ? ` style="--brand:${s.brandColor}"` : "";

  return `<article class="doc" lang="vi"${brandStyle}>
${brandBar}
<header class="doc-head">
  <h1 class="doc-title">${esc(q.title || "BÁO GIÁ")}</h1>
  <dl class="doc-meta">
    <div><dt>Số</dt><dd>${esc(q.number) || "-"}</dd></div>
    <div><dt>Ngày</dt><dd>${fmtDate(q.date) || "-"}</dd></div>
    <div><dt>Hiệu lực đến</dt><dd>${fmtDate(q.validUntil) || "-"}</dd></div>
  </dl>
</header>
<section class="parties">
  <table class="party">
    <caption>Kính gửi</caption>
    <tr><th>Khách hàng</th><td class="to">${esc(c.name)}</td></tr>
    <tr><th>Người liên hệ</th><td>${esc(c.person)}</td></tr>
    <tr><th>Điện thoại</th><td>${esc(c.phone)}</td></tr>
    <tr><th>Địa chỉ</th><td>${esc(c.address)}</td></tr>
    <tr><td colspan="2" class="lead-in">Chúng tôi xin gửi Quý khách báo giá như sau:</td></tr>
  </table>
  <table class="party">
    <caption>Đơn vị báo giá</caption>
    <tr><th>Tên đơn vị</th><td>${esc(s.name)}</td></tr>
    <tr><th>Mã số thuế</th><td>${esc(formatTaxCode(s.taxCode))}</td></tr>
    <tr><th>Địa chỉ</th><td>${esc(s.address)}</td></tr>
    <tr><th>Liên hệ</th><td>${esc([s.phone, s.email].filter(Boolean).join(" / "))}</td></tr>
    <tr><th>Tài khoản</th><td>${esc(s.bank)}</td></tr>
  </table>
</section>
<section class="grand">
  <span class="grand-label">Tổng giá trị</span>
  <strong class="grand-num">${vnd(headline)} ₫</strong>
  <span class="grand-note">(${vatLabel})</span>
  <span class="grand-words">Bằng chữ: ${amountInWords(headline)}.</span>
</section>
<table class="items">
  <colgroup><col style="width:6%"><col style="width:36%"><col style="width:12%"><col style="width:10%"><col style="width:17%"><col style="width:19%"></colgroup>
  <thead><tr><th>STT</th><th>Hạng mục</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>${q.taxMode === "vat" && q.vatIncluded ? "Thành tiền (gồm VAT)" : "Thành tiền"}</th></tr></thead>
  <tbody>${rows}${blanks}</tbody>
</table>
<section class="foot">
  <div class="notes"><h2>Ghi chú</h2><p>${esc(q.notes).replace(/\n/g, "<br>") || "&nbsp;"}</p></div>
  <table class="sums">${sumRows}</table>
</section>
<section class="sign">
  <div class="sign-box">
    <p class="sign-date">${longDate(q.date)}</p>
    <p class="sign-role">Đại diện đơn vị báo giá</p>
    <p class="sign-hint">(Ký, ghi rõ họ tên${s.seal ? ", đóng dấu" : ""})</p>
    <div class="sign-space">${seal}</div>
    <p class="sign-name">${esc(s.owner)}</p>
  </div>
</section>
${accepted}
</article>`;
}
