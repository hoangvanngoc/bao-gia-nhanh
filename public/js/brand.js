// Báo Giá Nhanh: ô chọn màu chủ đạo (bảng màu gợi ý + màu tự chọn), cảnh báo khi màu quá nhạt
import { BRAND_SWATCHES, DEFAULT_BRAND, contrastOnWhite } from "./core.js";

/**
 * Vẽ ô chọn màu vào box. getValue() trả màu hiện tại, onChange(màu) gọi khi người dùng chọn.
 * hint là phần tử hiện cảnh báo tương phản. Trả về hàm refresh() để vẽ lại theo giá trị mới.
 */
export function brandPicker(box, hint, getValue, onChange) {
  box.innerHTML =
    BRAND_SWATCHES.map((c) => `<button type="button" class="swatch" style="background:${c}" data-color="${c}" aria-label="Màu ${c}" aria-pressed="false"></button>`).join("") +
    `<input type="color" aria-label="Màu tự chọn" data-custom>`;
  const custom = box.querySelector("[data-custom]");

  function refresh() {
    const v = getValue() || DEFAULT_BRAND;
    for (const b of box.querySelectorAll(".swatch")) b.setAttribute("aria-pressed", String(b.dataset.color === v));
    custom.value = v;
    const ratio = contrastOnWhite(v);
    hint.className = "hint" + (ratio < 4.5 ? " bad" : "");
    hint.textContent = ratio < 4.5 ? "Màu này hơi nhạt, chữ màu này sẽ khó đọc khi in. Nên chọn màu đậm hơn." : "";
  }

  box.addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    onChange(b.dataset.color);
    refresh();
  });
  custom.addEventListener("input", () => {
    onChange(custom.value.toLowerCase());
    refresh();
  });
  refresh();
  return refresh;
}
