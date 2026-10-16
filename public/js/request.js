// Mèo Báo Giá: trang nhận yêu cầu báo giá, khách gửi yêu cầu
const form = document.querySelector("form[data-request]");
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = form.querySelector(".msg");
  const btn = form.querySelector("button[type=submit]");
  const f = form.elements;
  if (!f.consent.checked) {
    msg.className = "msg bad";
    msg.textContent = "Hãy đánh dấu đồng ý xử lý dữ liệu cá nhân";
    return;
  }
  btn.disabled = true;
  msg.className = "msg";
  msg.textContent = "Đang gửi";
  try {
    const res = await fetch(`/api/r/${encodeURIComponent(form.dataset.request)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name.value,
        contact: f.contact.value,
        details: f.details.value,
        website: f.website.value,
        consent: f.consent.checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Không gửi được");
    form.innerHTML = '<p class="msg good">Đã gửi yêu cầu. Chúng tôi sẽ liên hệ lại sau khi xem.</p>';
  } catch (err) {
    msg.className = "msg bad";
    msg.textContent = err.message;
    btn.disabled = false;
  }
});
