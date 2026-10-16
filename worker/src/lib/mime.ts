// Mèo Báo Giá: dựng email gốc (RFC 5322 + MIME) để gửi qua Gmail API
// File này không import module nào khác (để node --test đọc trực tiếp được)

export type MailParts = {
  from: string; // "Mèo Báo Giá <noreply@example.com>" hoặc "noreply@example.com"
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>; // List-Unsubscribe, List-Unsubscribe-Post, ...
  date?: Date;
  messageId?: string;
};

const enc = new TextEncoder();

/** Chuỗi UTF-8 sang base64 chuẩn */
export function b64(s: string | Uint8Array): string {
  const bytes = typeof s === "string" ? enc.encode(s) : s;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** base64url (không padding), giá trị raw của Gmail API */
export function b64url(s: string): string {
  return b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Giá trị header: ASCII thì giữ nguyên, không thì =?UTF-8?B?...?= (chia khúc để mỗi khúc không quá 75 ký tự) */
export function encodeWord(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    // 39 byte trước khi mã hóa = 52 ký tự base64, cộng 12 ký tự bao và "Subject: " vẫn dưới 78 ký tự một dòng
    if (enc.encode(chunk + ch).length > 39) {
      words.push(`=?UTF-8?B?${b64(chunk)}?=`);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(`=?UTF-8?B?${b64(chunk)}?=`);
  return words.join("\r\n ");
}

/** Chỉ mã hóa phần tên trong "Tên <địa chỉ>" */
export function encodeAddress(addr: string): string {
  const m = addr.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!m) return addr.trim();
  const name = m[1].trim();
  if (!name) return `<${m[2]}>`;
  const shown = /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/["\\]/g, "\\$&")}"` : encodeWord(name);
  return `${shown} <${m[2]}>`;
}

/** Lấy riêng địa chỉ ("Tên <a@b>" -> "a@b") */
export const addressOnly = (addr: string) => (addr.match(/<([^>]+)>/)?.[1] ?? addr).trim();

/** Thân base64 xuống dòng mỗi 76 ký tự */
const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();

/** Không cho chèn header khác bằng ký tự xuống dòng */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function rfc2822Date(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]}, ${p(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Email gốc multipart/alternative (text/plain + text/html, cả hai UTF-8 base64) */
export function buildMime(m: MailParts): string {
  const domain = addressOnly(m.from).split("@")[1] || "localhost";
  const boundary = `alt_${randomHex(12)}`;
  const head: string[] = [
    `From: ${encodeAddress(oneLine(m.from))}`,
    `To: ${encodeAddress(oneLine(m.to))}`,
    `Subject: ${encodeWord(oneLine(m.subject))}`,
    `Date: ${rfc2822Date(m.date ?? new Date())}`,
    `Message-ID: ${m.messageId ?? `<${randomHex(16)}@${domain}>`}`,
    `MIME-Version: 1.0`,
  ];
  if (m.replyTo) head.push(`Reply-To: ${encodeAddress(oneLine(m.replyTo))}`);
  for (const [k, v] of Object.entries(m.headers ?? {})) {
    if (/^[A-Za-z0-9-]+$/.test(k)) head.push(`${k}: ${oneLine(v)}`);
  }
  head.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const part = (type: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, `Content-Transfer-Encoding: base64`, ``, wrap76(b64(body))].join("\r\n");
  return [head.join("\r\n"), ``, part("text/plain", m.text), part("text/html", m.html), `--${boundary}--`, ``].join("\r\n");
}

/** Chuyển email chữ thường sang HTML: thoát ký tự đặc biệt, gắn link, giữ xuống dòng */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const body = esc(text)
    .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)
    .replace(/\r?\n/g, "<br>\n");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#141414">${body}</body></html>`;
}
