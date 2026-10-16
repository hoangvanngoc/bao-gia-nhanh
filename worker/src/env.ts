// Mèo Báo Giá: kiểu binding môi trường của Worker
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  LIMITER?: RateLimit;

  APP_NAME: string;
  CTA_URL: string;
  PRIVACY_URL?: string;
  OPERATOR_NAME: string;
  APP_URL?: string;
  MAIL_FROM: string;
  DEV_MODE?: string;

  RESEND_API_KEY?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
}

export type Account = {
  id: string;
  email: string;
  marketing_consent: number;
  marketing_consent_at: string | null;
};

export type Vars = { account: Account | null };

export type AppEnv = { Bindings: Env; Variables: Vars };
