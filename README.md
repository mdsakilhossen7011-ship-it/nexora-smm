# NEXORA SMM

A separate SMM and gaming top-up panel.

## Repository structure
- `index.html`, `styles.css`, `app.js`: responsive public website and auth screens.
- `dashboard.html`, `dashboard.css`, `dashboard.js`: authenticated user dashboard UI.
- `server/index.js`: Express API with registration, login, logout, session authentication, profile summary, service listing, order creation, order history, wallet ledger, and initial admin read endpoints.
- `database/schema.sql`: PostgreSQL schema for users, sessions, wallet ledger, services, orders, deposits/withdrawals, support tickets, announcements, and audit logs.
- `.env.example`: environment variable template.

## Current implementation status
The codebase is an in-progress production implementation, **not a live service yet**. API routes require a deployed Node.js server and PostgreSQL database. The browser frontend requires the API to be deployed at the same origin under `/api`, or set `window.NEXORA_API_URL` to the API base URL before the page scripts load.

Implemented API capabilities:
- Password hashing with bcrypt.
- Random opaque sessions; only SHA-256 token hashes are stored in PostgreSQL.
- HTTP-only session cookie, security headers, CORS configuration, JSON body limit, and authentication rate limiting.
- User registration/login/logout.
- User profile summary, service catalogue, order history, wallet ledger.
- Transactional order charge and wallet ledger write.
- Admin-protected user and money-request listing endpoints.

Not yet implemented or activated:
- Payment gateway checkout/callback and verified bKash, Nagad, Rocket, or Upay settlement.
- External SMM supplier and game top-up fulfilment adapters.
- Admin UI and complete admin mutation workflows.
- Deposit/withdrawal request creation/review endpoints.
- Support ticket messaging, announcement management, password reset, 2FA, reseller API keys, affiliate commissions, and legal page content.
- Production deployment, domain, SSL, database backups, monitoring, and end-to-end tests.

## Required deployment configuration
1. Node.js 20+ application hosting.
2. PostgreSQL database and a secure `DATABASE_URL`.
3. A random `SESSION_SECRET` of at least 32 characters.
4. Exact production `APP_ORIGIN` and HTTPS.
5. Verified merchant onboarding and API credentials for each payment method.
6. A real SMM supplier API and game top-up provider API, with service IDs, pricing, callback/webhook documentation, and test credentials.

Never commit secrets to GitHub. Put production secrets only in the hosting provider's secret/environment-variable settings.

## Run locally
1. Install Node.js 20+ and PostgreSQL.
2. Create a database and apply `database/schema.sql`.
3. Copy `.env.example` to `.env` and fill the required values.
4. Run `npm install`, then `npm start`.
5. Check `GET /api/health`.

The first admin account must be provisioned securely through a one-time operator process after deployment; public registration must never allow users to choose their own role.


## Free hosting setup (no paid plan required)

This repository includes a Render Blueprint for a single-origin deployment: the Node.js service serves the public website and the API together, so the login session cookie does not need cross-site frontend/API configuration.

1. Create a free PostgreSQL project on Neon and copy its pooled or direct connection string. Keep the password private.
2. Open the Neon SQL Editor and run the complete contents of `database/schema.sql` once.
3. In Render, choose **New → Blueprint**, connect this GitHub repository, and apply `render.yaml`.
4. When Render asks for `DATABASE_URL`, paste the Neon connection string. Keep the generated `SESSION_SECRET`; do not publish it.
5. After deployment, open the Render service URL and check `/api/health`. It should report the database as connected.

Free-tier caveats: Render free web services can sleep when idle and may take time to wake. Neon Free compute scales to zero and has monthly compute/network limits; when limits are reached, database access may pause until the allowance resets. This setup is suitable for development/testing, not a promise of uninterrupted commercial production. Review current provider limits before relying on it.

Order creation is deliberately disabled by default (`ORDER_FULFILMENT_ENABLED=false`) so users cannot be charged before a verified supplier fulfilment workflow exists. Do not turn it on until the provider integration and refund/fulfilment process have been tested. Payment methods are also not connected yet.
