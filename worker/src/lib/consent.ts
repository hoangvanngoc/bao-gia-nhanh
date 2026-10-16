// Mèo Báo Giá: đồng ý nhận email giới thiệu (hết hạn sau 2 năm, email xác nhận kết quả) và thời gian lưu dữ liệu
// Hết hạn 2 năm là thực hành tốt để định kỳ hỏi lại người dùng, không phải quy định bắt buộc. Muốn bỏ thì sửa MARKETING_TTL_MS.

/** Đồng ý nhận email giới thiệu tự tắt sau 2 năm kể từ ngày đồng ý (hoặc đồng ý lại) */
export const MARKETING_TTL_MS = 2 * 365 * 86_400_000 + 86_400_000; // 2 năm (thêm một ngày cho năm nhuận)
/** Thời gian giữ email đăng ký chưa hoàn tất đăng nhập */
export const UNVERIFIED_TTL_MS = 7 * 86_400_000;
/** Thời gian giữ yêu cầu báo giá khách gửi qua trang nhận yêu cầu (tính từ ngày gửi) */
export const REQUEST_TTL_MS = 365 * 86_400_000;

/** Đồng ý còn hiệu lực không (đang bật và chưa quá 2 năm) */
export function marketingActive(flag: number | boolean | null | undefined, atIso: string | null | undefined, now = Date.now()): boolean {
  if (!flag || !atIso) return false;
  const at = Date.parse(atIso);
  return Number.isFinite(at) && now - at < MARKETING_TTL_MS;
}

/** Mốc thời gian: đồng ý trước mốc này là đã hết hạn */
export const marketingCutoffIso = (now = Date.now()) => new Date(now - MARKETING_TTL_MS).toISOString();

export type NoticeKind = "consent" | "withdraw" | "expired";

/**
 * Email xác nhận kết quả đồng ý / rút lại / hết hạn. Đây không phải email quảng cáo nên không chèn nội dung quảng cáo.
 * when là chuỗi giờ Việt Nam ("14:05 16/10/2026")
 */
export function marketingNotice(o: {
  kind: NoticeKind;
  when: string;
  email: string;
  app: string;
  operator: string;
  contact: string;
  appUrl: string; // để trống thì không chèn link (tác vụ định kỳ khi chưa đặt APP_URL)
  offUrl?: string;
}): { subject: string; text: string } {
  const app = o.appUrl ? `: ${o.appUrl}` : "";
  const result = {
    consent: "Bạn đã đồng ý nhận email giới thiệu",
    withdraw: "Bạn đã rút lại đồng ý nhận email giới thiệu. Chúng tôi sẽ không gửi email giới thiệu nữa",
    expired: "Đồng ý nhận email giới thiệu của bạn đã quá 2 năm nên được tự động tắt. Chúng tôi sẽ không gửi email giới thiệu nữa",
  }[o.kind];
  const lines = [
    `${o.operator} xin thông báo kết quả xử lý đồng ý nhận email giới thiệu của ${o.app}.`,
    ``,
    `Kết quả: ${result}`,
    `Thời điểm: ${o.when} (giờ Việt Nam)`,
    `Email: ${o.email}`,
    ``,
  ];
  if (o.kind === "consent") {
    lines.push(
      `Nội dung sẽ gửi: giới thiệu tính năng mới của ${o.app}`,
      `Đồng ý tự hết hạn sau 2 năm. Muốn nhận tiếp thì bật lại trong hộp báo giá khi đó.`,
      ``,
      `Muốn tắt thì bấm link dưới đây. Tắt ngay, không mất phí.`,
      o.offUrl ?? `Hộp báo giá${app}`,
      `Bạn cũng có thể tắt trong hộp báo giá${app}`,
      `Nếu bạn không đăng ký, hãy bấm link trên để tắt.`,
    );
  } else {
    lines.push(`Muốn nhận lại thì bật trong hộp báo giá${app}`);
  }
  lines.push(``, `Bên gửi: ${o.operator}`, `Liên hệ: ${o.contact}`);
  return { subject: `[${o.app}] Kết quả xử lý đồng ý nhận email giới thiệu`, text: lines.join("\n") };
}
