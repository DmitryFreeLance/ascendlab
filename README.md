# BodyLab

Java/Spring Boot Telegram bot + Telegram Mini App for BodyLab.

The bot is intentionally minimal: `/start` opens the Mini App, `/paysupport` gives payment support text, and payment webhooks activate access. The Mini App contains the product experience: onboarding, profile, face analysis, BodyGPT, nutrition diary, academy, MogBattle, plans, settings and payments.

## Stack

- Java 21
- Spring Boot 3.3
- H2 file storage
- Static Mini App served by Spring Boot
- Telegram Bot API
- Telegram Stars invoices
- Crypto Bot / Crypto Pay invoices
- YooKassa card payments with webhooks
- Kie.ai Gemini 2.5 Flash chat completions
- Docker multi-stage build

## Run Locally

```bash
mvn spring-boot:run
```

Open `http://localhost:8080`.

The app starts in demo mode by default, so it works without Telegram secrets. In demo mode the payment modal shows a demo activation button.

## Docker

```bash
docker build -t ascendlab .
docker run --rm -p 8080:8080 --env-file .env -v ascendlab-data:/data ascendlab
```

## Environment

Copy `.env.example` to `.env` and fill what you need.

Required for production:

- `APP_PUBLIC_URL`: public HTTPS URL of the service
- `APP_CONTEXT_PATH`: optional path prefix such as `/ascendlab` when the Mini App shares an existing domain
- `ADMIN_TELEGRAM_IDS`: comma-separated Telegram IDs that can see the Mini App admin panel
- `TELEGRAM_BOT_TOKEN`: token from `@BotFather`
- `TELEGRAM_BOT_USERNAME`: bot username without `@`
- `TELEGRAM_WEBHOOK_SECRET`: long random string
- `TELEGRAM_LONG_POLLING`: set `true` when the bot should read Telegram updates through `getUpdates`
- `APP_DEMO_MODE=false`

AI:

- `KIE_API_KEY`: Kie.ai API key
- `KIE_API_URL`: defaults to `https://api.kie.ai/gemini-2.5-flash/v1/chat/completions`

Crypto Pay:

- `CRYPTO_PAY_TOKEN`
- `CRYPTO_PAY_BASE_URL`
- `CRYPTO_PAY_WEBHOOK_SECRET`

YooKassa card payments:

- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `YOOKASSA_API_URL`
- `YOOKASSA_WEBHOOK_SECRET`

Webhook URL:

```text
https://your-domain.example/api/payments/yookassa/webhook/<YOOKASSA_WEBHOOK_SECRET>
```

## Telegram Setup

1. Create a bot in `@BotFather`.
2. Set the Mini App URL to your `APP_PUBLIC_URL`. You can configure the Main Mini App in BotFather, and the service also calls `setChatMenuButton` on startup when the bot token is present.
3. Use HTTPS. Telegram Mini Apps must be served from a public HTTPS URL in production.
4. Set webhook URL manually or enable startup registration:

```text
https://your-domain.example/api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>
```

Webhook mode:

```text
TELEGRAM_REGISTER_WEBHOOK=true
TELEGRAM_LONG_POLLING=false
```

Long polling mode:

```text
TELEGRAM_REGISTER_WEBHOOK=false
TELEGRAM_LONG_POLLING=true
```

In long polling mode the app calls `deleteWebhook` on startup and then receives `message` and `pre_checkout_query` updates through `getUpdates`. Run only one container per bot token in this mode.

## Telegram Stars

Stars are implemented as invoice links created by the Bot API. For digital goods:

- currency is `XTR`
- `provider_token` is an empty string
- the Mini App opens the returned invoice link through `Telegram.WebApp.openInvoice`
- successful payment is handled in the bot webhook and activates the selected plan

Plan prices are in `src/main/java/lab/ascend/domain/Plan.java`.

## Crypto Bot / Crypto Pay

1. Open `@CryptoBot`.
2. Go to `Crypto Pay`.
3. Create an app and copy the API token.
4. Set:

```text
CRYPTO_PAY_TOKEN=...
CRYPTO_PAY_BASE_URL=https://pay.crypt.bot
CRYPTO_PAY_WEBHOOK_SECRET=...
```

For testnet use:

```text
CRYPTO_PAY_BASE_URL=https://testnet-pay.crypt.bot
```

and create the app through `@CryptoTestnetBot`.

5. Enable webhooks in Crypto Pay and set:

```text
https://your-domain.example/api/payments/crypto/webhook/<CRYPTO_PAY_WEBHOOK_SECRET>
```

The service verifies `crypto-pay-api-signature` with HMAC-SHA-256 before activating access.

## YooKassa Cards

Card payments are implemented through YooKassa API:

1. The Mini App calls `POST /api/payments/card`.
2. The backend creates a YooKassa payment with `capture=true`, `payment_method_data.type=bank_card`, redirect confirmation, and metadata:

```json
{
  "paymentId": "local payment id",
  "telegramId": "Telegram user id",
  "planCode": "quarter"
}
```

3. The Mini App opens YooKassa `confirmation_url`.
4. YooKassa sends `payment.succeeded` or `payment.canceled` to:

```text
https://your-domain.example/api/payments/yookassa/webhook/<YOOKASSA_WEBHOOK_SECRET>
```

5. The backend does not trust the webhook body alone: it fetches the payment from YooKassa by `object.id`, checks the final status and metadata, then activates the plan.

Set up HTTP notifications in YooKassa Merchant Profile: `Integration -> HTTP notifications`, select `payment.succeeded` and `payment.canceled`, and use the webhook URL above.

## Admin Panel

The Mini App shows the admin panel as the last drawer item only for admins.

Seed the first admins with:

```text
ADMIN_TELEGRAM_IDS=123456789,987654321
```

Inside the admin panel you can:

- add another admin by Telegram ID
- edit plan prices in RUB, Telegram Stars and USDT
- change plan badges
- view users, active subscriptions, payments, RUB revenue, analyses and nutrition logs
- view recent payments and recent users

Changed plan prices are stored in H2 and immediately affect new Telegram Stars, Crypto Pay and YooKassa payments.

## Kie.ai Gemini 2.5 Flash

Set `KIE_API_KEY`. BodyGPT uses streaming chat completions. Face analysis and nutrition estimation try Kie.ai when Pro access is active and fall back to local deterministic recommendations if the upstream API is unavailable.

Without an active subscription, BodyGPT intentionally streams the same access message every time.

## About Payment Compliance

For digital goods and services inside Telegram apps, Telegram's current rules require Stars as the payment method. External card checkout can also create App Store / Google Play compliance risk if it is used to sell the same digital access inside the Mini App.

YooKassa also requires a configured merchant account, shop ID and secret key. Keep Stars as the Telegram-native payment path; enable YooKassa cards only when your YooKassa account and product distribution policy are ready.

## Useful Endpoints

- `GET /api/bootstrap`
- `POST /api/chat/stream`
- `POST /api/analysis`
- `GET /api/nutrition`
- `POST /api/nutrition`
- `POST /api/payments/stars`
- `POST /api/payments/crypto`
- `POST /api/payments/card`
- `POST /api/telegram/webhook/{secret}`
- `POST /api/payments/crypto/webhook/{secret}`
- `POST /api/payments/yookassa/webhook/{secret}`
- `GET /api/admin`
- `POST /api/admin/admins`
- `PATCH /api/admin/plans/{code}`

## Verification

```bash
mvn test
```

The test suite covers Telegram Mini App init data validation and Crypto Pay webhook signature verification.
