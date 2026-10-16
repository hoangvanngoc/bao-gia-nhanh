// Báo Giá Nhanh: thu nhỏ ảnh người dùng chọn (logo, con dấu) thành data URL ngay trên trình duyệt

/**
 * Đọc file ảnh, thu nhỏ để vừa khung maxW x maxH, trả data URL.
 * Nếu chuỗi vẫn dài hơn maxLen thì thu nhỏ tiếp (tối đa 5 lần). Không đạt thì ném lỗi.
 */
export async function imageToDataUrl(file, { maxW, maxH, maxLen = Infinity, type = "image/png", quality = 0.9 }) {
  if (!file) throw new Error("Chưa chọn ảnh");
  if (file.size > 5_000_000) throw new Error("Hãy chọn ảnh nhỏ hơn 5MB");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("Không đọc được ảnh");
  let r = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  for (let i = 0; i < 5; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * r));
    canvas.height = Math.max(1, Math.round(bmp.height * r));
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL(type, quality);
    if (url.length <= maxLen) return url;
    r *= 0.75;
  }
  throw new Error("Ảnh quá lớn, hãy chọn ảnh đơn giản hơn");
}

/** Logo: tối đa 600 x 240 px, giữ nền trong suốt (webp, trình duyệt không hỗ trợ thì png) */
export const logoFromFile = (file, maxLen) => imageToDataUrl(file, { maxW: 600, maxH: 240, maxLen, type: "image/webp", quality: 0.9 });

/** Con dấu / chữ ký: tối đa 320 px */
export const sealFromFile = (file) => imageToDataUrl(file, { maxW: 320, maxH: 320, type: "image/png" });
