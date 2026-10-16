// Báo Giá Nhanh: báo giá được chia sẻ, nút chấp nhận
import { fitSheets } from "./fit.js";

fitSheets();
const form = document.querySelector("form[data-accept]");
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = form.querySelector(".msg");
  const btn = form.querySelector("button");
  btn.disabled = true;
  msg.className = "msg";
  msg.textContent = "Đang gửi";
  try {
    const res = await fetch(`/api/quotes/${encodeURIComponent(form.dataset.accept)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.elements.name.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không gửi được xác nhận");
    const done = document.createElement("p");
    done.className = "accept-done";
    done.textContent = `Đã chấp nhận lúc ${data.acceptedAt}. Bên báo giá đã nhận được thông báo.`;
    form.replaceWith(done);
  } catch (err) {
    msg.className = "msg bad";
    msg.textContent = err.message;
    btn.disabled = false;
  }
});
