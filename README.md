# Mèo Báo Giá (meo-bao-gia)

<img src="public/logo.svg" width="72" height="72" alt="Logo Mèo Báo Giá">

Làm báo giá trong một phút, không cần đăng ký.

Công cụ làm báo giá mã nguồn mở cho hộ kinh doanh, doanh nghiệp nhỏ và freelancer Việt Nam. Nhập hạng mục là có ngay một trang báo giá A4, in hoặc lưu PDF từ hộp thoại in của trình duyệt. Gửi báo giá bằng link để khách bấm "Chấp nhận", và mỗi đơn vị có một trang riêng để khách tự gửi yêu cầu báo giá.

- Soạn và in báo giá: miễn phí, không cần đăng ký
- Link chia sẻ, lưu thông tin đơn vị, trang nhận yêu cầu báo giá: đăng nhập bằng email (không mật khẩu)
- Chạy trên tài khoản Cloudflare miễn phí của chính bạn (Workers + D1)
- Giấy phép MIT: ai cũng được dùng, sửa, phân phối miễn phí

Trạng thái: v0.1, bản Việt hóa. Kiểm thử đơn vị đã chạy; chưa triển khai thật trên Cloudflare.

## Tính năng

| Tính năng | Mô tả |
|---|---|
| Trình soạn báo giá | Đơn vị báo giá (tên, người đại diện, mã số thuế, địa chỉ, liên hệ, tài khoản ngân hàng, ảnh con dấu / chữ ký), khách hàng, hạng mục (tên, ĐVT, số lượng, đơn giá), ghi chú, ngày hiệu lực. Xem trước A4 cập nhật theo từng ô nhập |
| Mã số thuế | Kiểm tra định dạng 10 số, 13 số (`0123456789-001`, chi nhánh) hoặc 12 số (CCCD dùng làm MST cá nhân). Chỉ kiểm độ dài, không kiểm chữ số kiểm tra |
| Tính thuế | Có thuế GTGT (10%, 8%, 5%, 0%; đơn giá chưa gồm hoặc đã gồm VAT), hộ kinh doanh (không tách VAT), cá nhân khấu trừ thuế TNCN 10% |
| Làm tròn | Làm tròn, làm tròn xuống, làm tròn lên; đến hàng 1, 10, 100 hoặc 1.000 đồng |
| Số tiền bằng chữ | "Ba triệu năm trăm nghìn bảy trăm năm mươi đồng" (đọc "mốt", "lăm", "linh", "không trăm" đúng cách đọc trên chứng từ), tới dưới 10^18 |
| Số báo giá | `BGYYYYMMDD-NNN`. Khi lưu, máy chủ đánh số theo từng đơn vị, ngày theo giờ Việt Nam |
| In / PDF | Mẫu A4 bằng CSS `@page`, không cần thư viện PDF phía máy chủ. Có ô ký tên "Đại diện đơn vị báo giá" |
| Link chia sẻ | `/q/<id không đoán được>`. Khách bấm "Chấp nhận" thì thời điểm được ghi lại và đơn vị nhận email |
| Trang nhận yêu cầu | `/r/<địa chỉ>`. Khách để lại tên, cách liên hệ, nội dung kèm đồng ý xử lý dữ liệu; đơn vị nhận email và yêu cầu nằm trong "Hộp báo giá" |
| Hộp báo giá | Thông tin đơn vị, danh sách yêu cầu, báo giá đã lưu và trạng thái chấp nhận, bật tắt email giới thiệu, xóa tài khoản |

## Quy tắc tính thuế (cần kiểm tra với kế toán)

Đây là các giả định công cụ đang dùng, không thay cho tư vấn thuế. Việc kê khai và xuất hóa đơn thật hãy hỏi kế toán hoặc đại lý thuế.

- **Có thuế GTGT, đơn giá chưa gồm VAT**: thuế GTGT = cộng tiền hàng x thuế suất, làm tròn theo lựa chọn (mặc định làm tròn đến 1 đồng)
- **Có thuế GTGT, đơn giá đã gồm VAT**: thuế GTGT = tổng x r / (100 + r), tiền hàng = tổng - thuế. Tổng giữ đúng số đã nhập
- **Thuế suất 8%**: mức giảm theo nghị quyết của Quốc hội, chỉ áp dụng cho một số hàng hóa, dịch vụ và trong thời hạn nghị quyết còn hiệu lực. Công cụ không tự kiểm tra điều kiện này
- **Hộ kinh doanh (phương pháp trực tiếp)**: không ghi dòng thuế GTGT riêng, chỉ ghi tổng
- **Cá nhân, khấu trừ TNCN 10%**: khi tổng tiền từ 2.000.000 đồng trở lên, ghi thêm dòng thuế TNCN bên trả tiền khấu trừ (10%) và số thực nhận. Dưới ngưỡng thì không khấu trừ. Trường hợp cá nhân đã nộp cam kết 08/CK-TNCN hoặc có hợp đồng lao động không được xử lý riêng
- Số lượng nhận tới 2 chữ số thập phân; thành tiền từng dòng (số lượng x đơn giá) cũng làm tròn theo lựa chọn

## Cấu trúc

```
public/              Giao diện (static assets của Worker)
  index.html         Trình soạn báo giá (không cần đăng ký)
  app.html           Hộp báo giá (cần đăng nhập)
  privacy.html       Mẫu chính sách bảo vệ dữ liệu cá nhân (người vận hành phải sửa)
  js/core.js         Tính tiền, đọc số bằng chữ, mã số thuế, HTML báo giá. Trình duyệt và máy chủ dùng chung
  css/doc.css        Mẫu báo giá A4 (màn hình và bản in)
worker/              Cloudflare Worker (Hono) + D1
  src/routes/api.ts    JSON API
  src/routes/pages.ts  Báo giá chia sẻ, trang in, trang nhận yêu cầu, xác nhận đăng nhập, link hủy nhận email
  src/lib/consent.ts   Hạn 2 năm của đồng ý nhận email, thời gian lưu, nội dung email xác nhận
  src/lib/marketing.ts Lưu đồng ý, token hủy nhận, tác vụ dọn dẹp hằng ngày
  src/lib/mail.ts      Gửi email (Gmail API hoặc Resend)
  src/lib/mime.ts      Dựng email gốc (MIME)
  migrations/          Schema D1
test/
  core.test.mjs      Kiểm thử đơn vị phần tính toán
  consent.test.mjs   Kiểm thử hạn đồng ý, nội dung email xác nhận
  mail.test.mjs      Kiểm thử email gốc (tiêu đề tiếng Việt, hai phần text và HTML)
  e2e-local.mjs      Kiểm thử tích hợp trên máy
```

## Cài đặt

### 1. Chuẩn bị

- Tài khoản Cloudflare miễn phí
- Node.js 20 trở lên
- (Email) Google Workspace (Gmail API) hoặc Resend. Không có cả hai thì email chỉ được ghi vào log, nghĩa là link đăng nhập cũng không tới được người dùng. Môi trường thật bắt buộc phải có

### 2. Triển khai

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create meo-bao-gia          # chép database_id in ra vào wrangler.toml
npx wrangler d1 migrations apply meo-bao-gia --remote
# Email qua Gmail API: ba giá trị dưới đây (xem mục "Gửi email")
npx wrangler secret put GMAIL_CLIENT_ID
npx wrangler secret put GMAIL_CLIENT_SECRET
npx wrangler secret put GMAIL_REFRESH_TOKEN
# hoặc qua Resend
# npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

Trong `wrangler.toml`:

- `MAIL_FROM`: địa chỉ gửi (Gmail API thì là địa chỉ tài khoản Google đó, Resend thì là địa chỉ thuộc tên miền đã xác minh)
- `CTA_URL`: đổi `your-account` thành tài khoản GitHub của bạn, hoặc trỏ tới trang liên hệ
- `PRIVACY_URL`: để trống thì dùng `public/privacy.html`. **Hãy sửa các chỗ `[trong ngoặc vuông]` trong file đó trước khi chạy thật**
- `DEV_MODE`: môi trường thật bắt buộc là `"0"`

Các link "Mã nguồn" trong `public/*.html` cũng đang trỏ tới `https://github.com/your-account/meo-bao-gia`; khi chạy, trang sẽ tự lấy `CTA_URL` để thay, nhưng nên sửa luôn trong file.

Tác vụ dọn dẹp hằng ngày dùng cron trigger. Gói Workers miễn phí cho tối đa 5 cron trigger mỗi tài khoản; nếu đã dùng đủ 5 thì vẫn deploy được nhưng cron không đăng ký được.

Địa chỉ thật (`APP_URL`), `database_id` thật, tên miền riêng (`routes`) có thể để trong `wrangler.prod.toml` (đã có trong `.gitignore`) rồi deploy bằng `npx wrangler deploy --config wrangler.prod.toml`.

### 3. Gửi email

Đủ ba giá trị `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` thì gửi qua Gmail API; không thì có `RESEND_API_KEY` sẽ gửi qua Resend; không có gì thì chỉ ghi log.

Chuẩn bị Gmail API (tài khoản Google Workspace):

1. Tạo project trong Google Cloud Console, bật Gmail API
2. Tạo màn hình đồng ý OAuth. Tài khoản Workspace chọn loại người dùng "Internal" thì không cần duyệt
3. Trong "Credentials", tạo OAuth client ID loại "Desktop app". Client ID và client secret chính là `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`
4. Đăng nhập bằng tài khoản gửi, chỉ cấp đúng một quyền `https://www.googleapis.com/auth/gmail.send`, lấy refresh token. Ví dụ: trong OAuth 2.0 Playground của Google, bấm biểu tượng bánh răng, chọn "Use your own OAuth credentials", nhập hai giá trị trên, chọn phạm vi `gmail.send`, cấp quyền rồi bấm "Exchange authorization code for tokens"
5. Đưa ba giá trị vào bằng `npx wrangler secret put`. Không in ra màn hình, không commit lên repo
6. Đặt `MAIL_FROM` dạng `Mèo Báo Giá <địa chỉ tài khoản đó>`

## Chạy thử trên máy

```bash
cd worker
npm install
npx wrangler types
npx wrangler d1 migrations apply meo-bao-gia --local
npx wrangler dev --var DEV_MODE:1
```

Với `DEV_MODE:1` và chưa có khóa gửi email, link đăng nhập hiện ngay trên màn hình. Ở cửa sổ khác:

```bash
npm test                                   # kiểm thử đơn vị (trong thư mục worker)
node ../test/e2e-local.mjs http://localhost:8787
```

## Biến cấu hình

| Tên | Loại | Ý nghĩa |
|---|---|---|
| `APP_NAME` | vars | Tên hiện trong tiêu đề email |
| `OPERATOR_NAME` | vars | Tên bên gửi email xác nhận đồng ý nhận email giới thiệu. Để trống thì dùng `APP_NAME` |
| `CTA_URL` | vars | Link nút "Mã nguồn" và dòng "Liên hệ" trong email |
| `APP_URL` | vars | Địa chỉ thật, dùng cho link trong email của tác vụ định kỳ. Để trống thì gửi không kèm link |
| `PRIVACY_URL` | vars | Link chính sách bảo vệ dữ liệu cá nhân. Để trống thì dùng `/privacy.html` |
| `MAIL_FROM` | vars | Địa chỉ gửi email |
| `DEV_MODE` | vars | Chỉ dùng khi chạy thử. Môi trường thật là `"0"` |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | secret | Gửi email qua Gmail API (ưu tiên nếu đủ ba). Chỉ cần quyền `gmail.send` |
| `RESEND_API_KEY` | secret | Gửi email qua Resend khi không có Gmail |

## Bảo mật

- Không lưu mật khẩu. Chỉ dùng link đăng nhập (20 phút, dùng một lần) và phiên (30 ngày), cả hai chỉ lưu mã băm SHA-256
- Mở link trong email phải bấm thêm nút "Đăng nhập", để trình quét bảo mật email mở trước link không dùng mất token
- ID báo giá chia sẻ, phiên, token đăng nhập là số ngẫu nhiên 128 đến 256 bit. Địa chỉ trang nhận yêu cầu là công khai nên chỉ 10 ký tự (khoảng 50 bit)
- Mọi truy vấn, xóa chỉ tìm trong dữ liệu của tài khoản đang đăng nhập. Truy cập yêu cầu hay báo giá của tài khoản khác trả 404
- Tiền luôn do máy chủ tính lại, không dùng tổng tiền giao diện gửi lên
- Cookie HttpOnly, SameSite=Lax; request ghi từ trang khác (Origin không khớp) trả 403
- Giới hạn request: 30 request ghi mỗi phút mỗi người truy cập, 5 link đăng nhập mỗi giờ mỗi email, yêu cầu báo giá 5 lần / 10 phút mỗi người và 100 lần / ngày mỗi đơn vị
- CSP, `Referrer-Policy: no-referrer` (để địa chỉ link chia sẻ không lọt sang trang khác), chặn công cụ tìm kiếm lập chỉ mục trang chia sẻ và trang yêu cầu
- Ảnh con dấu / chữ ký chỉ nằm trong localStorage của trình duyệt, không gửi lên máy chủ. Vì vậy link chia sẻ và trang in phía máy chủ không có ảnh này
- Không gắn công cụ thống kê hay script bên thứ ba nào; chỉ tải font Be Vietnam Pro từ Google Fonts

## Dữ liệu cá nhân và email giới thiệu

Đây là tiêu chuẩn vận hành công cụ đang theo, **không phải tư vấn pháp lý**. Người vận hành tự kiểm tra Nghị định 13/2023/NĐ-CP, Luật Bảo vệ dữ liệu cá nhân và các văn bản hướng dẫn đang có hiệu lực, và Nghị định 91/2020/NĐ-CP nếu gửi email quảng cáo.

| Dữ liệu | Mục đích | Thời gian lưu |
|---|---|---|
| Email đăng ký | Link đăng nhập, thông báo yêu cầu / chấp nhận báo giá | Đến khi xóa tài khoản. Không hoàn tất đăng nhập trong 7 ngày thì xóa |
| Thông tin đơn vị, báo giá | Lưu, chia sẻ báo giá, trang nhận yêu cầu | Đến khi xóa tài khoản (xóa toàn bộ một lần) |
| Yêu cầu báo giá (tên, liên hệ, nội dung, mã băm IP) | Đơn vị tư vấn và phản hồi; mã băm IP để chống gửi tràn | 1 năm kể từ ngày gửi, hoặc sớm hơn nếu đơn vị xóa |
| Tên người chấp nhận báo giá (không bắt buộc) | Ghi nhận việc chấp nhận | Đến khi xóa báo giá hoặc tài khoản |
| Đồng ý nhận email giới thiệu và thời điểm | Quyết định có gửi email giới thiệu không | Đến khi xóa tài khoản. Bản thân đồng ý tự tắt sau 2 năm |

- Mỗi lần xin đồng ý bắt buộc (đăng ký, gửi yêu cầu) đều ghi rõ mục đích, dữ liệu, thời gian lưu, quyền từ chối và hậu quả khi từ chối
- Đồng ý nhận email giới thiệu là mục riêng, không bắt buộc, mặc định không đánh dấu. Không đồng ý vẫn dùng đủ tính năng
- Đồng ý đánh dấu lúc đăng ký chỉ được ghi nhận khi chủ email đăng nhập xong qua link, nên không ai bật được đồng ý thay cho email người khác
- Mỗi lần đồng ý, rút lại hoặc hết hạn đều có email xác nhận. Rút lại bằng ô trong Hộp báo giá hoặc link `/m/off` trong email (một cú bấm, không cần đăng nhập)
- Hạn 2 năm là thực hành tốt để định kỳ hỏi lại, không phải quy định bắt buộc; muốn bỏ thì sửa `MARKETING_TTL_MS` trong `worker/src/lib/consent.ts`
- Tác vụ định kỳ chạy 10 giờ sáng giờ Việt Nam mỗi ngày (`[triggers]` trong `wrangler.toml`)
- Email công cụ đang gửi (link đăng nhập, thông báo yêu cầu / chấp nhận, xác nhận đồng ý) không chứa quảng cáo
- Với dữ liệu khách gửi qua trang nhận yêu cầu, bên kiểm soát dữ liệu là đơn vị sở hữu trang đó
- Phần xin đồng ý có ghi bên xử lý và chuyển dữ liệu ra nước ngoài (Cloudflare, Inc. và Google LLC, đều ở Hoa Kỳ). Dùng Resend thì sửa dòng này

## Chưa làm

- Chưa triển khai thật trên Cloudflare sau khi Việt hóa
- Không kiểm chữ số kiểm tra của mã số thuế, không tra cứu tên doanh nghiệp theo MST
- Mỗi tài khoản chỉ có một đơn vị
- Địa chỉ trang nhận yêu cầu là ngẫu nhiên, chưa đổi được
- Chưa sửa được báo giá đã lưu; sửa thì lưu thành báo giá mới với số mới
- Chưa xuất hóa đơn điện tử (báo giá không phải hóa đơn)

## Nguồn gốc

Mèo Báo Giá được Việt hóa từ dự án mã nguồn mở [gyeonjeok-meo](https://github.com/johndefine404/gyeonjeok-meo) của Define404 (giấy phép MIT). Thông báo bản quyền gốc được giữ trong `LICENSE`.

---

## English

Mèo Báo Giá is an open-source quotation generator for Vietnamese household businesses, small companies and freelancers. It validates the tax code format (10, 13 or 12 digits), computes VAT at 10%, 8%, 5% or 0% (exclusive or inclusive), handles household businesses that do not itemize VAT and the 10% personal income tax withholding for individuals (from 2,000,000 VND), writes the amount in Vietnamese words, and prints a single A4 page via CSS `@page`. Signed-up users get share links with an "accept" button and a per-business quote request page. Passwordless email login (magic link), hashed tokens, per-account scoping, rate limits. Runs on Cloudflare Workers (Hono) + D1. Mail via the Gmail API or Resend. Tax rules are assumptions, not tax advice. MIT licensed; adapted from Define404's gyeonjeok-meo.
