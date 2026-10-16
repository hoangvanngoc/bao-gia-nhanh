// Báo Giá Nhanh: khung chung cho các trang máy chủ dựng (báo giá chia sẻ, trang in, trang yêu cầu, xác nhận đăng nhập)
import { esc } from "../../../public/js/core.js";

const FONT = "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap";

/** Địa chỉ chính sách bảo vệ dữ liệu cá nhân (biến PRIVACY_URL, để trống thì dùng trang mẫu /privacy.html) */
export const DEFAULT_PRIVACY_URL = "/privacy.html";
export const privacyUrl = (env: { PRIVACY_URL?: string }) => env.PRIVACY_URL || DEFAULT_PRIVACY_URL;

// Mỗi lần triển khai chỉ có một giá trị, nên gán lại ở mỗi request (middleware đầu tiên trong index.ts)
let privacy = DEFAULT_PRIVACY_URL;
export function setPrivacyUrl(url: string) {
  privacy = url;
}
export const privacyLink = () => `<a href="${esc(privacy)}" data-privacy>chính sách bảo vệ dữ liệu cá nhân</a>`;

/** Một dòng về bên xử lý và chuyển dữ liệu ra nước ngoài, đặt trong phần xin đồng ý */
export const entrustLine = () =>
  `<p>Bên xử lý và chuyển dữ liệu ra nước ngoài: máy chủ và lưu trữ do Cloudflare, Inc. (Hoa Kỳ), gửi email do Google LLC (Hoa Kỳ). Xem thêm tại ${privacyLink()}.</p>`;

export function page(opts: { title: string; body: string; css?: string[]; js?: string[]; bodyClass?: string; noindex?: boolean; footer?: string }): string {
  const css = ["/css/site.css", ...(opts.css ?? [])].map((h) => `<link rel="stylesheet" href="${h}">`).join("\n");
  const js = (opts.js ?? []).map((s) => `<script src="${s}" type="module"></script>`).join("\n");
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
${opts.noindex !== false ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta name="referrer" content="no-referrer">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${FONT}">
${css}
</head>
<body class="${esc(opts.bodyClass ?? "")}">
${opts.body}
<footer class="wrap made-with no-print">${opts.footer ? `<span>${opts.footer}</span>` : ""}<span>${privacyLink()}</span></footer>
${js}
</body>
</html>`;
}

export function notFoundPage(msg = "Không tìm thấy trang này"): string {
  return page({
    title: "Không tìm thấy",
    body: `<main class="wrap narrow"><h1 class="page-h">${esc(msg)}</h1><p class="sub">Hãy kiểm tra lại đường dẫn.</p><p><a class="btn" href="/">Về Báo Giá Nhanh</a></p></main>`,
  });
}
