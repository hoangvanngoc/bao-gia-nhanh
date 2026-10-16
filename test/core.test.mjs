// Mèo Báo Giá: kiểm thử đơn vị module tính toán. Chạy: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateTaxCode,
  formatTaxCode,
  toVietnameseNumber,
  amountInWords,
  calcQuote,
  roundDiv,
  normalizeQuote,
  renderQuoteHtml,
} from "../public/js/core.js";

test("Mã số thuế: đúng định dạng", () => {
  for (const n of ["0100109106", "0100109106-001", "0100109106001", "001099012345", " 0312 345 678 "]) {
    assert.equal(validateTaxCode(n), true, n);
  }
});

test("Mã số thuế: sai định dạng", () => {
  for (const n of ["", "12345", "01001091061", "01001091060011", "abc"]) {
    assert.equal(validateTaxCode(n), false, n);
  }
});

test("Mã số thuế: định dạng hiển thị", () => {
  assert.equal(formatTaxCode("0100109106001"), "0100109106-001");
  assert.equal(formatTaxCode("0100109106"), "0100109106");
  assert.equal(formatTaxCode("123"), "123");
});

test("Đọc số bằng chữ", () => {
  const cases = [
    [0, "không"],
    [5, "năm"],
    [10, "mười"],
    [11, "mười một"],
    [15, "mười lăm"],
    [21, "hai mươi mốt"],
    [25, "hai mươi lăm"],
    [44, "bốn mươi bốn"],
    [105, "một trăm linh năm"],
    [110, "một trăm mười"],
    [1000, "một nghìn"],
    [1005, "một nghìn không trăm linh năm"],
    [1_050_000, "một triệu không trăm năm mươi nghìn"],
    [3_500_750, "ba triệu năm trăm nghìn bảy trăm năm mươi"],
    [1_000_000_000, "một tỷ"],
    [1_000_000_005, "một tỷ không trăm linh năm"],
    [2_500_000_000_000, "hai nghìn năm trăm tỷ"],
    [123_456_789, "một trăm hai mươi ba triệu bốn trăm năm mươi sáu nghìn bảy trăm tám mươi chín"],
  ];
  for (const [n, s] of cases) assert.equal(toVietnameseNumber(n), s, String(n));
  assert.equal(toVietnameseNumber("1.000.000"), "một triệu");
  assert.equal(amountInWords(1_000_000), "Một triệu đồng");
  assert.equal(amountInWords(0), "Không đồng");
  assert.throws(() => toVietnameseNumber(-1));
  assert.throws(() => toVietnameseNumber(10n ** 18n));
  assert.throws(() => toVietnameseNumber(1.5e300));
});

test("Làm tròn", () => {
  assert.equal(roundDiv(15, 10, "floor"), 1);
  assert.equal(roundDiv(15, 10, "round"), 2);
  assert.equal(roundDiv(11, 10, "ceil"), 2);
  assert.equal(roundDiv(12345, 1, "floor", 10), 12340);
  assert.equal(roundDiv(12345, 1, "round", 100), 12300);
  assert.equal(roundDiv(12350, 1, "round", 100), 12400);
});

const base = (over = {}) => ({ taxMode: "vat", vatRate: 10, vatIncluded: false, items: [], ...over });

test("GTGT 10%, đơn giá chưa thuế", () => {
  const t = calcQuote(base({ items: [{ qty: 3, unitPrice: 33_333 }, { qty: 1, unitPrice: 1_005 }] }));
  assert.equal(t.supply, 101_004);
  assert.equal(t.vat, 10_100); // 10.100,4 làm tròn
  assert.equal(t.total, 111_104);
});

test("GTGT: làm tròn lên / xuống theo lựa chọn", () => {
  assert.equal(calcQuote(base({ items: [{ qty: 1, unitPrice: 105 }] })).vat, 11); // 10,5 làm tròn
  assert.equal(calcQuote(base({ items: [{ qty: 1, unitPrice: 105 }], rounding: { mode: "floor", unit: 1 } })).vat, 10);
});

test("GTGT 8% và 5%", () => {
  const a = calcQuote(base({ vatRate: 8, items: [{ qty: 1, unitPrice: 1_000_000 }] }));
  assert.deepEqual([a.rate, a.vat, a.total], [8, 80_000, 1_080_000]);
  const b = calcQuote(base({ vatRate: 5, items: [{ qty: 2, unitPrice: 150_000 }] }));
  assert.deepEqual([b.vat, b.total], [15_000, 315_000]);
  const z = calcQuote(base({ vatRate: 0, items: [{ qty: 1, unitPrice: 500_000 }] }));
  assert.deepEqual([z.vat, z.total], [0, 500_000]);
});

test("GTGT: đơn giá đã gồm thuế", () => {
  const t = calcQuote(base({ vatIncluded: true, items: [{ qty: 1, unitPrice: 110_000 }] }));
  assert.deepEqual([t.vat, t.supply, t.total], [10_000, 100_000, 110_000]);
  const u = calcQuote(base({ vatIncluded: true, items: [{ qty: 1, unitPrice: 100_000 }] }));
  assert.equal(u.vat, 9_091); // 9.090,9 làm tròn
  assert.equal(u.supply + u.vat, 100_000);
  const e = calcQuote(base({ vatRate: 8, vatIncluded: true, items: [{ qty: 1, unitPrice: 108_000 }] }));
  assert.deepEqual([e.vat, e.supply], [8_000, 100_000]);
});

test("Số lượng thập phân", () => {
  assert.equal(calcQuote(base({ items: [{ qty: 0.5, unitPrice: 33_333 }] })).lines[0], 16_667);
});

test("Hộ kinh doanh: không có dòng thuế GTGT", () => {
  const t = calcQuote(base({ taxMode: "direct", items: [{ qty: 2, unitPrice: 50_000 }] }));
  assert.equal(t.vat, 0);
  assert.equal(t.total, 100_000);
});

test("Cá nhân: khấu trừ TNCN 10% từ 2.000.000 đ", () => {
  const a = calcQuote(base({ taxMode: "freelancer", items: [{ qty: 1, unitPrice: 1_999_999 }] }));
  assert.deepEqual([a.pit, a.net], [0, 1_999_999], "dưới ngưỡng không khấu trừ");
  const b = calcQuote(base({ taxMode: "freelancer", items: [{ qty: 1, unitPrice: 2_000_000 }] }));
  assert.deepEqual([b.pit, b.net], [200_000, 1_800_000]);
  const c = calcQuote(base({ taxMode: "freelancer", items: [{ qty: 1, unitPrice: 3_333_333 }] }));
  assert.deepEqual([c.pit, c.net], [333_333, 3_000_000]);
});

test("Làm sạch dữ liệu vào: không giữ ảnh con dấu trên máy chủ, chặn giá trị lạ", () => {
  const q = normalizeQuote({
    taxMode: "evil",
    vatRate: 7,
    supplier: { name: "<b>Tên</b>", taxCode: "0100109106", seal: "data:image/png;base64,AAAA" },
    items: [{ name: "a", qty: "-5", unitPrice: "1e20" }, {}],
  });
  assert.equal(q.taxMode, "vat");
  assert.equal(q.vatRate, 10);
  assert.equal(q.supplier.seal, "");
  assert.equal(q.items.length, 1);
  assert.equal(q.items[0].qty, 0);
  assert.equal(q.items[0].unitPrice, 1_000_000_000_000);
  const html = renderQuoteHtml(q);
  assert.ok(html.includes("&lt;b&gt;Tên&lt;/b&gt;"));
  assert.ok(!html.includes("<b>Tên"));
  const k = normalizeQuote({ supplier: { seal: 'data:image/png;base64,AA" onerror="x' } }, { keepSeal: true });
  assert.equal(k.supplier.seal, "");
});

test("HTML báo giá: tiêu đề, bằng chữ, thuế suất", () => {
  const q = normalizeQuote({ ...base({ vatRate: 8 }), supplier: { name: "A" }, client: { name: "B" }, items: [{ name: "x", qty: 1, unitPrice: 1_000_000 }] });
  const html = renderQuoteHtml(q);
  for (const s of ["BÁO GIÁ", "Thuế GTGT (8%)", "Bằng chữ: Một triệu không trăm tám mươi nghìn đồng.", "1.080.000"]) assert.ok(html.includes(s), s);
  assert.ok(!html.includes(String.fromCharCode(0x2014)), "không có dấu gạch dài");
});
