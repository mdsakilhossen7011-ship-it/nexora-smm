# NEXORA SMM

A separate SMM and gaming top-up panel project.

## Current foundation
- Responsive homepage based on the visual references supplied by the project owner.
- Login and account-creation page layouts.
- Service-category presentation for Facebook, Instagram, TikTok, YouTube, Telegram, and gaming top-ups.
- Basic navigation and mobile menu.
- Dark-first visual system with a theme toggle control.

## Implementation status
This is a frontend foundation only. Authentication, wallet balances, deposits, withdrawals, order processing, live order events, support tickets, admin controls, and provider integrations are **not connected or operational yet**. The interface does not pretend that these backend features are live.

## Planned implementation sequence
1. Secure backend, data model, and authentication.
2. User accounts, profile, wallet ledger, deposit and withdrawal workflows.
3. Service catalogue, order lifecycle, provider/API integration, and order history.
4. Support tickets and admin operations with server-side authorization and audit trails.
5. Legal pages, verified payment/provider integrations, testing, and deployment configuration.

## Security principles
- Never trust client-side role flags or client-submitted wallet balances.
- Keep provider credentials and payment secrets server-side.
- Use server-side authorization for all administrative and financial actions.
- Record financial changes in an auditable ledger.
- Do not launch real payments or orders until provider credentials, callbacks, and verification are tested.

## Local preview
Open `index.html` in a browser or serve the repository with a static development server.
