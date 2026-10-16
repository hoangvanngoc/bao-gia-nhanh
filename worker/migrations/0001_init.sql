-- Mèo Báo Giá: schema ban đầu

-- Tài khoản đăng ký bằng email. Không có mật khẩu, chỉ đăng nhập bằng link gửi qua email
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  privacy_consent_at TEXT NOT NULL,              -- bắt buộc: thời điểm đồng ý xử lý dữ liệu cá nhân
  marketing_consent INTEGER NOT NULL DEFAULT 0,  -- không bắt buộc: đồng ý nhận email giới thiệu
  marketing_consent_at TEXT,                     -- thời điểm đồng ý hoặc rút lại
  unsub_token TEXT,                              -- token của link hủy nhận, chỉ dùng để tắt đồng ý
  verified_at TEXT,                              -- lần đầu đăng nhập qua link email
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX accounts_unsub ON accounts(unsub_token);
CREATE INDEX accounts_marketing ON accounts(marketing_consent, marketing_consent_at);

-- Link đăng nhập. Không lưu token gốc, chỉ lưu SHA-256
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  marketing INTEGER NOT NULL DEFAULT 0,  -- đồng ý nhận email đánh dấu lúc đăng ký, chỉ ghi nhận khi đăng nhập xong qua link
  created_at INTEGER NOT NULL
);
CREATE INDEX login_tokens_account ON login_tokens(account_id, created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id);

-- Thông tin đơn vị (mỗi tài khoản một đơn vị). slug = địa chỉ trang nhận yêu cầu báo giá
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  tax_code TEXT NOT NULL DEFAULT '',      -- mã số thuế, chỉ chữ số (10, 12 hoặc 13 số)
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  bank TEXT NOT NULL DEFAULT '',          -- tài khoản ngân hàng in trên báo giá
  notify_email TEXT NOT NULL DEFAULT '',  -- để trống thì gửi thông báo về email đăng nhập
  intro TEXT NOT NULL DEFAULT '',         -- lời giới thiệu trên trang nhận yêu cầu
  seq_date TEXT NOT NULL DEFAULT '',      -- ngày của số báo giá (YYYYMMDD, giờ Việt Nam)
  seq INTEGER NOT NULL DEFAULT 0,         -- số thứ tự báo giá trong ngày
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Báo giá đã lưu. Chính id là bí mật của link chia sẻ (số ngẫu nhiên 128 bit)
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  data TEXT NOT NULL,                     -- JSON kết quả normalizeQuote (không có ảnh con dấu)
  total INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  accepted_at TEXT,
  accepted_name TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX quotes_business ON quotes(business_id, created_at);

-- Yêu cầu báo giá khách gửi qua trang /r/<slug>
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  details TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX requests_business ON requests(business_id, created_at);
CREATE INDEX requests_ip ON requests(ip_hash, created_at);
