// Mèo Báo Giá: kiểm thử đơn vị dựng email gốc (MIME). Chạy: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMime, encodeAddress, encodeWord, textToHtml } from "../worker/src/lib/mime.ts";

const decodeWords = (h) =>
  h.replace(/\r\n /g, "").replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));

function parse(raw) {
  const [head, ...rest] = raw.split("\r\n\r\n");
  const headers = {};
  for (const line of head.replace(/\r\n /g, " ").split("\r\n")) {
    const i = line.indexOf(":");
    headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  return { head, headers, body: rest.join("\r\n\r\n") };
}

function parts(raw) {
  const { headers, body } = parse(raw);
  const boundary = headers["content-type"].match(/boundary="([^"]+)"/)[1];
  return body
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((p) => {
      const [h, b] = p.replace(/^\r\n/, "").split("\r\n\r\n");
      return { type: h.match(/Content-Type: ([^;]+)/)[1], charset: /charset=UTF-8/.test(h), body: Buffer.from(b.replace(/\s+/g, ""), "base64").toString("utf8") };
    });
}

const LINK = "https://baogia.example.com/auth/verify?t=abc&x=1";
const base = {
  from: "Mèo Báo Giá <noreply@example.com>",
  to: "khach@example.com",
  subject: "[Mèo Báo Giá] Link đăng nhập: kiểm tra tiêu đề tiếng Việt có dấu dài vẫn được chia đúng",
  text: `Bấm vào link dưới đây để đăng nhập.\n\n${LINK}`,
  html: textToHtml(`Bấm vào link dưới đây để đăng nhập.\n\n${LINK}`),
};

test("Tiêu đề tiếng Việt được mã hóa UTF-8 encoded word và giải mã ra đúng bản gốc", () => {
  const raw = buildMime(base);
  const { head, headers } = parse(raw);
  assert.match(head, /^Subject: =\?UTF-8\?B\?/m);
  assert.equal(decodeWords(headers.subject.replace(/ (?==\?UTF-8)/g, "")), base.subject);
  for (const line of head.split("\r\n")) assert.ok(line.length <= 78, `mỗi dòng header không quá 78 ký tự: ${line}`);
  assert.ok(/^[\x00-\x7f]*$/.test(raw), "email gốc chỉ có ASCII");
});

test("Tên người gửi được mã hóa, địa chỉ giữ nguyên", () => {
  const { headers } = parse(buildMime(base));
  assert.match(headers.from, /^=\?UTF-8\?B\?[^?]+\?= <noreply@example\.com>$/);
  assert.equal(decodeWords(headers.from), "Mèo Báo Giá <noreply@example.com>");
  assert.equal(encodeAddress("Meo Bao Gia <noreply@example.com>"), '"Meo Bao Gia" <noreply@example.com>');
  assert.equal(encodeAddress("noreply@example.com"), "noreply@example.com");
});

test("Có đủ header bắt buộc và hai phần text/plain, text/html", () => {
  const raw = buildMime({ ...base, replyTo: "hello@example.com", headers: { "List-Unsubscribe": "<https://x.test/m/off?t=1>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
  const { headers } = parse(raw);
  for (const k of ["from", "to", "subject", "date", "message-id", "mime-version", "content-type", "reply-to", "list-unsubscribe", "list-unsubscribe-post"]) {
    assert.ok(headers[k], `header ${k}`);
  }
  assert.match(headers["content-type"], /^multipart\/alternative; boundary="/);
  assert.match(headers["message-id"], /^<[0-9a-f]+@example\.com>$/);
  assert.match(headers.date, /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0000$/);
  const ps = parts(raw);
  assert.deepEqual(ps.map((p) => p.type), ["text/plain", "text/html"]);
  assert.ok(ps.every((p) => p.charset));
  assert.equal(ps[0].body, base.text);
  assert.ok(ps[1].body.includes('<a href="https://baogia.example.com/auth/verify?t=abc&amp;x=1">'));
  assert.match(ps[1].body, /đăng nhập\.<br>/);
});

test("Không chèn được header khác bằng ký tự xuống dòng", () => {
  const { head } = parse(buildMime({ ...base, subject: "hi\r\nBcc: evil@example.com" }));
  assert.ok(!/^Bcc:/im.test(head));
});

test("Tiêu đề ASCII giữ nguyên", () => {
  assert.equal(encodeWord("Hello"), "Hello");
});

test("Thân HTML thoát ký tự đặc biệt", () => {
  assert.match(textToHtml("<script>x</script>"), /&lt;script&gt;/);
});
