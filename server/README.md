# KHQRPay Server for Ozo Tools

A lightweight, zero-dependency Node.js backend providing KHQR payment creation and robust webhook handling for Cambodian banking payments (ABA Pay and KHQR apps) via [KHQRPay](https://khqrpay.dev).

## Architecture

- **Zero External Dependencies**: Built entirely with Node.js standard libraries (`http`, `https`, `crypto`, `url`, `fs`, `path`).
- **Security & Integrity**:
  - Raw body HMAC-SHA256 signature verification (`t=<timestamp>,v1=<hex>`).
  - Constant-time comparison via `crypto.timingSafeEqual` prevents timing attacks.
  - Strict 5-minute timestamp tolerance window prevents replay attacks.
  - API secret keys (`kp_live_...`) are server-only and never exposed to client-side code.
- **Webhook Resilience**:
  - Fast 2xx response (< 10ms) with asynchronous fulfillment scheduling (`setImmediate`).
  - In-memory event deduplication on `event.id` with bounded memory capacity (5,000 events FIFO).
  - Out-of-order event handling: preserves orders already marked `paid` against late `payment.expired` events.
  - Supports late payment approval (`data.payment.late = true`) fulfilling after expiration.
  - Production mode guard: ignores simulated test events in production.

## Getting Started

### 1. Configure Environment

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your configuration:
```env
KHQRPAY_API_KEY=kp_live_your_api_key_here
KHQRPAY_WEBHOOK_SECRET=whsec_your_webhook_signing_secret_here
PORT=3000
NODE_ENV=production
```

> **Note**: `.env` is ignored by `.gitignore` to prevent secret leakage in version control.

### 2. Run Tests

Run the complete 11-scenario webhook test suite:
```bash
npm test
# or
node test-webhook.js
```

### 3. Start the Server

```bash
npm start
# or
node server.js
```

## API Endpoints

- `GET /health` — Service status, mode (`live` / `test`), and uptime.
- `POST /api/donate` — Creates a KHQRPay payment, returning `checkout_url` and `qr_string`.
- `GET /api/donate/:orderId` — Checks current order status in memory store.
- `POST /webhook` — KHQRPay webhook receiver for `payment.completed`, `payment.expired`, `payment.scanned`.

## Webhook Deployment Notes

- Endpoint URLs must use `https://` with a public internet address.
- For local development and testing, use an HTTPS tunnel (e.g. `cloudflared` or `ngrok`).
- If using Cloudflare, add a WAF Skip rule for the `/webhook` path so requests are not challenged or blocked by bot protection.
