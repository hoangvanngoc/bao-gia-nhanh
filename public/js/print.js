// Báo Giá Nhanh: trang in, nút in và co giãn theo màn hình
import { fitSheets } from "./fit.js";

fitSheets();
for (const b of document.querySelectorAll("[data-print]")) b.addEventListener("click", () => window.print());
