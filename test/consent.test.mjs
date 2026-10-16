// Mèo Báo Giá: kiểm thử đơn vị quy tắc đồng ý nhận email (hết hạn 2 năm, nội dung email xác nhận)
import { test } from "node:test";
import assert from "node:assert/strict";
import { marketingActive, marketingCutoffIso, marketingNotice, MARKETING_TTL_MS } from "../worker/src/lib/consent.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-10-09T05:00:00Z");

test("Đồng ý chỉ còn hiệu lực khi đang bật và chưa quá 2 năm", () => {
  assert.equal(marketingActive(1, new Date(now - 30 * DAY).toISOString(), now), true);
  assert.equal(marketingActive(1, new Date(now - 729 * DAY).toISOString(), now), true);
  assert.equal(marketingActive(1, new Date(now - 732 * DAY).toISOString(), now), false, "quá 2 năm thì hết hạn");
  assert.equal(marketingActive(0, new Date(now).toISOString(), now), false, "đã rút lại");
  assert.equal(marketingActive(1, null, now), false, "không có thời điểm");
  assert.equal(marketingCutoffIso(now), new Date(now - MARKETING_TTL_MS).toISOString());
});

const base = { when: "14:05 09/10/2026", email: "a@example.com", app: "Mèo Báo Giá", operator: "Mèo Báo Giá", contact: "https://github.com/example/meo-bao-gia", appUrl: "https://q.example.com/app.html" };

test("Email xác nhận đồng ý: bên gửi, liên hệ, link hủy nhận", () => {
  const m = marketingNotice({ ...base, kind: "consent", offUrl: "https://q.example.com/m/off?t=x" });
  assert.equal(m.subject, "[Mèo Báo Giá] Kết quả xử lý đồng ý nhận email giới thiệu");
  for (const s of ["Bạn đã đồng ý", "14:05 09/10/2026", "a@example.com", "Bên gửi: Mèo Báo Giá", "Liên hệ: https://github.com/example/meo-bao-gia", "https://q.example.com/m/off?t=x", "2 năm", "không mất phí"]) {
    assert.ok(m.text.includes(s), s);
  }
});

test("Email xác nhận rút lại / hết hạn", () => {
  const w = marketingNotice({ ...base, kind: "withdraw" });
  assert.ok(w.text.includes("rút lại"));
  assert.ok(w.text.includes("Bên gửi: Mèo Báo Giá"));
  const e = marketingNotice({ ...base, kind: "expired", appUrl: "" });
  assert.ok(e.text.includes("quá 2 năm"));
  assert.ok(!e.text.includes("undefined"));
  assert.ok(!e.text.includes(": \n"));
});

test("Không có dấu gạch dài trong nội dung", () => {
  for (const kind of ["consent", "withdraw", "expired"]) assert.ok(!marketingNotice({ ...base, kind }).text.includes(String.fromCharCode(0x2014)));
});
