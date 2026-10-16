// Báo Giá Nhanh: ID ngẫu nhiên, băm, thời gian, làm sạch dữ liệu vào

const B64URL = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** ID không đoán được (mặc định 16 byte = 128 bit) */
export function randomId(bytes = 16): string {
  return B64URL(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Địa chỉ trang nhận yêu cầu: 10 ký tự thường, bỏ các ký tự dễ nhầm (khoảng 50 bit) */
export function randomSlug(len = 10): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint8Array(len));
  return [...r].map((b) => abc[b % abc.length]).join("");
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const SLUG_RE = /^[a-z0-9]{10}$/;
export const EMAIL_RE = /^[^\s@<>()"',;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

export const nowIso = () => new Date().toISOString();

/** Giờ Việt Nam (UTC+7) */
const ICT_MS = 7 * 3600_000;

/** YYYYMMDD theo giờ Việt Nam */
export function ictYmd(d = new Date()): string {
  return new Date(d.getTime() + ICT_MS).toISOString().slice(0, 10).replace(/-/g, "");
}

/** "14:05 16/10/2026" theo giờ Việt Nam */
export function ictText(iso: string): string {
  const s = new Date(new Date(iso).getTime() + ICT_MS).toISOString();
  return `${s.slice(11, 16)} ${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

export const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
