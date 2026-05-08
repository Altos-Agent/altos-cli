# Frontend UI and UX Review
Date: 2026-05-08
Repository audit scope: Dashboard, wallet pages, transaction history, settings, Telegram UX, Basescan links, empty/loading/error states, dark mode, and dangerous action safeguards.
Verdict/status: PARTIAL. The dashboard is useful for local demo; live-mode UX needs stronger safeguards and clearer operational feedback.

## Dashboard Quality

Status: IMPLEMENTED. The web app has a consistent dark shell in `apps/web/components/app-shell.tsx`, navigation in `apps/web/components/sidebar-nav.tsx`, and dashboard pages under `apps/web/app/(app)`.

Positive:

- Demo Mode badge when `DEMO_MODE=true`.
- Dry Run badge when `DRY_RUN` is not false.
- Live Mode warning when `DRY_RUN=false`.
- Chain/RPC status displayed in header.

Gap: `process.env.DEMO_MODE` and `DRY_RUN` in server-rendered web components may not always reflect the API process if web and API run with different env values. Prefer API-provided runtime status for UI safety badges.

## Wallet Pages

Status: PARTIAL.

Implemented: wallet list, detail pages, import form, balances, pair rules, schedules, allowances, dry-run and execute-once cards.

Gaps:

| Severity | Status | Gap | Fix |
|---|---|---|---|
| HIGH | PARTIAL | Dangerous wallet activation and live controls need more explicit risk context. | Require typed confirmation and show current global live status from API. |
| MEDIUM | PARTIAL | Some wallet action buttons appear disabled where bulk status routes exist. | Wire individual pause/resume/disable or remove disabled controls. |
| MEDIUM | MISSING | No vault lock/unlock UI. | Add once vault status exists. |

## Transaction History Pages

Status: IMPLEMENTED/PARTIAL. Transaction list/detail and refresh button exist. Basescan links are present where transaction rows have URLs.

Missing:

- Pending confirmation depth display.
- Replaced/dropped/stuck transaction states.
- Filters by wallet/status/action.
- Clear distinction between demo fake links and real explorer links.

## Settings Pages

Status: PARTIAL. Security and Telegram settings pages exist. Security settings mostly document state rather than enforce auth/vault/live-mode policy.

## Telegram Settings UX

Status: IMPLEMENTED/PARTIAL. Telegram settings form supports token, chat ID, preferences, save, and test. Token preview is returned by API.

Needed:

- Strong warning that Telegram chats are third-party infrastructure.
- Test send result should include redacted delivery status and timestamp.
- Avoid silent failure if Telegram API is unreachable.

## Basescan Link Usability

Status: IMPLEMENTED. Basescan builders exist and UI displays links. Demo links use valid-looking fake hashes with `?demo=true`.

Needed: UI should badge demo links as demo/fake so users do not confuse them with real submitted transactions.

## Empty, Loading, and Error States

Status: PARTIAL.

`apps/web/app/(app)/loading.tsx` and `LoadingCard` exist. However `safeFetchJson` returns null/empty data on backend errors, which can make real failures look like empty states. UI should distinguish empty state from API offline/error state.

## Dark Mode Quality

Status: IMPLEMENTED. Dark mode is coherent and readable. Future improvements: check contrast systematically and test mobile layout with real data volumes.

## Clarity for Dangerous Actions

| Severity | Status | Action | Needed safeguard |
|---|---|---|---|
| HIGH | PARTIAL | Execute once | API status, wallet status, pair, router, amount, quote, max loss, and explicit typed confirmation. |
| HIGH | PARTIAL | Approve | Exact allowance explanation, spender address, token decimals, existing allowance, revoke path. |
| HIGH | PARTIAL | Enable token/pair/router | Verified address/source and operator approval. |
| MEDIUM | PARTIAL | Scheduler start | Show dry-run/live scheduler mode and pending jobs. |

## Missing UX Safeguards

1. API-backed global live status banner.
2. Vault locked/unlocked indicator.
3. Global emergency pause control.
4. Idempotency/pending transaction UI.
5. Live-mode readiness checklist embedded in settings.
6. E2E-tested demo happy path.

