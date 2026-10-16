// Mèo Báo Giá: thu nhỏ trang A4 (.sheet) cho vừa bề ngang màn hình. Khi in, doc.css trả về cỡ thật
// Màn hình hẹp hơn 600px: bấm "Xem cỡ thật" để xem 100%, chỉ cuộn ngang bên trong khung tài liệu
// (bản thân trang không bị tràn ngang)
const NARROW = matchMedia("(max-width: 599.98px)");

function zoomBar(box) {
  let bar = box.previousElementSibling;
  if (bar?.classList.contains("zoom-bar")) return bar;
  bar = document.createElement("div");
  bar.className = "zoom-bar no-print";
  bar.innerHTML = `<button class="btn ghost small" type="button" aria-pressed="false">Xem cỡ thật</button><span class="hint" data-zoom-hint>Chữ nhỏ quá thì bấm Xem cỡ thật</span>`;
  bar.querySelector("button").addEventListener("click", () => {
    box.classList.toggle("zoom");
    fitSheets();
    if (box.classList.contains("zoom")) box.scrollLeft = 0;
  });
  box.before(bar);
  return bar;
}

export function fitSheets() {
  for (const box of document.querySelectorAll(".sheet-scroll")) {
    const sheet = box.querySelector(".sheet");
    const doc = sheet?.querySelector(".doc");
    if (!sheet || !doc) continue;
    const bar = zoomBar(box);
    const zoom = NARROW.matches && box.classList.contains("zoom");
    box.classList.toggle("zoomed", zoom);
    const btn = bar.querySelector("button");
    btn.textContent = zoom ? "Thu vừa màn hình" : "Xem cỡ thật";
    btn.setAttribute("aria-pressed", String(zoom));
    bar.querySelector("[data-zoom-hint]").textContent = zoom ? "Vuốt ngang để xem hết. Bản in không thay đổi" : "Chữ nhỏ quá thì bấm Xem cỡ thật";

    sheet.style.transform = "none";
    if (zoom) {
      box.style.height = "";
      continue;
    }
    const natural = doc.offsetWidth;
    const scale = Math.min(1, box.clientWidth / natural);
    sheet.style.transform = scale < 1 ? `scale(${scale})` : "none";
    box.style.height = `${Math.ceil(doc.offsetHeight * scale)}px`;
  }
}

let raf = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(fitSheets);
});
NARROW.addEventListener?.("change", fitSheets);
document.fonts?.ready.then(fitSheets);
